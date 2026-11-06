// Explicit source-test opt-in. Neither this helper nor its loader ships.
import { spawn, type SpawnOptions } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ownedHomes = new Set<string>();
const server = fileURLToPath(new URL("../index.ts", import.meta.url));
const loader = new URL("purchase-parent.mjs", import.meta.url).href;
const marker = "source-purchase-fresh-profile-v1";

/** Own a newly created TEMP profile; never adopt an existing home. */
export function sourcePurchaseHome(prefix: string): string {
  const temporaryRoots = [realpathSync(tmpdir()), ...(process.platform === "win32" ? [] : [realpathSync("/tmp")])];
  if (!temporaryRoots.includes(realpathSync(dirname(prefix)))) throw new Error("purchase fixture requires a TEMP prefix");
  // macOS's per-user TEMP prefix can exhaust sun_path before the broker suffix.
  const directory = process.platform === "darwin" ? realpathSync("/tmp") : dirname(prefix);
  const home = mkdtempSync(join(directory, "spdbot-source-purchase-"));
  writeFileSync(join(home, "purchase-fixture.marker"), marker, { flag: "wx", mode: 0o600 });
  // Custom fixtures sometimes create their own `tmp` directory after this call.
  mkdirSync(join(home, "purchase-tmp"));
  const canonical = realpathSync(home);
  ownedHomes.add(canonical);
  return canonical;
}

function inside(root: string, path: string): boolean {
  const child = relative(root, path);
  return child !== ".." && !child.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(child);
}

/** Also used by the native utility-process source smoke. */
export function sourcePurchaseEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!environment.HOME) throw new Error("purchase fixture requires an owned home");
  const home = realpathSync(environment.HOME);
  const root = [...ownedHomes].find(owner => inside(owner, home));
  if (!root || readFileSync(join(root, "purchase-fixture.marker"), "utf8") !== marker) throw new Error("purchase fixture cannot adopt an existing home");
  const privatePath = (value: string | undefined, ...fallback: string[]) => value && inside(root, value) ? value : join(home, ...fallback);
  return {
    ...environment, USERPROFILE: environment.HOME,
    APPDATA: privatePath(environment.APPDATA, "AppData", "Roaming"),
    LOCALAPPDATA: privatePath(environment.LOCALAPPDATA, "AppData", "Local"),
    XDG_CONFIG_HOME: privatePath(environment.XDG_CONFIG_HOME, ".config"),
    XDG_CACHE_HOME: privatePath(environment.XDG_CACHE_HOME, ".cache"),
    XDG_DATA_HOME: privatePath(environment.XDG_DATA_HOME, ".local", "share"),
    HERMES_HOME: privatePath(environment.HERMES_HOME, ".hermes"),
    OMB_COMPANION_DIR: privatePath(environment.OMB_COMPANION_DIR, ".spdbot-companion"),
    OMB_TEST_SEALED_PATH: "1",
    TEMP: join(root, "purchase-tmp"), TMP: join(root, "purchase-tmp"), TMPDIR: join(root, "purchase-tmp"),
  };
}

/** Retain the fixture's provider hooks/env/stdio, adding only signed access. */
export function sourcePurchaseServerArgs(args: readonly string[]): string[] {
  if (args.at(-1) !== server) throw new Error("purchase fixture requires an explicit source server and owned home");
  return [...args.slice(0, -1), "--import", loader, server];
}

export const spawnSourcePurchaseServer: typeof spawn = ((command: string, args: readonly string[], options: SpawnOptions) => {
  if (command !== process.execPath || args.at(-1) !== server) {
    throw new Error("purchase fixture requires an explicit source server and owned home");
  }
  const env = sourcePurchaseEnvironment(options.env ?? {});
  return spawn(command, sourcePurchaseServerArgs(args), { ...options, env });
}) as typeof spawn;

/** Only positive CLI serve tests opt in; ordinary CLI denial tests stay raw. */
export const spawnSourcePurchaseCli: typeof spawn = ((command: string, args: readonly string[], options: SpawnOptions) => {
  if (command !== process.execPath || !args.includes(fileURLToPath(new URL("../spdbot.ts", import.meta.url))) || !args.includes("serve")) {
    throw new Error("purchase fixture requires the explicit source serve CLI");
  }
  const env = sourcePurchaseEnvironment(options.env ?? {});
  return spawn(command, ["--import", new URL("source-cli-server-hooks.mjs", import.meta.url).href, ...args], { ...options, env });
}) as typeof spawn;
