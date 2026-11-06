// SOURCE-ONLY native smoke bundle. Shipping dist-server bytes are never changed.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createPrivateKey, sign } from "node:crypto";
import { cp, mkdir, readFile, realpath } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authority, corpus, FakeAuthority, freshClock } from "../../electron/testing/purchase/fake-authority.mjs";
import { applyDecision, bindingOf, emptySecurity } from "../../electron/purchase-verifier.mjs";
import { possessionBytes } from "../../electron/purchase-wire.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

export async function buildPurchaseServerFixture(home) {
  const owned = await realpath(home);
  assert.ok(basename(owned).startsWith("spdbot-source-purchase-"));
  assert.equal(await readFile(join(owned, "purchase-fixture.marker"), "utf8"), "source-purchase-fresh-profile-v1");
  const directory = join(owned, "signed-server-fixture");
  await mkdir(directory);
  // Keep the actual built workers/proxies alongside the test entry. Their trust
  // is untouched; only the new entry below receives public fixture pins.
  await cp(join(root, "dist-server"), directory, { recursive: true });
  const output = join(directory, "index.js");
  const result = await build({
    absWorkingDir: root, entryPoints: ["server/index.ts"], bundle: true, platform: "node", format: "esm", outfile: output,
    metafile: true, banner: { js: 'import { createRequire as fixtureRequire } from "node:module"; const require = fixtureRequire(import.meta.url);' },
    plugins: [{ name: "isolated-public-fixture-trust", setup(builder) {
      builder.onResolve({ filter: /^yaml$/ }, () => ({ path: join(root, "node_modules/yaml/browser/index.js") }));
      builder.onLoad({ filter: /[\\/]electron[\\/]purchase-authority\.mjs$/ }, () => ({
        contents: `export const PURCHASE_AUTHORITY = ${JSON.stringify(authority)}; export const validateAuthority = value => value;`, loader: "js",
      }));
    } }],
  });
  for (const input of Object.keys(result.metafile.inputs)) assert.doesNotMatch(input, /(?:\/testing\/|\.test\.)/);
  const text = await readFile(output, "utf8");
  for (const forbidden of [corpus.keys.online.d, corpus.keys.lease.d, "control-omb-fresh-profile-v1", "source-purchase-fresh-profile-v1"]) {
    assert.equal(text.includes(forbidden), false, "private fixture material entered child bundle");
  }
  return output;
}

/** Answer the real utility child's nonce over its private parent channel. */
export function attachPurchaseFixtureParent(child) {
  let rejectFailure;
  const failure = new Promise((_, reject) => { rejectFailure = reject; });
  child.on("message", message => {
    if (message?.type !== "spdbot:purchase-challenge") return;
    void (async () => {
      const clock = freshClock(Math.floor(Date.now() / 1000));
      const result = await new FakeAuthority(clock).pair(corpus.context.jkt);
      const payload = JSON.parse(Buffer.from(result.access_token.split(".")[1], "base64url").toString());
      const binding = bindingOf(payload, Date.parse(result.session_expires_at) / 1000);
      const { security } = await applyDecision(emptySecurity(binding), result, authority, clock.time.wall);
      child.postMessage({ type: "spdbot:purchase-init", nonce: message.nonce, security,
        clock: { greatest: clock.time.wall, trusted: clock.time.wall }, public_jwk: corpus.keys.device,
        signature: sign(null, possessionBytes(message.nonce, security.lease), createPrivateKey({ key: corpus.keys.online, format: "jwk" })).toString("base64url") });
    })().catch(rejectFailure);
  });
  return failure;
}
