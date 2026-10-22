import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("isolates relative workspaces and gives the same resolved directory one namespace", () => {
  const home = mkdtempSync(join(tmpdir(), "spdbot-namespace-"));
  const first = join(home, "first");
  const second = join(home, "second");
  mkdirSync(first);
  mkdirSync(second);
  const moduleUrl = new URL("./browser-identity.ts", import.meta.url).href;
  const namespace = (cwd: string, dataDir: string) => {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e",
      `const { BROWSER_NAMESPACE } = await import(${JSON.stringify(moduleUrl)}); console.log(BROWSER_NAMESPACE);`], {
      cwd, encoding: "utf8", timeout: 15_000,
      env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home,
        SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        TMP: home, TEMP: home, OMB_DATA_DIR: dataDir },
    });
    expect(child.status, child.stderr).toBe(0);
    return child.stdout.trim();
  };
  try {
    const a = namespace(first, ".spdbot");
    const b = namespace(second, ".spdbot");
    expect(a).toMatch(/^spd-[0-9a-f]{20}$/);
    expect(b).not.toBe(a);
    expect(namespace(second, join(first, ".spdbot"))).toBe(a);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
