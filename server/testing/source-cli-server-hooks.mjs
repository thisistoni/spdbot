// Explicit source CLI fixture. Inject only its server child's signed loader;
// provider CLIs, tunnel helpers and arbitrary child processes keep their argv.
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const home = realpathSync(process.env.HOME);
if (!basename(home).startsWith("spdbot-source-purchase-") ||
    readFileSync(join(home, "purchase-fixture.marker"), "utf8") !== "source-purchase-fresh-profile-v1" ||
    realpathSync(tmpdir()) !== realpathSync(join(home, "purchase-tmp"))) throw new Error("fresh source CLI profile required");
const server = fileURLToPath(new URL("../index.ts", import.meta.url));
const spawn = childProcess.spawn;
childProcess.spawn = function (command, args, options) {
  if (command === process.execPath && args?.at(-1) === server) {
    args = [...args.slice(0, -1), "--import", new URL("purchase-parent.mjs", import.meta.url).href, server];
  }
  return spawn(command, args, options);
};
syncBuiltinESMExports();
