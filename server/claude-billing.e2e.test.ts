// The real registry, turn environment and keep-warm gate, using only the repository's fake Claude CLI.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { launchVerificationServer, runControlOmb } from "../scripts/control-omb.ts";
import type { WireBot } from "../shared/wire.ts";

it.each([true, false])("accounts for Claude API billing and keeps only subscription turns warm (everyClaudeBot=%s)", async (everyClaudeBot) => {
  const fixture = await launchVerificationServer({
    ...process.env, FAKE_CLAUDE_MODE: "happy", FAKE_CLAUDE_AUTH: "in", FAKE_CLAUDE_VERSION: "2.1.303",
    FAKE_CLAUDE_CACHE_READ_TOKENS: "200000", FAKE_CLAUDE_TOOL_CALLS: "[]",
  });
  const url = fixture.info.url;
  const key = "sk-ant-fake-backport-billing";
  const evidence: unknown[] = [];
  const api = async (path: string, body?: unknown, method = "GET") => {
    const response = await fetch(url + path, {
      method, headers: { origin: url, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000),
    });
    expect(response.ok, `${method} ${path}`).toBe(true);
    return response.json() as Promise<any>;
  };
  try {
    // The API-only instance must use the fake too; the sealed fixture PATH hides every installed CLI.
    await api("/api/instances/claudeApi", { cli: fileURLToPath(new URL("./testing/fake-claude-cli.ts", import.meta.url)) }, "PATCH");
    await api("/api/config", {
      anthropic: { key, everyClaudeBot }, cacheKeepWarm: { enabled: true, windowMinutes: 180 },
    }, "PUT");
    const { instances } = await api("/api/instances");
    const bot = (await api("/api/bots")).bots[0] as WireBot;
    for (const id of ["claude", "claudeApi"]) {
      const metered = id === "claudeApi" || everyClaudeBot;
      const snapshot = instances.find((entry: any) => entry.instanceId === id)?.snapshot;
      expect(snapshot, id).toMatchObject({ state: "available", authenticated: true, billing: metered ? "metered" : "subscription" });
      if (metered) expect(snapshot.account?.method, id).toBe("api-key");
      await api(`/api/bots/${bot.id}`, { modelSelection: { instanceId: id, model: "claude-opus-5-5" } }, "PATCH");
      await runControlOmb(["send", "--bot", bot.id, "--task", bot.threadId, "--text", "Synthetic billing probe", "--url", url]);
      const settled = await runControlOmb(["wait", "--bot", bot.id, "--task", bot.threadId, "--timeout", "30", "--url", url]) as { status: string };
      expect(settled.status).toBe("settled");
      const messages = await runControlOmb(["messages", "--bot", bot.id, "--task", bot.threadId, "--url", url]);
      expect(JSON.stringify(messages)).toContain("hello from fake claude");
      const dump = JSON.parse(readFileSync(fixture.fixtureDumpPath, "utf8")) as { env: Record<string, string> };
      expect(dump.env.ANTHROPIC_API_KEY, id).toBe(metered ? key : undefined);
      const after = (await api("/api/bots")).bots.find((entry: any) => entry.id === bot.id);
      const task = after.tasks.find((entry: any) => entry.threadId === bot.threadId);
      expect(task, "the tested task is present in the server response").toBeDefined();
      if (metered) expect(task.cacheKeepWarm, id).toBeUndefined();
      else expect(task.cacheKeepWarm, id).toMatchObject({ state: "warm" });
      evidence.push({ instanceId: id, snapshot, keyApplied: dump.env.ANTHROPIC_API_KEY === key,
        wait: settled, messages, task });
    }
    writeFileSync(fixture.info.logPath.replace(/\.log$/, "-claude-billing.json"), JSON.stringify({
      everyClaudeBot, logPath: fixture.info.logPath, evidence,
    }, null, 2));
    console.info(`Claude billing fixture everyClaudeBot=${everyClaudeBot}`, fixture.info.logPath);
  } finally { await fixture.close(); }
}, 90_000);
