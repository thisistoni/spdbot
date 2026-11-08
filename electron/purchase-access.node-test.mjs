import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { createPurchaseDesktop } from "./purchase-desktop.mjs";
import localOrigin from "./local-origin.cjs";
import { PurchaseClient } from "./purchase-client.mjs";
import { PurchaseClock } from "./purchase-clock.mjs";
import { createPurchaseStore } from "./purchase-store.mjs";
import { validateAuthority, PURCHASE_AUTHORITY } from "./purchase-authority.mjs";
import { callback, authorizationURL, possessionBytes, hash } from "./purchase-wire.mjs";
import { applyDecision, emptySecurity, usableLease, validateSecurity, verifyToken } from "./purchase-verifier.mjs";
import { authority, baseLease, claims, corpus, FakeAuthority, freshClock, signToken, trust } from "./testing/purchase/fake-authority.mjs";

const binding = { principal: corpus.context.principal, device_id: corpus.context.device_id, sid: corpus.context.sid, jkt: corpus.context.jkt, session_expires: corpus.now + 2592000 };
const baseSecurity = async () => {
  const lease = corpus.lease_cases[0].jwt;
  const p = claims(lease);
  const status = await signToken({ ...claims(corpus.decisions.restored_status), lease_seq: p.lease_seq, entitlement_revision: p.entitlement_revision }, "status");
  return (await applyDecision(emptySecurity(binding), { access_status: status, offline_lease: lease }, authority, corpus.now)).security;
};
for (const entry of corpus.lease_cases) test(`shared corpus: ${entry.name}`, async () => {
  let s = await baseSecurity();
  s = { ...s, highest_installed_lease_seq: entry.context?.highest_installed_lease_seq ?? entry.highest_installed_lease_seq ?? corpus.context.highest_installed_lease_seq,
    denial_seq: entry.context?.denial_seq ?? entry.denial_seq ?? 0 };
  const verify = async () => {
    const p = await verifyToken(entry.jwt, "lease", authority, binding, corpus.now);
    if (p.lease_seq < s.highest_installed_lease_seq || p.lease_seq <= s.denial_seq || p.entitlement_revision < corpus.context.highest_entitlement_revision) throw new Error("rollback");
  };
  if (entry.expected === "accept") await verify(); else await assert.rejects(verify);
});
for (const field of ["v", "iat", "nbf", "exp", "refresh_after", "lease_seq", "entitlement_revision"]) {
  for (const value of ["3", null, 1.5, Number.MAX_SAFE_INTEGER + 1]) test(`strict ${field}: ${JSON.stringify(value)}`, async () => {
    const jwt = await signToken({ ...baseLease(), [field]: value });
    await assert.rejects(verifyToken(jwt, "lease", authority, binding, corpus.now));
  });
}
test("denial persists, active observation preserves cache, restoration is paired and newer", async () => {
  const s = await baseSecurity();
  const activeOnly = (await applyDecision(s, { access_status: corpus.decisions.restored_status }, authority, corpus.now)).security;
  assert.equal(activeOnly.highest_installed_lease_seq, 42);
  await usableLease(activeOnly, authority, corpus.now);
  await validateSecurity(activeOnly, authority, corpus.now + 1000);
  const denied = (await applyDecision(s, { access_status: corpus.decisions.denial }, authority, corpus.now)).security;
  await assert.rejects(usableLease(denied, authority, corpus.now));
  const afterRestart = await validateSecurity(JSON.parse(JSON.stringify(denied)), authority, corpus.now + 500);
  await assert.rejects(usableLease(afterRestart, authority, corpus.now + 500));
  const observation = (await applyDecision(denied, { access_status: corpus.decisions.restored_status }, authority, corpus.now)).security;
  await assert.rejects(usableLease(observation, authority, corpus.now));
  const restored = (await applyDecision(observation, { access_status: corpus.decisions.restored_status, offline_lease: corpus.decisions.restored_lease }, authority, corpus.now)).security;
  await usableLease(restored, authority, corpus.now);
  await validateSecurity(restored, authority, corpus.now + 600);
  await assert.rejects(applyDecision(restored, { access_status: corpus.decisions.denial }, authority, corpus.now));
  await assert.rejects(validateSecurity({ ...restored, denial_seq: 0 }, authority, corpus.now));
});
test("no expiry grace, fixed refresh and absolute session limit", async () => {
  const s = await baseSecurity();
  await usableLease(s, authority, corpus.now + 259199.999);
  await assert.rejects(usableLease(s, authority, corpus.now + 259200));
  await assert.rejects(verifyToken(await signToken({ ...baseLease(), refresh_after: corpus.now + 86401 }), "lease", authority, binding, corpus.now));
  await assert.rejects(usableLease({ ...s, binding: { ...binding, session_expires: corpus.now + 100 } }, authority, corpus.now));
});
test("header/JSON/rights substitution fails closed", async () => {
  for (const header of [{ jku: "https://evil.invalid/keys" }, { alg: "EdDSA", crit: ["bogus"] }, { kid: "unknown" }]) {
    await assert.rejects(async () => verifyToken(await signToken(baseLease(), "lease", header), "lease", authority, binding, corpus.now));
  }
  for (const change of [{ rights: ["local.run", "enterprise"] }, { policy_version: "other" }, { cnf: { jkt: binding.jkt, evil: true } }, { future: true }]) {
    await assert.rejects(verifyToken(await signToken({ ...baseLease(), ...change }), "lease", authority, binding, corpus.now));
  }
  const jwt = corpus.lease_cases[0].jwt;
  const parts = jwt.split(".");
  parts[1] = Buffer.from('{"v":1,"v":1}').toString("base64url");
  await assert.rejects(verifyToken(parts.join("."), "lease", authority, binding, corpus.now));
});
test("shipping trust rejects empty, synthetic, preview substitution and runtime flags", () => {
  assert.throws(() => validateAuthority());
  assert.throws(() => validateAuthority({ ...authority, environment: "production", origin: "https://spdlabs.dev" }));
  assert.throws(() => validateAuthority({ ...authority, environment: "production" }));
  process.env.SPDBOT_PURCHASE_BYPASS = "1";
  try { assert.throws(() => validateAuthority(PURCHASE_AUTHORITY)); } finally { delete process.env.SPDBOT_PURCHASE_BYPASS; }
});
test("contract possession bytes bind exact compact lease", () => {
  assert.equal(possessionBytes(corpus.possession.nonce, corpus.lease_cases[0].jwt).toString("base64url"), corpus.possession.signed_bytes_base64url);
  assert.equal(hash(corpus.lease_cases[0].jwt), corpus.possession.lease_sha256);
});
test("clock: rollback, monotonic elapsed, forward jump and restart never renew expiry", () => {
  const f = freshClock();
  const clock = new PurchaseClock(null, f.options);
  clock.observeSigned(corpus.now);
  f.advance(100);
  const saved = clock.snapshot();
  f.time.wall -= 61;
  clock.now(); assert.equal(clock.rollback, true);
  const restart = new PurchaseClock(saved, f.options); assert.equal(restart.rollback, true);
  f.time.wall += 1000000;
  assert.ok(restart.now() >= corpus.now + 1000000);
  const jumped = restart.snapshot();
  f.time.wall = corpus.now + 100;
  assert.equal(new PurchaseClock(jumped, f.options).rollback, true);
  const monotonic = freshClock(); const c = new PurchaseClock(null, monotonic.options);
  monotonic.time.mono += 259200;
  assert.ok(c.now() >= corpus.now + 259200);
});

