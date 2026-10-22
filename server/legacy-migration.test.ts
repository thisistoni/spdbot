// SPDBot starts fresh even when both older products have data in this home.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { removeTempDir, waitForExit } from "./testing/cleanup.ts";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SERVER_DIR, "..");
const PORT = 18800 + Math.floor(Math.random() * 10_000);
const WEBHOOK_PORT = 39000 + Math.floor(Math.random() * 10_000);

let home: string;
let child: ChildProcess;
let stderr = "";

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), "omb-legacy-test-"));
  const legacy = join(home, ".opengrokbot");
  mkdirSync(legacy, { recursive: true });
  // A distinct older configuration exposes any accidental import into the fresh workspace.
  writeFileSync(join(legacy, "config.json"), JSON.stringify({
    instances: { fixture: { driver: "migration-test-shadow" } },
  }));
  writeFileSync(join(legacy, "keep-me.txt"), "carried over");
  writeFileSync(join(legacy, "environment-id"), "00000000-0000-4000-8000-000000000001");
  const maus = join(home, ".openmausbot");
  mkdirSync(maus, { recursive: true });
  writeFileSync(join(maus, "keep-me.txt"), "MausBot stays unchanged");
  writeFileSync(join(maus, "environment-id"), "00000000-0000-4000-8000-000000000002");
  child = spawn(process.execPath, [join(SERVER_DIR, "index.ts")], {
    cwd: ROOT,
    env: {
      ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      HOME: home,
      USERPROFILE: home,
      OMB_PORT: String(PORT),
      OMB_WEBHOOK_PORT: String(WEBHOOK_PORT),
      OMB_BROWSER_CONNECTION: join(home, "browser-test-connection.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) return;
    } catch {
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server did not start:\n${stderr}`);
}, 30_000);

afterAll(async () => {
  await waitForExit(child, { signal: "SIGTERM" });
  await removeTempDir(home);
});

describe("legacy data directories", () => {
  it("leaves both older products unchanged and creates a fresh SPDBot directory without migration", () => {
    const fresh = join(home, ".spdbot");
    expect(existsSync(join(home, ".opengrokbot"))).toBe(true);
    expect(readFileSync(join(home, ".opengrokbot", "keep-me.txt"), "utf8")).toBe("carried over");
    expect(JSON.parse(readFileSync(join(home, ".opengrokbot", "config.json"), "utf8")).instances.fixture.driver).toBe("migration-test-shadow");
    expect(readFileSync(join(home, ".openmausbot", "keep-me.txt"), "utf8")).toBe("MausBot stays unchanged");
    expect(existsSync(join(fresh, "keep-me.txt"))).toBe(false);
    const identity = readFileSync(join(fresh, "environment-id"), "utf8").trim();
    expect(identity).toMatch(/^[0-9a-f-]{36}$/);
    for (const [directory, original] of [[".opengrokbot", "00000000-0000-4000-8000-000000000001"], [".openmausbot", "00000000-0000-4000-8000-000000000002"]] as const) {
      expect(readFileSync(join(home, directory, "environment-id"), "utf8")).toBe(original);
      expect(identity).not.toBe(original);
    }
  });
});
