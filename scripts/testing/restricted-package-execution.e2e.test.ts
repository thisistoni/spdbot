// Active execution belongs to the existing signed SOURCE fixture, never the
// restricted package. Restart through its public launcher helpers as well.
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { launchVerificationServer, runControlOmb, verificationServerArgs, verificationServerEnvironment } from "../control-omb.ts";
import { waitForExit } from "../../server/testing/cleanup.ts";

it("runs the isolated fake engine before and after a source-fixture restart", async () => {
  const fixture = await launchVerificationServer();
  const { url, dataDir, logPath } = fixture.info;
  let restarted: ChildProcess | undefined;
  const control = (...args: string[]) => runControlOmb([...args, "--url", url]);
  try {
    const { bot } = await control("new-bot", "--name", "Restricted package source qualification") as { bot: { id: string } };
    const turn = async (text: string) => {
      await control("send", "--bot", bot.id, "--text", text);
      expect(await control("wait", "--bot", bot.id, "--timeout", "30")).toMatchObject({ status: "settled" });
      const { messages } = await control("messages", "--bot", bot.id, "--limit", "30") as { messages: { role: string; text: string }[] };
      const request = messages.findLastIndex(message => message.role === "user" && message.text.includes(text));
      expect(request).toBeGreaterThanOrEqual(0);
      expect(messages.slice(request + 1).some(message => message.role === "bot" && message.text.length > 0)).toBe(true);
      expect(existsSync(fixture.fixtureDumpPath)).toBe(true);
      expect(readFileSync(fixture.fixtureDumpPath, "utf8")).toContain(text);
      return messages;
    };
    const before = await turn("Before source fixture restart.");
    await waitForExit(fixture.child, { signal: "SIGTERM" });
    const env = verificationServerEnvironment(process.env, dataDir, Number(new URL(url).port));
    env.OMB_TEST_PURCHASE = "fixture";
    const log = openSync(logPath, "a", 0o600);
    try {
      restarted = spawn(process.execPath, verificationServerArgs(env), { env, stdio: ["ignore", log, log] });
    } finally { closeSync(log); }
    await expect.poll(async () => {
      if (restarted?.exitCode !== null) throw new Error(readFileSync(logPath, "utf8"));
      return fetch(`${url}/api/health`).then(response => response.ok).catch(() => false);
    }, { timeout: 15_000, interval: 100 }).toBe(true);
    const after = await control("messages", "--bot", bot.id, "--limit", "30") as { messages: unknown[] };
    expect(after.messages).toEqual(before);
    await turn("After source fixture restart.");
  } finally {
    if (restarted) await waitForExit(restarted, { signal: "SIGTERM" });
    await fixture.close();
  }
}, 90_000);