async function clientFixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "spdbot-purchase-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const f = freshClock(); const fake = new FakeAuthority(f); const key = randomBytes(32);
  const encryption = { available: async () => true,
    async encrypt(text) { const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv); return Buffer.concat([iv, cipher.update(text), cipher.final(), cipher.getAuthTag()]); },
    async decrypt(data) { const cipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12)); cipher.setAuthTag(data.subarray(-16)); return Buffer.concat([cipher.update(data.subarray(12, -16)), cipher.final()]).toString(); } };
  const file = path.join(dir, "purchase-access.bin");
  const store = createPurchaseStore(file, encryption); const opened = [];
  const options = { store, authority, trust, clockOptions: f.options, fetch: fake.fetch, openExternal: async url => opened.push(url), version: "0.1.116", platform: "win32" };
  const client = new PurchaseClient(options); await client.start();
  return { client, fake, f, file, store, options, encryption, opened };
}
const connect = async ({ client, fake }) => { await client.connect(); await client.receiveCallback(fake.callback(client)); assert.equal((await client.state()).allowed, true); };

test("website HTTP timestamps retain milliseconds while signed deadlines stay integral", async t => {
  const f = await clientFixture(t);
  f.f.advance(0.123); f.fake.sessionExpires = f.f.time.wall + 600;
  await connect(f);
  assert.equal(f.opened.length, 1);
  assert.equal(f.client.record.security.binding.session_expires, corpus.now + 600);
  assert.equal((await f.client.state()).expiresAt, corpus.now + 600);
  f.f.advance(599.877);
  assert.equal((await f.client.state()).allowed, false);
});

