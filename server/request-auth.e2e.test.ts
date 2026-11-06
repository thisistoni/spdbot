// A real self-hosted server, asked the way a browser on its own machine asks: refused until it signs in once, while
// the CLI keeps working and a development server keeps trusting its local browser.
import { request } from "node:http";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { launchVerificationServer, type VerificationServer } from "../scripts/control-omb.ts";
import { BROWSER_SIGN_IN } from "./request-auth.ts";

/** Headers set exactly as given: Chrome's Sec-Fetch-* and Origin, which a page cannot change. */
function raw(url: string, path: string, headers: Record<string, string>, method = "GET", body?: string) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const target = new URL(path, url);
    const call = request({ hostname: target.hostname, port: target.port, path: target.pathname, method, headers: { host: target.host, ...headers } }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    call.on("upgrade", (res, socket) => { socket.destroy(); resolve({ status: res.statusCode ?? 0, headers: res.headers, body: "" }); });
    call.on("error", reject);
    call.end(body);
  });
}

const fromPage = (origin: string) => ({ origin, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" });
const otherPage = { origin: "http://localhost:3000", "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "empty" };
const navigation = { "sec-fetch-site": "none", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "sec-fetch-user": "?1" };

it("protects sensitive GET routes on the desktop's isolated server while admitting its owner", async () => {
  const owner = randomBytes(32).toString("base64url");
  const realFetch = globalThis.fetch;
  let fixture: VerificationServer | undefined;
  try {
    // The shared launcher also makes an owner-only PATCH to pin the starter name.
    globalThis.fetch = (input, init = {}) => realFetch(input, { ...init,
      headers: { ...Object.fromEntries(new Headers(init.headers)), "x-openmausbot-desktop-owner": owner } });
    try {
      fixture = await launchVerificationServer({ ...process.env, OMB_DEV_TRUST_LOCAL_BROWSER: "0", OMB_TEST_DESKTOP_OWNER_TOKEN: owner });
    } finally { globalThis.fetch = realFetch; }
    const url = fixture.info.url;
    const ownerHeaders = { "x-openmausbot-desktop-owner": owner };
    const bots = JSON.parse((await raw(url, "/api/bots", ownerHeaders)).body).bots;
    const bot = bots[0] as { id: string };
    const sensitive = ["/api/local-computer", `/api/bots/${bot.id}/local-computer`, "/api/webhooks/missing-hook/address",
      `/api/bots/${bot.id}/connector-cards/missing-card/status`, "/api/desktop-viewer/local/shared"];
    const evidence: unknown[] = [];
    for (const path of sensitive) {
      for (const [caller, headers, status] of [
        ["anonymous", {}, 403], ["wrong-owner", { "x-openmausbot-desktop-owner": "fake-wrong-owner" }, 403],
        ["unsigned-browser", fromPage(url), 401],
        ["forwarded-host", { host: "hosted.example.test", "x-forwarded-proto": "https", ...ownerHeaders }, 403],
      ] as const) {
        const response = await raw(url, path, headers);
        expect(response.status, `${caller} ${path}`).toBe(status);
        evidence.push({ path, caller, status: response.status });
      }
    }
    for (const path of ["/api/local-computer", `/api/bots/${bot.id}/local-computer`]) {
      expect((await raw(url, path, ownerHeaders)).status, path).toBe(200);
    }
    // These missing resources pass authentication and return 404.
    for (const path of [`/api/bots/${bot.id}/connector-cards/missing-card/status`, "/api/webhooks/missing-hook/address"]) {
      expect((await raw(url, path, ownerHeaders)).status, path).toBe(404);
    }
    for (const path of ["/api/bots", "/api/webhooks", "/api/local-computer/instances"]) {
      expect((await raw(url, path, {})).status, path).toBe(200);
    }
    const pairing = await raw(url, "/api/auth/pairing", { ...ownerHeaders, "content-type": "application/json" }, "POST", "{}");
    expect(pairing.status).toBe(200);
    const { code } = JSON.parse(pairing.body) as { code: string };
    const paired = await raw(url, "/api/auth/pair", { "content-type": "application/json" }, "POST", JSON.stringify({ code, label: "Fixture paired caller" }));
    expect(paired.status).toBe(200);
    const { token } = JSON.parse(paired.body) as { token: string };
    expect((await raw(url, "/api/local-computer", { authorization: `Bearer ${token}` })).status).toBe(200);
    writeFileSync(fixture.info.logPath.replace(/\.log$/, "-sensitive-gets.json"), JSON.stringify({
      logPath: fixture.info.logPath, ownerLocalVmStatus: 200, pairedLocalVmStatus: 200, evidence,
    }, null, 2));
    console.info("sensitive GET fixture", fixture.info.logPath);
  } finally {
    globalThis.fetch = realFetch;
    await fixture?.close();
  }
}, 60_000);

describe("a browser on a self-hosted server's own machine", () => {
  it("is refused until it signs in once with a pairing code, while the CLI keeps working", async () => {
    const fixture = await launchVerificationServer({ OMB_DEV_TRUST_LOCAL_BROWSER: "0" });
    const url = fixture.info.url;
    try {
      for (const headers of [fromPage(url), otherPage, navigation]) {
        for (const [method, path] of [["GET", "/api/bots"], ["GET", "/api/config"], ["GET", "/api/auth/session"], ["PATCH", "/api/config"]]) {
          const refused = await raw(url, path!, { ...headers, "content-type": "application/json" }, method, method === "PATCH" ? "{}" : undefined);
          expect(refused.status, `${method} ${path}`).toBe(401);
          expect(JSON.parse(refused.body).error).toBe(BROWSER_SIGN_IN);
        }
      }
      const socket = await raw(url, "/api/desktop-viewer/local/shared/websockify", {
        origin: url, upgrade: "websocket", connection: "Upgrade", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      });
      expect(socket.status).toBe(401);
      // Public routes still answer a stranger: the sign-in page needs them.
      expect(await raw(url, "/api/health", fromPage(url)).then((answer) => JSON.parse(answer.body))).toEqual({ app: "spdbot" });

      // The CLI is Node's fetch, which sends Sec-Fetch-Mode alone.
      const cli = await fetch(`${url}/api/bots`);
      expect(cli.status).toBe(200);
      const opened = await fetch(`${url}/api/auth/pairing`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const { code } = await opened.json() as { code: string };

      const paired = await raw(url, "/api/auth/pair", { ...fromPage(url), "content-type": "application/json" }, "POST", JSON.stringify({ code, label: "This browser", cookie: true }));
      expect(paired.status).toBe(200);
      const cookie = String(paired.headers["set-cookie"]).split(";", 1)[0]!;
      const signedIn = await raw(url, "/api/bots", { ...fromPage(url), cookie });
      expect(signedIn.status).toBe(200);
      expect(JSON.parse(signedIn.body).bots).toHaveLength(1);
      // The cookie is for this page only: another page on this machine still gets nothing.
      expect((await raw(url, "/api/bots", { ...otherPage, cookie })).status).toBe(403);
    } finally {
      await fixture.close();
    }
  }, 60_000);

  it("is trusted as before by a development server, which asked for it", async () => {
    const fixture = await launchVerificationServer();
    try {
      expect((await raw(fixture.info.url, "/api/bots", fromPage(fixture.info.url))).status).toBe(200);
    } finally {
      await fixture.close();
    }
  }, 60_000);
});
