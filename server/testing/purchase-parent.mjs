// Explicit SOURCE-ONLY control-omb fixture. No runtime bypass in a shipping entry.
import { registerHooks } from "node:module";
import { createPrivateKey, sign } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { authority, corpus, FakeAuthority, freshClock } from "../../electron/testing/purchase/fake-authority.mjs";
import { applyDecision, bindingOf, emptySecurity } from "../../electron/purchase-verifier.mjs";
import { possessionBytes } from "../../electron/purchase-wire.mjs";

const home = realpathSync(process.env.HOME ?? "");
const sourceRoot = dirname(realpathSync(tmpdir()));
if (basename(sourceRoot).startsWith("spdbot-source-purchase-")) {
  const marker = join(sourceRoot, "purchase-fixture.marker");
  const inside = path => { const child = relative(sourceRoot, path); return child !== ".." && !child.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(child); };
  // A data folder may not exist until index.ts starts. Check its nearest existing
  // ancestor too, so a symlink cannot redirect this source fixture into real data.
  const data = process.env.OMB_DATA_DIR ?? join(home, ".spdbot");
  let ancestor = data;
  while (!existsSync(ancestor) && dirname(ancestor) !== ancestor) ancestor = dirname(ancestor);
  if (!lstatSync(marker).isFile() || readFileSync(marker, "utf8") !== "source-purchase-fresh-profile-v1" ||
      realpathSync(process.env.USERPROFILE ?? "") !== home || !inside(home) || !inside(data) || !inside(realpathSync(ancestor)) ||
      realpathSync(tmpdir()) !== realpathSync(join(sourceRoot, "purchase-tmp"))) throw new Error("purchase fixture requires its fresh source profile");
} else {
  const directory = realpathSync(process.env.OMB_DATA_DIR ?? "");
  if (realpathSync(tmpdir()) !== realpathSync(join(directory, "tmp")) || !basename(directory).startsWith("spdbot-verify-data-") ||
      readFileSync(join(directory, "purchase-fixture.marker"), "utf8") !== "control-omb-fresh-profile-v1") throw new Error("purchase fixture requires its fresh control-omb profile");
}
const shipping = new URL("../../electron/purchase-authority.mjs", import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  const result = nextResolve(specifier, context);
  return result.url === shipping ? { ...result, url: new URL("purchase-authority.mjs", import.meta.url).href } : result;
} });

const prior = process.parentPort;
const listeners = new Set();
const port = prior ?? { on() {}, postMessage() {} };
const on = port.on.bind(port), post = port.postMessage.bind(port);
let rejectPossession;
const possessionFailure = new Promise((_, reject) => { rejectPossession = reject; });
port.on = (event, listener) => { if (event === "message") listeners.add(listener); on(event, listener); };
port.postMessage = message => {
  post(message);
  if (message?.type !== "spdbot:purchase-challenge") return;
  void (async () => {
    const clock = freshClock(Math.floor(Date.now() / 1000));
    const result = await new FakeAuthority(clock).pair(corpus.context.jkt);
    const payload = JSON.parse(Buffer.from(result.access_token.split(".")[1], "base64url").toString());
    const binding = bindingOf(payload, Date.parse(result.session_expires_at) / 1000);
    const { security } = await applyDecision(emptySecurity(binding), result, authority, clock.time.wall);
    const data = { type: "spdbot:purchase-init", nonce: message.nonce, security, clock: { greatest: clock.time.wall, trusted: clock.time.wall }, public_jwk: corpus.keys.device,
      signature: sign(null, possessionBytes(message.nonce, security.lease), createPrivateKey({ key: corpus.keys.online, format: "jwk" })).toString("base64url") };
    for (const listener of listeners) listener({ data });
  })().catch(rejectPossession);
};
if (!prior) Object.defineProperty(process, "parentPort", { value: port });

// Startup work must see a completed, independently verified handshake, just as
// later requests do. Health becoming reachable is not proof of purchase access.
const { purchaseAccess } = await import("../purchase-access.ts");
// Attachment is idempotent on the same private port; index.ts attaches later.
purchaseAccess.attach(port);
let stopWaiting, timeout;
try {
  await Promise.race([possessionFailure, new Promise((resolve, reject) => {
    stopWaiting = purchaseAccess.onChange(allowed => { if (allowed) resolve(); });
    timeout = setTimeout(() => reject(new Error("signed source purchase handshake did not complete")), 10_000);
    void purchaseAccess.check().then(allowed => { if (allowed) resolve(); }, reject);
  })]);
} finally {
  stopWaiting?.();
  clearTimeout(timeout);
}