test("invalid calendar dates in HTTP responses are rejected", async t => {
  const f = await clientFixture(t);
  const original = f.client.fetch;
  f.client.fetch = async (...args) => {
    const response = await original(...args);
    return Response.json({ ...await response.json(), expires_at: "2030-02-30T00:00:00.123Z" });
  };
  await f.client.connect();
  assert.equal(f.opened.length, 0); assert.equal(f.client.pending, null);
});

for (const cause of ["expiry", "rollback", "signout"]) test(`Main rejects ${cause} during asynchronous lease verification`, async t => {
  const f = await clientFixture(t); await connect(f);
  const state = f.client.state();
  let signout;
  if (cause === "expiry") f.f.advance(259200);
  else if (cause === "rollback") f.f.time.wall -= 3600;
  else signout = f.client.signOut();
  assert.equal((await state).allowed, false);
  await signout;
});
test("browser PKCE, strict callback, duplicate race, encrypted restart/offline", async t => {
  const f = await clientFixture(t); await f.client.connect();
  const link = f.fake.callback(f.client);
  for (const injected of [link + "&extra=x", link + "&state=x", link.replace("auth/", "evil/"), link.replace("callback?", "callback%3F?"), link + "#fragment", link.replace("://", "://user@"), link.replace("&code=", "&code=%")]) {
    await assert.rejects(async () => callback(injected, "spdbot-preview:")); assert.equal(await f.client.receiveCallback(injected), false);
  }
  assert.equal(await f.client.receiveCallback(link.replace(f.client.pending.state, randomBytes(32).toString("base64url"))), false);
  const results = await Promise.all([f.client.receiveCallback(link), f.client.receiveCallback(link)]);
  assert.deepEqual(results, [true, false]);
  assert.equal((await f.client.state()).allowed, true);
  const bytes = await readFile(f.file); assert.equal(bytes.includes(Buffer.from(f.client.record.key.d)), false);
  assert.equal(bytes.includes(Buffer.from(f.client.record.credentials.refresh)), false);
  const renderer = JSON.stringify(await f.client.state());
  assert.equal(renderer.includes(f.client.record.key.d), false); assert.equal(renderer.includes(f.client.record.credentials.refresh), false);
  f.options.fetch = async () => { throw new Error("offline"); };
  f.f.advance(86400); const restarted = new PurchaseClient(f.options); await restarted.start();
  assert.equal((await restarted.state()).allowed, true);
  assert.equal(restarted.record.security.lease, f.client.record.security.lease);
  await restarted.tick(); assert.equal((await restarted.state()).allowed, true);
  f.f.advance(172800); assert.equal((await restarted.state()).allowed, false);
});
test("allowlisted HTTPS authorization only", async t => {
  const f = await clientFixture(t); await f.client.connect(); const p = f.client.pending;
  for (const raw of [f.opened[0].replace(authority.origin, "https://evil.invalid"), f.opened[0] + "&state=x", f.opened[0] + "#x", f.opened[0].replace("https:", "http:"), f.opened[0].replace("/desktop/authorize", "/account")]) {
    assert.throws(() => authorizationURL(raw, authority, p.requestId, p.state));
  }
});
test("cold callback, canceled/expired code and nonbuyer never grant", async t => {
  const f = await clientFixture(t); await f.client.connect(); const link = f.fake.callback(f.client);
  const cold = new PurchaseClient(f.options); await cold.start(); assert.equal(await cold.receiveCallback(link), false);
  f.f.advance(600); assert.equal(await f.client.receiveCallback(link), false);
  await f.client.connect(); f.fake.paid = false; await f.client.receiveCallback(f.fake.callback(f.client));
  assert.equal((await f.client.state()).allowed, false);
});
test("refresh serialized; response loss retires credential across restart without shortening valid lease", async t => {
  const f = await clientFixture(t); await connect(f); const lease = f.client.record.security.lease;
  const token = f.client.record.credentials.refresh;
  f.fake.dropRefresh = true;
  await Promise.all([f.client.refresh(), f.client.refresh(), f.client.refresh()]);
  assert.equal(f.fake.requests.filter(r => r.options.body?.includes(token)).length, 1);
  assert.equal(f.client.record.credentials, null); assert.equal(f.client.record.security.lease, lease);
  assert.equal((await f.client.state()).allowed, true);
  const restarted = new PurchaseClient(f.options); await restarted.start(); await restarted.refresh();
  assert.equal(f.fake.requests.filter(r => r.options.body?.includes(token)).length, 1);
  assert.equal((await restarted.state()).allowed, true);
});
test("signed denial disables immediately and persists offline; signout preserves adjacent data", async t => {
  const f = await clientFixture(t); await connect(f);
  const history = path.join(path.dirname(f.file), "history.json"); await writeFile(history, "preserved");
  f.fake.deny = true; await f.client.refresh(); assert.equal((await f.client.state()).allowed, false);
  const restarted = new PurchaseClient(f.options); await restarted.start(); assert.equal((await restarted.state()).allowed, false);
  await restarted.signOut(); assert.equal(restarted.record.key, null); assert.equal(restarted.record.security, null);
  assert.equal(await readFile(history, "utf8"), "preserved");
});
test("missing, corrupt, unavailable encryption and failed atomic writes never create access", async t => {
  const f = await clientFixture(t); assert.equal((await f.client.state()).allowed, false);
  await connect(f); await writeFile(f.file, "corrupt");
  const broken = new PurchaseClient(f.options); await broken.start(); assert.equal((await broken.state()).allowed, false);
  f.encryption.available = async () => false;
  const unavailable = new PurchaseClient(f.options); await unavailable.start(); assert.equal((await unavailable.state()).allowed, false);
  await f.client.tick().catch(() => {}); assert.equal((await f.client.state()).allowed, false);
});
test("interrupted storage update blocks the old record; signout clears even without encryption", async t => {
  const f = await clientFixture(t); await connect(f);
  const original = f.encryption.encrypt;
  f.encryption.encrypt = async () => { throw new Error("synthetic interrupted commit"); };
  await assert.rejects(f.client.refresh());
  f.encryption.encrypt = original;
  const restart = new PurchaseClient(f.options); await restart.start();
  assert.equal((await restart.state()).allowed, false);
  f.encryption.available = async () => false;
  await restart.signOut();
  f.encryption.available = async () => true;
  const empty = new PurchaseClient(f.options); await empty.start(); assert.equal((await empty.state()).allowed, false);
});

