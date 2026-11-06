import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const compiled = await build({ entryPoints: ["electron/main.mjs"], bundle: true, write: false, metafile: true, platform: "node", format: "esm", external: ["electron", "electron-updater"] });
for (const file of Object.keys(compiled.metafile.inputs)) assert.doesNotMatch(file, /(?:\/testing\/|\.node-test\.|\.test\.)/);
const corpus = JSON.parse(await readFile("electron/testing/purchase/access-v1.json", "utf8"));
const forbidden = [corpus.keys.online.d, corpus.keys.lease.d, "control-omb-fresh-profile-v1", "isolated-public-fixture-trust", "fixture-lease-v1"];
const texts = compiled.outputFiles.map(f => f.text);
let artifacts = 0;
for (const dir of ["dist-server", "dist"]) {
  const files = await readdir(dir, { recursive: true });
  for (const file of files) {
    if (!/\.(?:m?js|html)$/.test(file) || /^enterprise[\\/]/.test(file)) continue;
    texts.push(await readFile(path.join(dir, file), "utf8")); artifacts++;
  }
}
for (const text of texts) for (const secret of forbidden) assert.equal(text.includes(secret), false, "test authority leaked into runtime artifacts");
const builder = await readFile("electron-builder.yml", "utf8");
assert.ok(builder.includes('"!electron/testing/**"'));
assert.ok(builder.includes('"!electron/**/*.node-test.mjs"'));
assert.ok(builder.includes("beforePack: ./scripts/before-pack-purchase.mjs"));
const { PURCHASE_AUTHORITY } = await import("../electron/purchase-authority.mjs");
if (!PURCHASE_AUTHORITY.onlineKeys.length || !PURCHASE_AUTHORITY.leaseKeys.length) {
  const beforePack = (await import("./before-pack-purchase.mjs")).default;
  assert.throws(beforePack, /access_unavailable/);
}
console.log(`Purchase artifact guard passed: Electron import graph and ${artifacts} UI/core-server artifacts; fixture keys/loaders excluded.`);
