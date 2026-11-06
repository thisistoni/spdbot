import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { launchVerificationServer, runControlOmb, verificationServerEnvironment, type VerificationServer } from "../scripts/control-omb.ts";
import { handleToolCall } from "../scripts/mcp-server.ts";

let fixture: VerificationServer;
let bot: { id: string; threadId: string; name: string };
let seededText: string;
beforeAll(async () => {
  fixture = await launchVerificationServer({ ...process.env, OMB_TEST_PORTS: "19870-19890" }, undefined, undefined, undefined, undefined, undefined, [], undefined, undefined, "restricted");
  const response = await fetch(`${fixture.info.url}/api/bots`);
  bot = ((await response.json()) as { bots: typeof bot[] }).bots[0];
  const history = await fetch(`${fixture.info.url}/api/threads/${bot.threadId}/messages`);
  expect(history.status).toBe(200);
  const { messages } = await history.json() as { messages: { role: string; kind: string; text: string }[] };
  const greeting = messages.find(message => message.role === "bot" && message.kind === "text");
  expect(greeting?.text).toEqual(expect.any(String));
  seededText = greeting!.text;
  expect(seededText.trim().length).toBeGreaterThan(0);
}, 60000);
afterAll(async () => { await fixture?.close(); });

describe("real restricted harness with isolated fake engine", () => {
  it("exports the seeded conversation as Markdown and JSON, and usage as CSV", async () => {
    // The seeded conversation follows the host language; export must preserve it.
    const expected = seededText;
    const markdown = await fetch(`${fixture.info.url}/api/threads/${bot.threadId}/export`);
    expect(markdown.status).toBe(200); expect(await markdown.text()).toContain(expected);
    const json = await fetch(`${fixture.info.url}/api/threads/${bot.threadId}/export?format=json`);
    expect(json.status).toBe(200);
    expect(await json.json()).toMatchObject({ messages: expect.arrayContaining([expect.objectContaining({ text: expected })]) });
    const csv = await fetch(`${fixture.info.url}/api/usage.csv`);
    expect(csv.status).toBe(200); expect(csv.headers.get("content-type")).toContain("text/csv");
    expect((await csv.text()).trim().length).toBeGreaterThan(0);
  });
  it("keeps history/config reads and refuses HTTP side effects, forged authority and internal MCP", async () => {
    expect(bot).toBeTruthy();
    for (const [method, path, body] of [
      ["POST", "/api/bots", { name: "Unlicensed" }],
      ["POST", `/api/bots/${bot.id}/send`, { text: "must not execute" }],
      ["PUT", "/api/config", { access: { allowed: true } }],
      ["POST", "/api/routines", { name: "must not run" }],
      ["POST", "/api/internal/mcp", { method: "tools/call", params: { name: "send_message" } }],
      ["GET", `/api/bots/${bot.id}/browser/live`, undefined],
      ["POST", `/api/bots/${bot.id}/container/exec`, { command: "exit 0" }],
      ["POST", "/api/workspace-backup/upload", {}],
      ["POST", "/api/workspace-backup/restore", { id: "11111111-1111-4111-8111-111111111111", confirmation: "REPLACE" }],
    ] as const) {
      const response = await fetch(fixture.info.url + path, { method, headers: { "content-type": "application/json", "x-spdbot-access": "active", "x-spdbot-lease": "forged" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      expect(response.status, path).toBe(402);
      expect(await response.json()).toMatchObject({ code: "purchase_access_required" });
    }
    for (const path of ["/api/config", `/api/threads/${bot.threadId}/messages`, "/api/routines"]) expect((await fetch(fixture.info.url + path)).status, path).toBe(200);
    expect(existsSync(fixture.fixtureDumpPath)).toBe(false);
  });
  it("keeps search and backup access while preserving the backup credential-storage guard", async () => {
    const search = await fetch(`${fixture.info.url}/api/search?q=restricted-history`);
    expect(search.status).toBe(200);
    expect(await search.json()).toMatchObject({ hits: expect.any(Array) });
    expect((await fetch(`${fixture.info.url}/api/workspace-backup/status`)).status).toBe(200);
    const exported = await fetch(`${fixture.info.url}/api/workspace-backup/export`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "restricted-fixture-backup-only" }),
    });
    // control-omb deliberately nests its synthetic HOME inside the fixture workspace.
    // Purchase access must not bypass the separate rule excluding provider login storage.
    expect(exported.status).toBe(400);
    expect(await exported.json()).toMatchObject({ error: expect.stringContaining("Provider authentication storage (HOME)") });
    expect(existsSync(fixture.fixtureDumpPath)).toBe(false);
  }, 30000);
  it("refuses a direct WebSocket upgrade independently of the renderer", async () => {
    const socket = new WebSocket(`${fixture.info.url.replace("http:", "ws:")}/api/bots/${bot.id}/browser/live`);
    const status = await new Promise<number>((resolve, reject) => {
      socket.on("unexpected-response", (_req, response) => { response.resume(); resolve(response.statusCode ?? 0); socket.terminate(); });
      socket.on("error", () => {});
      socket.on("open", () => { socket.close(); reject(new Error("unlicensed WebSocket opened")); });
    });
    expect([402, 404]).toContain(status); // Unknown upgrades fail even before purchase admission.
  });
  it("refuses CLI/headless execution and MCP tools while preserving export reads", async () => {
    const env = verificationServerEnvironment({}, fixture.info.dataDir, Number(new URL(fixture.info.url).port));
    const child = spawn(process.execPath, ["--experimental-strip-types", join(import.meta.dirname, "spdbot.ts"), "send", "--bot", bot.id, "--text", "must not execute", "--json"], {
      env: { ...env, SPDBOT_URL: fixture.info.url }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = ""; child.stdout.on("data", d => { output += String(d); }); child.stderr.on("data", d => { output += String(d); });
    const code = await new Promise<number | null>((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
    expect(code).not.toBe(0); expect(output).toMatch(/402|SPDBot verbinden|purchase_access_required/);
    await expect(handleToolCall("send_bot_message", { bot_id: bot.id, text: "must not execute" }, async (path, options) => {
      const response = await fetch(fixture.info.url + path, options);
      if (!response.ok) throw Object.assign(new Error(String(response.status)), { status: response.status });
      return response.json();
    })).rejects.toMatchObject({ status: 402 });
    expect((await fetch(`${fixture.info.url}/api/threads/${bot.threadId}/messages`)).status).toBe(200);
    const out = join(fixture.info.dataDir, "safe-export");
    await runControlOmb(["export", "--thread", bot.threadId, "--out", out, "--url", fixture.info.url], { env });
    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) as { transcripts: { file: string }[]; skipped: unknown[]; bytes: number };
    expect(manifest.skipped).toEqual([]); expect(manifest.transcripts).toHaveLength(1);
    expect(readFileSync(join(out, manifest.transcripts[0].file), "utf8")).toContain(seededText);
    expect(existsSync(fixture.fixtureDumpPath)).toBe(false);
  });
});