test("storage reset permits a new connection in the same process without reusing access or deleting history", async t => {
  const f = await clientFixture(t); await connect(f);
  const oldKey = f.client.record.key.x, oldLease = f.client.record.security.lease;
  const adjacent = path.join(path.dirname(f.file), "provider-history.json"); await writeFile(adjacent, "preserved");
  const encrypt = f.encryption.encrypt;
  f.encryption.encrypt = async () => { throw new Error("interrupted update"); };
  await assert.rejects(f.client.refresh()); f.encryption.encrypt = encrypt;
  const restarted = new PurchaseClient(f.options); await restarted.start();
  assert.equal((await restarted.state()).issue, "secure_storage_unavailable");
  await restarted.signOut();
  assert.equal(restarted.enabled, true);
  assert.equal(restarted.record.security, null); assert.equal(restarted.record.key, null);
  assert.equal((await restarted.state()).allowed, false);
  await connect({ client: restarted, fake: f.fake });
  assert.notEqual(restarted.record.key.x, oldKey); assert.notEqual(restarted.record.security.lease, oldLease);
  assert.equal(await readFile(adjacent, "utf8"), "preserved");
  const again = new PurchaseClient(f.options); await again.start(); assert.equal((await again.state()).allowed, true);
});
test("Electron async decryption result object is supported", async t => {
  const f = await clientFixture(t); await connect(f);
  const decrypt = f.encryption.decrypt;
  f.encryption.decrypt = async bytes => ({ result: await decrypt(bytes), shouldReEncrypt: false });
  const restarted = new PurchaseClient(f.options); await restarted.start(); assert.equal((await restarted.state()).allowed, true);
});
test("a corrupted trusted baseline cannot replace the signed observation", async t => {
  const f = await clientFixture(t); await connect(f);
  await f.store.write({ ...f.client.record, clock: { ...f.client.record.clock, trusted: 0 } });
  const restarted = new PurchaseClient(f.options); await restarted.start(); assert.equal((await restarted.state()).allowed, false);
});
test("a newer signed denial survives small authority clock rollback and restart", async t => {
  const f = await clientFixture(t); await connect(f);
  const before = f.client.record.security;
  const denied = await signToken({ ...claims(corpus.decisions.denial), sub: before.binding.principal, sid: before.binding.sid,
    device_id: before.binding.device_id, cnf: { jkt: before.binding.jkt }, lease_seq: before.highest_decision_seq + 1, iat: corpus.now - 1, exp: corpus.now + 299 }, "status");
  await f.client.consume({ ok: false, data: { access_status: denied } });
  assert.equal((await f.client.state()).allowed, false);
  assert.equal(f.client.record.clock.trusted, corpus.now);
  const restarted = new PurchaseClient(f.options); await restarted.start();
  assert.equal(restarted.record.security.denial_seq, before.highest_decision_seq + 1);
  assert.equal((await restarted.state()).allowed, false);
});
test("purchase IPC rejects remote origins, other windows, subframes and injected arguments", async () => {
  const app = new EventEmitter();
  Object.assign(app, { getPath: () => tmpdir(), getVersion: () => "fixture" });
  const handlers = new Map();
  const frame = { url: "http://127.0.0.1:19999/" };
  const owner = { mainFrame: frame, getURL: () => frame.url };
  const state = { allowed: false, connected: false, state: "restricted", expiresAt: null, issue: null };
  const controller = createPurchaseDesktop({ app, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, powerMonitor: new EventEmitter(),
    safeStorage: {}, shell: {}, fetch: async () => {}, guard: localOrigin.localOnly, window: () => ({ webContents: owner }),
    createClient: () => ({ start: async () => {}, state: async () => state }) });
  localOrigin.setLocalOrigin(new URL(frame.url).origin);
  await controller.start();
  try {
    const handler = handlers.get("purchase:state");
    assert.deepEqual(await handler({ sender: owner, senderFrame: frame }), state);
    await assert.rejects(async () => handler({ sender: { ...owner }, senderFrame: frame }));
    await assert.rejects(async () => handler({ sender: owner, senderFrame: { url: frame.url } }));
    await assert.rejects(async () => handler({ sender: owner, senderFrame: { url: "https://evil.invalid/" } }));
    await assert.rejects(async () => handler({ sender: owner, senderFrame: frame }, "https://evil.invalid/authority"));
    assert.deepEqual([...handlers.keys()], ["purchase:state", "purchase:connect", "purchase:refresh", "purchase:signOut"]);
  } finally { app.emit("before-quit"); localOrigin.setLocalOrigin(null); }
});

