import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { verificationServerEnvironment } from "../scripts/control-omb.ts";
import { freePortBlock } from "./testing/ports.ts";
import { removeTempDir, waitForExit } from "./testing/cleanup.ts";

const exec = promisify(execFile);

it("starts fresh beside MausBot, saves and restarts independently, pairs through the real CLI and refuses the old server", async () => {
  const home = mkdtempSync(join(tmpdir(), "spdbot-identity-"));
  const port = await freePortBlock([0, 1]);
  mkdirSync(join(home, "tmp"), { recursive: true });
  const oldFiles = [".openmausbot/config.json", ".openmausbot/profiles/cookies", ".openmausbot/credentials.bin", ".opengrokbot/config.json", "Library/Application Support/OpenMausBot/credentials.bin"];
  for (const file of oldFiles) {
    mkdirSync(join(home, file, ".."), { recursive: true });
    writeFileSync(join(home, file), JSON.stringify({ profile: { name: "MausBot untouched" }, synthetic: file }));
  }
  const snapshots = oldFiles.map(file => readFileSync(join(home, file)));
  let oldMutations = 0;
  const maus = createServer((req, res) => {
    if (req.method !== "GET") oldMutations++;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ app: "openmausbot", pid: process.pid }));
  });
  await new Promise<void>(resolve => maus.listen(0, "127.0.0.1", resolve));
  const oldPort = (maus.address() as { port: number }).port;
  const dataDir = join(home, ".spdbot");
  const env = verificationServerEnvironment(process.env, home, port);
  env.HOME = home;
  env.USERPROFILE = home;
  delete env.OMB_DATA_DIR; // Prove the default, not an explicit temporary data override.
  let child: ChildProcess | undefined;
  let log = "";
  const start = async () => {
    child = spawn(process.execPath, ["--experimental-strip-types", join(import.meta.dirname, "index.ts")], { env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout?.on("data", chunk => { log += String(chunk); });
    child.stderr?.on("data", chunk => { log += String(chunk); });
    await expect.poll(async () => {
      if (child?.exitCode !== null) throw new Error(log);
      try { return await (await fetch(`http://127.0.0.1:${port}/api/health`)).json(); } catch { return null; }
    }, { timeout: 30_000 }).toMatchObject({ app: "spdbot", pid: child.pid });
  };
  const cli = (args: string[], overrides = {}) => exec(process.execPath, ["--experimental-strip-types", join(import.meta.dirname, "spdbot.ts"), ...args], { env: { ...env, ...overrides }, timeout: 30_000 });
  try {
    await start();
    expect(existsSync(dataDir)).toBe(true);
    const config = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json() as { profile?: { name?: string } };
    expect(config.profile?.name).not.toBe("MausBot untouched");
    expect((await fetch(`http://127.0.0.1:${port}/api/config`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: { name: "SPDBot saved" } }) })).ok).toBe(true);
    expect((await cli(["pair", "--client", "--port", String(port)])).stdout).toMatch(/code|pair/);
    const tokenFile = join(home, "spdbot-token");
    await cli(["connect", `http://127.0.0.1:${port}`, "--out", tokenFile, "--client"]);
    expect(readFileSync(tokenFile, "utf8").trim()).not.toBe("");
    expect(JSON.parse((await cli(["bots", "--url", `http://127.0.0.1:${port}`, "--token-file", tokenFile, "--json"])).stdout)).toMatchObject({ bots: expect.any(Array) });
    await expect(cli(["pair", "--client", "--port", String(oldPort)])).rejects.toMatchObject({ code: 1 });
    await expect(cli(["new-bot", "Must never reach MausBot", "--url", `http://127.0.0.1:${oldPort}`])).rejects.toBeDefined();
    expect(oldMutations).toBe(0);
    await waitForExit(child, { signal: "SIGTERM", graceMs: 15_000 });
    await start();
    expect((await (await fetch(`http://127.0.0.1:${port}/api/config`)).json() as { profile: { name: string } }).profile.name).toBe("SPDBot saved");
    for (const [index, file] of oldFiles.entries()) expect(readFileSync(join(home, file))).toEqual(snapshots[index]);
    expect((await (await fetch(`http://127.0.0.1:${oldPort}/api/health`)).json() as { app: string }).app).toBe("openmausbot");
  } finally {
    await waitForExit(child, { signal: "SIGTERM", graceMs: 15_000 });
    await new Promise<void>((resolve, reject) => maus.close(error => error ? reject(error) : resolve()));
    await removeTempDir(home);
  }
}, 90_000);
