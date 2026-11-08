import { build } from "esbuild";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { authority } from "../../electron/testing/purchase/fake-authority.mjs";

const directory = await mkdtemp(path.join(tmpdir(), "spdbot-native-purchase-"));
const profile = path.join(directory, "profile"); await mkdir(profile);
await build({ entryPoints: ["scripts/testing/purchase-native-ui.tsx"], bundle: true, outfile: path.join(directory, "ui.js"), platform: "browser", format: "iife", jsx: "automatic", alias: { "@": path.resolve("src") } });
await build({ entryPoints: ["server/testing/purchase-native-child.ts"], bundle: true, outfile: path.join(directory, "child.mjs"), platform: "node", format: "esm", plugins: [{ name: "isolated-public-fixture-trust", setup(builder) {
  builder.onLoad({ filter: /[\\/]electron[\\/]purchase-authority\.mjs$/ }, () => ({ contents: `export const PURCHASE_AUTHORITY = ${JSON.stringify(authority)}; export const validateAuthority = value => value;`, loader: "js" }));
} }] });
const electron = createRequire(import.meta.url)("electron");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ["SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "LANG", "TZ"].includes(key.toUpperCase())));
Object.assign(env, { HOME: directory, USERPROFILE: directory, APPDATA: path.join(directory, "roaming"), LOCALAPPDATA: path.join(directory, "local") });
const callback = "spdbot-preview://auth/callback?request_id=11111111-1111-4111-8111-111111111111&code=" + "A".repeat(43) + "&state=" + "A".repeat(43);
for (const mode of ["online", "offline"]) {
  const child = spawn(electron, [path.resolve("scripts/testing/purchase-native-main.mjs"), `--profile=${profile}`, `--mode=${mode}`, `--assets=${directory}`, ...(mode === "online" ? [callback] : [])], { env, windowsHide: true, stdio: "ignore" });
  const timer = setTimeout(() => child.kill(), 45000);
  const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); }); clearTimeout(timer);
  if (code !== 0) {
    const evidence = await readFile(path.join(directory, `${mode}-error.txt`), "utf8").catch(() => "native process failed before evidence");
    throw new Error(`${mode}: ${evidence}\nEvidence: ${directory}`);
  }
}
console.log(JSON.stringify({ evidence: directory, online: JSON.parse(await readFile(path.join(directory, "online.json"), "utf8")), offline: JSON.parse(await readFile(path.join(directory, "offline.json"), "utf8")) }, null, 2));
