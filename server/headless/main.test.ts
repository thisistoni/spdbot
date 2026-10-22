import "../testing/scrub-ambient-omb-env.ts";

import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { USAGE } from "../cli-usage.ts";
import { HEADLESS_VERBS } from "./args.ts";
import type { HeadlessIo } from "./output.ts";
import { runHeadless, VERB_HELP } from "./main.ts";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const io: HeadlessIo = { out: (text) => out.push(text), err: (text) => err.push(text), readStdin: async () => "" };
  return { io, out, err };
}

describe("the headless command line", () => {
  it("prints exactly one JSON document with --json, a failure included", async () => {
    const { io, out, err } = capture();
    const code = await runHeadless(["send", "--bot", "b1", "--json"], { io, env: {} });
    expect(code).toBe(2);
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0]!)).toEqual({ ok: false, error: "a message is required", hint: expect.any(String), exitCode: 2 });
    expect(err).toEqual([]);
  });

  it("writes errors to stderr without --json", async () => {
    const { io, out, err } = capture();
    expect(await runHeadless(["wait", "--bot", "b1", "--timeout", "forever"], { io, env: {} })).toBe(2);
    expect(out).toEqual([]);
    expect(err).toEqual(["Fehler: --timeout muss eine Dauer zwischen 1s und 24h sein, zum Beispiel 90, 90s, 5m oder 2h."]);
  });

  it("redacts secrets in everything it prints", async () => {
    const { io, out } = capture();
    const callTool = vi.fn(async () => ({ messages: [{ role: "bot", kind: "text", text: "the key is sk-ant-abcdefghijklmnopqrstuv0123" }] }));
    await runHeadless(["messages", "--bot", "b1", "--json"], { io, env: { SPDBOT_URL: "http://127.0.0.1:19999" }, callTool: callTool as any });
    expect(out.join("\n")).not.toContain("sk-ant-abcdefghijklmnopqrstuv0123");
    expect(out.join("\n")).toContain("«redacted");
    const human = capture();
    await runHeadless(["messages", "--bot", "b1"], { io: human.io, env: { SPDBOT_URL: "http://127.0.0.1:19999" }, callTool: callTool as any });
    expect(human.out.join("\n")).not.toContain("sk-ant-abcdefghijklmnopqrstuv0123");
  });

  it("has plain help for every verb, and the main usage names them", async () => {
    for (const verb of HEADLESS_VERBS) expect(VERB_HELP[verb], verb).toBeTruthy();
    const { io, out } = capture();
    expect(await runHeadless(["help", "run"], { io })).toBe(0);
    expect(out[0]).toContain("Einem Bot oder einer Gruppe einen Auftrag geben und auf alle beteiligten Bots warten.");
    expect(await runHeadless(["team", "apply", "--help"], { io })).toBe(0);
    expect(out[1]).toContain("Vorhandene Schlüssel bleiben ohne --rotate-secrets erhalten.");
    expect(out[1]).toContain("Ein zweiter unveränderter Aufruf meldet „Keine Änderungen.“.");
    expect(USAGE).toContain('pnpm spdbot run BOT "Aufgabe"');
  });

  it("is reachable through the published entry, which keeps every other command as it was", () => {
    const entry = join(import.meta.dirname, "..", "spdbot.ts");
    const help = spawnSync(process.execPath, ["--experimental-strip-types", entry, "help", "export"], { encoding: "utf8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("pnpm spdbot export TARGET --out DIR");
    const refused = spawnSync(process.execPath, ["--experimental-strip-types", entry, "run", "--json"], { encoding: "utf8", env: { ...process.env, SPDBOT_URL: "" } });
    expect(refused.status).toBe(2);
    expect(JSON.parse(refused.stdout)).toMatchObject({ ok: false, exitCode: 2 });
    const usage = spawnSync(process.execPath, ["--experimental-strip-types", entry, "--help"], { encoding: "utf8" });
    expect(usage.stdout).toContain("pnpm spdbot serve [--port 8899]");
    expect(usage.stdout).toContain("Einen laufenden Arbeitsbereich steuern");
  });

  it("serves MCP through the published entry, and Ctrl-C ends it like any command", async () => {
    const entry = join(import.meta.dirname, "..", "spdbot.ts");
    const child = spawn(process.execPath, ["--experimental-strip-types", entry, "mcp"], {
      env: { ...process.env, SPDBOT_URL: "http://127.0.0.1:19998", SPDBOT_TOKEN: "" }, stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done) => child.on("exit", (code, signal) => done({ code, signal })));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } })}\n`);
    await vi.waitFor(() => expect(stdout).toContain('"id":1'), { timeout: 10_000 });
    expect(JSON.parse(stdout.split("\n")[0]!)).toMatchObject({ id: 1, result: { serverInfo: { name: expect.stringContaining("spdbot") } } });
    child.kill("SIGINT");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    const { signal } = await exited;
    clearTimeout(timer);
    expect(signal).toBe("SIGINT");
  }, 20_000);
});