test("desktop CUA context refuses remote access and starts only on later access transitions", async () => {
  const app = new EventEmitter(); Object.assign(app, { getPath: () => tmpdir(), getVersion: () => "fixture" });
  let publish;
  let state = { allowed: true, expiresAt: null };
  const transitions = [];
  const controller = createPurchaseDesktop({ app, safeStorage: {}, ipcMain: { handle() {} }, powerMonitor: new EventEmitter(), shell: {},
    guard: (_channel, handler) => handler, window: () => null, executionChanged: value => transitions.push(value),
    createClient: options => { publish = options.changed; return { start: () => publish(state), state: async () => state }; } });
  await controller.start();
  try {
    assert.deepEqual(transitions, []);
    assert.equal(await controller.cuaAllowed(() => true), false);
    assert.equal(await controller.cuaAllowed(() => false), true);
    state = { allowed: false, expiresAt: null }; await publish(state);
    assert.equal(await controller.cuaAllowed(() => false), false);
    state = { allowed: true, expiresAt: null }; await publish(state);
    assert.deepEqual(transitions, [false, true]);
  } finally { app.emit("before-quit"); }
});
for (const kind of ["status", "online"]) for (const field of ["v", "iat", "exp", ...(kind === "status" ? ["lease_seq", "entitlement_revision"] : ["nbf"])]) {
  for (const value of ["1", null, 1.5, Number.MAX_SAFE_INTEGER + 1]) test(`strict ${kind} ${field}: ${JSON.stringify(value)}`, async () => {
    const original = claims(kind === "status" ? corpus.decisions.restored_status : corpus.online_access);
    await assert.rejects(verifyToken(await signToken({ ...original, [field]: value }, kind), kind, authority, binding, corpus.now));
  });
}
