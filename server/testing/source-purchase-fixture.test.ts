import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { sourcePurchaseEnvironment, sourcePurchaseHome, spawnSourcePurchaseServer } from "./source-purchase-fixture.ts";

const homes: string[] = [];
const fresh = () => { const home = sourcePurchaseHome(join(tmpdir(), "guard-")); homes.push(home); return home; };
const platform = Object.fromEntries(Object.entries(process.env).filter(([key]) => ["SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT"].includes(key.toUpperCase())));
const gateScript = `const { purchaseAccess } = await import(${JSON.stringify(new URL("../purchase-access.ts", import.meta.url).href)}); console.log(JSON.stringify({ allowed: await purchaseAccess.check() }));`;
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });

it("refuses adoption of an existing TEMP home, even with a copied marker", () => {
  const home = mkdtempSync(join(tmpdir(), "spdbot-source-purchase-unowned-")); homes.push(home);
  writeFileSync(join(home, "purchase-fixture.marker"), "source-purchase-fresh-profile-v1");
  expect(() => sourcePurchaseEnvironment({ HOME: home })).toThrow("cannot adopt");
  expect(() => sourcePurchaseHome(join(home, "nested-"))).toThrow("TEMP prefix");
});

it("rejects corrupt ownership and non-server execution before spawning", () => {
  const home = fresh();
  expect(() => spawnSourcePurchaseServer(process.execPath, ["-e", "process.exit()"], { env: { HOME: home } })).toThrow("explicit source server");
  writeFileSync(join(home, "purchase-fixture.marker"), "wrong marker");
  expect(() => sourcePurchaseEnvironment({ HOME: home })).toThrow("cannot adopt");
});

it("keeps inherited configuration directories inside the owned disposable profile", () => {
  const home = fresh();
  const parent = { HOME: home, APPDATA: tmpdir(), HERMES_HOME: tmpdir(), XDG_CONFIG_HOME: join(home, "custom-config") };
  const env = sourcePurchaseEnvironment(parent);
  expect(env.APPDATA).toBe(join(home, "AppData", "Roaming"));
  expect(env.HERMES_HOME).toBe(join(home, ".hermes"));
  expect(env.XDG_CONFIG_HOME).toBe(parent.XDG_CONFIG_HOME);
  expect(parent.APPDATA).toBe(tmpdir());
});

it.skipIf(process.platform !== "darwin")("binds both real broker paths with a long macOS TEMP root", () => {
  const temporary = mkdtempSync(join(tmpdir(), "source-purchase-long-temp-")); homes.push(temporary);
  const longTemp = join(temporary, "nested-".repeat(12)); mkdirSync(longTemp);
  const script = `
    const { sourcePurchaseHome, sourcePurchaseEnvironment } = await import(${JSON.stringify(new URL("./source-purchase-fixture.ts", import.meta.url).href)});
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { rmSync } = await import("node:fs");
    const home = sourcePurchaseHome(join(tmpdir(), "guard-"));
    try {
      Object.assign(process.env, sourcePurchaseEnvironment({ ...process.env, HOME: home, OMB_DATA_DIR: home }));
      const { brokerSocketCandidates, createPermissionBroker } = await import(${JSON.stringify(new URL("../drivers/claude.ts", import.meta.url).href)});
      const paths = brokerSocketCandidates("thread-fixture", "bot-fixture");
      const bound = [];
      for (const path of paths) {
        const broker = await createPermissionBroker({ socketPaths: [path], onAsk() {}, onResolve() {} });
        bound.push(broker.socketPath);
        broker.close();
      }
      console.log(JSON.stringify({ home, paths, bound }));
    } finally { rmSync(home, { recursive: true, force: true }); }
  `;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    env: { ...platform, HOME: temporary, USERPROFILE: temporary, TMPDIR: longTemp, TMP: longTemp, TEMP: longTemp },
    encoding: "utf8", timeout: 15_000,
  });
  expect(child.status, child.stderr).toBe(0);
  const result = JSON.parse(child.stdout);
  expect(dirname(result.home)).toBe(realpathSync("/tmp"));
  expect(result.paths).toHaveLength(2);
  expect(result.bound).toEqual(result.paths);
  for (const path of result.paths) expect(Buffer.byteLength(path)).toBeLessThan(104);
});

it("verifies signed nonce/possession before the source entry starts; plain source stays restricted", () => {
  const home = fresh();
  const env = sourcePurchaseEnvironment({ ...platform, HOME: home, OMB_DATA_DIR: join(home, "data") });
  const plain = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", gateScript], { env, encoding: "utf8", timeout: 15_000 });
  expect(plain.status, plain.stderr).toBe(0);
  expect(JSON.parse(plain.stdout)).toEqual({ allowed: false });
  const signed = spawnSync(process.execPath, ["--experimental-strip-types", "--import", new URL("purchase-parent.mjs", import.meta.url).href, "--input-type=module", "-e", gateScript], { env, encoding: "utf8", timeout: 15_000 });
  expect(signed.status, signed.stderr).toBe(0);
  expect(JSON.parse(signed.stdout)).toEqual({ allowed: true });
});

it("rejects an escaped data directory and missing loader marker", () => {
  const home = fresh();
  const outside = mkdtempSync(join(tmpdir(), "spdbot-purchase-outside-")); homes.push(outside);
  const env = sourcePurchaseEnvironment({ ...platform, HOME: home, OMB_DATA_DIR: outside });
  const args = ["--experimental-strip-types", "--import", new URL("purchase-parent.mjs", import.meta.url).href, "-e", "process.exit(0)"];
  const escaped = spawnSync(process.execPath, args, { env, encoding: "utf8", timeout: 15_000 });
  expect(escaped.status).not.toBe(0); expect(escaped.stderr).toContain("fresh source profile");
  rmSync(join(home, "purchase-fixture.marker"));
  const missing = spawnSync(process.execPath, args, { env: { ...env, OMB_DATA_DIR: home }, encoding: "utf8", timeout: 15_000 });
  expect(missing.status).not.toBe(0); expect(missing.stderr).toContain("ENOENT");
});

it("keeps test helpers excluded from shipping TypeScript and builder inputs", () => {
  const root = new URL("../../", import.meta.url);
  const config = JSON.parse(readFileSync(new URL("tsconfig.server.build.json", root), "utf8"));
  expect(config.exclude).toContain("server/testing");
  const builder = readFileSync(new URL("electron-builder.yml", root), "utf8");
  expect(builder).toContain('"!electron/testing/**"');
  // A nested home is allowed only under the fresh root this helper owns.
  const home = fresh(); mkdirSync(join(home, "nested"));
  expect(sourcePurchaseEnvironment({ HOME: join(home, "nested") }).TMP).toBe(join(home, "purchase-tmp"));
});
