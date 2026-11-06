import { randomBytes, sign, createPrivateKey, createPublicKey } from "node:crypto";
import { SignJWT, importJWK } from "./purchase-jose.mjs";
import { PURCHASE_AUTHORITY, validateAuthority } from "./purchase-authority.mjs";
import { PurchaseClock } from "./purchase-clock.mjs";
import { applyDecision, bindingOf, deviceThumbprint, emptySecurity, usableLease, validateSecurity, verifyToken } from "./purchase-verifier.mjs";
import { authorizationURL, callback, equal, exact, hash, integer, opaque, possessionBytes, publicJwk, strictJSON, uuid } from "./purchase-wire.mjs";

const secret = () => randomBytes(32).toString("base64url");
const iso = value => {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) throw new Error("invalid_access_response");
  const milliseconds = Date.parse(value);
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== canonical) throw new Error("invalid_access_response");
  // HTTP timestamps retain milliseconds; signed NumericDates use whole seconds.
  // Round deadlines down so this conversion can never extend a session.
  const result = Math.floor(milliseconds / 1000);
  if (!integer(result)) throw new Error("invalid_access_response");
  return result;
};

export class PurchaseClient {
  constructor({ store, fetch: fetcher, openExternal, version, platform, authority = PURCHASE_AUTHORITY, clockOptions, changed = () => {}, trust = validateAuthority }) {
    this.store = store; this.fetch = fetcher; this.openExternal = openExternal;
    this.version = version; this.platform = platform; this.authority = authority; this.trust = trust;
    this.clockOptions = clockOptions; this.clock = new PurchaseClock(null, clockOptions);
    this.record = { v: 1, key: null, credentials: null, security: null, clock: this.clock.snapshot() };
    this.changed = changed; this.pending = null; this.queue = Promise.resolve(); this.refreshing = null;
    this.issue = null; this.enabled = false; this.generation = 0;
  }
  serialize(work) {
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }
  async start() {
    return this.serialize(async () => {
      try { this.trust(this.authority); }
      catch {
        this.issue = "access_service_unavailable"; this.enabled = false;
        await this.publish(); return this.state();
      }
      try {
        const saved = await this.store.read();
        if (saved) {
          exact(saved, ["v", "key", "credentials", "security", "clock"]);
          if (saved.v !== 1) throw new Error("access_storage_corrupt");
          this.clock = new PurchaseClock(saved.clock, this.clockOptions);
          if (saved.key) await this.validateKey(saved.key);
          if (saved.security) {
            await validateSecurity(saved.security, this.authority, this.clock.now());
            if (!saved.key || saved.security.binding.jkt !== await deviceThumbprint(publicPart(saved.key))) throw new Error("wrong_access_binding");
            const observation = await verifyToken(saved.security.trustedStatus, "status", this.authority, saved.security.binding, this.clock.now(), { historical: true });
            if (saved.clock.trusted !== observation.iat) throw new Error("invalid_access_clock");
          }
          if (saved.credentials) {
            exact(saved.credentials, ["refresh", "access"]);
            if (!opaque(saved.credentials.refresh) || typeof saved.credentials.access !== "string" || !saved.security) throw new Error("access_storage_corrupt");
            await verifyToken(saved.credentials.access, "online", this.authority, saved.security.binding, this.clock.now(), { historical: true });
          }
          this.record = saved;
        }
        this.enabled = true;
        await this.persist(this.record);
        this.issue = null;
      } catch { this.issue = "secure_storage_unavailable"; this.enabled = false; }
      await this.publish();
      return this.state();
    });
  }
  async validateKey(key) {
    exact(key, ["kty", "crv", "x", "d"]);
    publicJwk(publicPart(key));
    if (!opaque(key.d) || createPublicKey(createPrivateKey({ key, format: "jwk" })).export({ format: "jwk" }).x !== key.x) throw new Error("invalid_device_key");
  }
  async persist(next) {
    try {
      const saved = { ...next, clock: this.clock.snapshot() };
      await this.store.write(saved);
      this.record = saved;
    } catch {
      this.enabled = false; this.issue = "secure_storage_unavailable";
      await this.publish();
      throw new Error("secure_storage_unavailable");
    }
  }
  async proof(method, path, key = this.record.key, access) {
    const claims = { htm: method, htu: `${this.authority.origin}/api/commerce/v1/desktop/${path}`, iat: Math.floor(this.clock.now()), jti: secret(), ...(access ? { ath: hash(access) } : {}) };
    return new SignJWT(claims).setProtectedHeader({ alg: "EdDSA", typ: "dpop+jwt", jwk: publicPart(key) }).sign(await importJWK(key, "EdDSA"));
  }
  async request(path, body, access) {
    const method = body === undefined ? "GET" : "POST";
    const response = await this.fetch(`${this.authority.origin}/api/commerce/v1/desktop/${path}`, {
      method, redirect: "error", cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json", DPoP: await this.proof(method, path, this.record.key, access), ...(access ? { Authorization: `DPoP ${access}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204) return { ok: response.ok, data: null };
    if (Number(response.headers.get("content-length")) > 65536) throw new Error("invalid_access_response");
    // Bound the streaming body too; Content-Length is not authority.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("invalid_access_response");
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 65536) throw new Error("invalid_access_response");
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    const data = strictJSON(Buffer.concat(chunks).toString("utf8"));
    return { ok: response.ok, data };
  }
  connect() {
    return this.serialize(async () => {
      if (!this.enabled) return this.state();
      this.pending = null; this.generation++;
      if (!this.record.key) {
        const { generateKeyPairSync } = await import("node:crypto");
        const { privateKey } = generateKeyPairSync("ed25519");
        await this.persist({ ...this.record, key: privateKey.export({ format: "jwk" }) });
      }
      const state = secret(), verifier = secret();
      try {
        if (!["win32", "darwin"].includes(this.platform)) throw new Error("unsupported_platform");
        const { ok, data } = await this.request("authorizations", { contract_version: 1, code_challenge: hash(verifier), code_challenge_method: "S256", state,
          device: { public_jwk: publicPart(this.record.key), platform: this.platform, app_version: this.version } });
        if (!ok) throw new Error("connection_unavailable");
        exact(data, ["request_id", "authorization_url", "expires_at", "server_time"]);
        if (!uuid(data.request_id)) throw new Error("invalid_access_response");
        const expires = iso(data.expires_at), server = iso(data.server_time);
        if (expires <= server || expires - server > 600) throw new Error("invalid_access_response");
        const url = authorizationURL(data.authorization_url, this.authority, data.request_id, state);
        this.pending = { requestId: data.request_id, state, verifier, expires: Math.min(expires, this.clock.now() + 600), generation: this.generation };
        await this.openExternal(url);
        this.issue = null;
      } catch { this.pending = null; this.issue = "connection_unavailable"; }
      await this.publish();
      return this.state();
    });
  }
  accepts(raw) { return typeof raw === "string" && /^spdbot:\/\/auth(?:[/:?#]|$)/i.test(raw); }
  receiveCallback(raw) {
    // Claim synchronously, before async redemption: concurrent warm callbacks cannot redeem twice.
    let data;
    try { data = callback(raw); } catch { return Promise.resolve(false); }
    const pending = this.pending;
    if (!pending || data.request_id !== pending.requestId || !equal(data.state, pending.state) || this.clock.now() >= pending.expires) return Promise.resolve(false);
    this.pending = null;
    return this.serialize(async () => {
      if (pending.generation !== this.generation || !this.enabled) return false;
      try {
        const response = await this.request("token", { grant_type: "authorization_code", request_id: pending.requestId, code: data.code, code_verifier: pending.verifier });
        await this.consume(response, true);
      } catch { this.issue = "connection_unavailable"; }
      await this.publish();
      return true;
    });
  }
  async consume({ ok, data }, newSession = false) {
    if (!ok) {
      if (data?.access_status && this.record.security) {
        const result = await applyDecision(this.record.security, data, this.authority, this.clock.now());
        if (result.status.state !== "active") {
          // Restrict immediately even if disk subsequently fails.
          this.record = { ...this.record, security: result.security, credentials: null };
          await this.publish();
          this.clock.observeSigned(result.status.iat);
          await this.persist(this.record);
        }
      }
      this.issue = "connection_unavailable";
      return;
    }
    exact(data, ["contract_version", "token_type", "access_token", "expires_in", "refresh_token", "session_expires_at", "device_id", "access_status", "offline_lease", "server_time"]);
    if (data.contract_version !== 1 || data.token_type !== "DPoP" || !opaque(data.refresh_token) || !integer(data.expires_in) || data.expires_in < 1 || data.expires_in > 300) throw new Error("invalid_access_response");
    const now = this.clock.now();
    const online = await verifyToken(data.access_token, "online", this.authority, newSession ? null : this.record.security?.binding, now);
    const binding = bindingOf(online, iso(data.session_expires_at));
    if (binding.jkt !== await deviceThumbprint(publicPart(this.record.key)) || data.device_id !== binding.device_id || data.expires_in !== online.exp - online.iat || online.exp > binding.session_expires) throw new Error("wrong_access_binding");
    const previous = !newSession || this.record.security?.binding.sid === binding.sid ? this.record.security : null;
    const { security, status } = await applyDecision(previous ?? emptySecurity(binding), data, this.authority, now);
    if (status.state !== "active" || !data.offline_lease || iso(data.server_time) !== status.iat) throw new Error("invalid_access_response");
    this.clock.observeSigned(status.iat);
    await this.persist({ ...this.record, security, credentials: { refresh: data.refresh_token, access: data.access_token } });
    this.issue = null;
  }
  refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.serialize(async () => {
      if (!this.enabled || !this.record.credentials) return this.state();
      const refresh = this.record.credentials.refresh;
      // Retire durably BEFORE sending; process death/response loss never replays a rotating token.
      await this.persist({ ...this.record, credentials: null });
      try { await this.consume(await this.request("token", { grant_type: "refresh_token", refresh_token: refresh })); }
      catch { this.issue = "reauthentication_required"; }
      await this.publish();
      return this.state();
    }).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  signOut() {
    this.generation++; this.pending = null;
    this.enabled = false;
    void this.publish();
    return this.serialize(async () => {
      const old = this.record;
      this.record = { v: 1, key: null, credentials: null, security: null, clock: this.clock.snapshot() };
      await this.publish();
      try {
        await this.store.clear();
        // Reading the now-empty store rechecks OS encryption without reviving old credentials.
        await this.store.read();
        this.clock = new PurchaseClock(null, this.clockOptions);
        this.record = { ...this.record, clock: this.clock.snapshot() };
        try { this.trust(this.authority); this.enabled = true; this.issue = null; }
        catch { this.issue = "access_service_unavailable"; }
      } catch { this.issue = "secure_storage_unavailable"; }
      await this.publish();
      if (old.credentials && old.key) {
        // Logout may safely use a known old generation, but never refresh it.
        const body = { refresh_token: old.credentials.refresh };
        try {
          await this.fetch(`${this.authority.origin}/api/commerce/v1/desktop/logout`, { method: "POST", redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(5000),
            headers: { "content-type": "application/json", DPoP: await this.proof("POST", "logout", old.key) }, body: JSON.stringify(body) });
        } catch { /* Local sign-out is already durable. */ }
      }
      return this.state();
    });
  }
  async tick() {
    await this.serialize(async () => { if (this.enabled) await this.persist(this.record); await this.publish(); });
    const s = this.record.security;
    if (s && this.record.credentials) {
      const lease = await verifyToken(s.lease, "lease", this.authority, s.binding, this.clock.now(), { historical: true });
      if (this.clock.now() >= lease.refresh_after) return this.refresh();
    }
  }
  async state() {
    const now = this.clock.now();
    const security = this.record.security, generation = this.generation;
    let lease = null;
    if (this.enabled && !this.clock.rollback) {
      try { lease = await usableLease(security, this.authority, now); } catch { /* Restricted. */ }
    }
    const currentTime = this.clock.now();
    if (!this.enabled || this.clock.rollback || generation !== this.generation || security !== this.record.security ||
        (lease && currentTime >= Math.min(lease.exp, security.binding.session_expires))) lease = null;
    return { allowed: !!lease, connected: !!this.record.key || !!this.pending, state: lease ? "active" : this.pending ? "connecting" : "restricted", expiresAt: lease?.exp ?? null,
      issue: !this.enabled && this.issue ? this.issue : this.clock.rollback ? "clock_verification_required" : this.issue };
  }
  async publicSecurity() {
    return this.enabled && this.record.security && this.record.key ? { security: this.record.security, clock: this.clock.snapshot() } : null;
  }
  async possession(nonce) {
    if (!opaque(nonce)) throw new Error("invalid_startup_nonce");
    const bundle = await this.publicSecurity();
    if (!bundle || !this.record.key) return null;
    return { ...bundle, public_jwk: publicPart(this.record.key), signature: sign(null, possessionBytes(nonce, bundle.security.lease), createPrivateKey({ key: this.record.key, format: "jwk" })).toString("base64url") };
  }
  async publish() { await this.changed(await this.state()); }
}
export const publicPart = key => ({ kty: key.kty, crv: key.crv, x: key.x });
