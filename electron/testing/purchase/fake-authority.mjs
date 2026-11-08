// PUBLIC SYNTHETIC test authority. Excluded from packages and production trust.
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { SignJWT, importJWK, compactVerify, calculateJwkThumbprint } from "../../purchase-jose.mjs";
import { hash, strictJSON } from "../../purchase-wire.mjs";
export const corpus = JSON.parse(readFileSync(new URL("access-v1.json", import.meta.url), "utf8"));
const pub = ({ d: _d, ...key }) => key;
export const authority = { environment: "preview", origin: corpus.context.issuer, onlineKeys: [pub(corpus.keys.online)], leaseKeys: [pub(corpus.keys.lease)] };
export const trust = () => {}; // Constructor injection only, never a runtime mode or environment switch.
export const freshClock = (initial = corpus.now) => {
  const time = { wall: initial, mono: 0 };
  return { time, options: { wall: () => time.wall, mono: () => time.mono }, advance(seconds) { time.wall += seconds; time.mono += seconds; } };
};
export const signToken = async (claims, kind = "lease", header = {}) => {
  const types = { lease: "spd-offline-lease+jwt", status: "spd-access-status+jwt", online: "spd-online-access+jwt" };
  const key = kind === "online" ? corpus.keys.online : corpus.keys.lease;
  return new SignJWT(claims).setProtectedHeader({ alg: "EdDSA", typ: types[kind], kid: key.kid, ...header }).sign(await importJWK(key, "EdDSA"));
};
export const claims = raw => strictJSON(Buffer.from(raw.split(".")[1], "base64url").toString());
export const baseLease = () => claims(corpus.lease_cases[0].jwt);

export class FakeAuthority {
  constructor(clock) { this.clock = clock; this.sessionExpires = clock.time.wall + 2592000; this.requests = []; this.codes = new Map(); this.refreshes = new Map(); this.proofs = new Set(); this.seq = 0; this.paid = true; this.dropRefresh = false; this.deny = false; }
  async pair(jkt) {
    const now = Math.floor(this.clock.time.wall);
    const binding = { ...corpus.context, jkt };
    const common = { v: 1, iss: authority.origin, sub: binding.principal, environment: authority.environment, product: "spdbot-desktop", device_id: binding.device_id, sid: binding.sid, cnf: { jkt }, iat: now };
    const seq = ++this.seq;
    const access_status = await signToken({ ...common, aud: "spdbot-desktop-status-v1", state: this.deny ? "revoked" : "active", reason_code: this.deny ? "access_revoked" : "active", entitlement_revision: this.deny ? 4 : 3, lease_seq: seq, exp: now + 300, jti: randomUUID() }, "status");
    if (this.deny) return { access_status, server_time: new Date(now * 1000).toISOString() };
    const exp = Math.min(now + 259200, Math.floor(this.sessionExpires));
    const offline_lease = await signToken({ ...baseLease(), ...common, nbf: now, lease_seq: seq, exp, refresh_after: Math.min(now + 86400, exp), jti: randomUUID() });
    const access_token = await signToken({ ...common, aud: "spdbot-commerce-api", nbf: now, exp: now + 300, jti: randomUUID() }, "online");
    const refresh_token = randomBytes(32).toString("base64url"); this.refreshes.set(refresh_token, jkt);
    return { contract_version: 1, token_type: "DPoP", access_token, expires_in: 300, refresh_token, session_expires_at: new Date(this.sessionExpires * 1000).toISOString(), device_id: binding.device_id, access_status, offline_lease, server_time: new Date(this.clock.time.wall * 1000).toISOString() };
  }
  callback(client) {
    const p = client.pending, code = randomBytes(32).toString("base64url");
    this.codes.set(code, { id: p.requestId, challenge: hash(p.verifier), jkt: null });
    return `spdbot-preview://auth/callback?request_id=${p.requestId}&code=${code}&state=${p.state}`;
  }
  fetch = async (url, options) => {
    this.requests.push({ url, options });
    const header = strictJSON(Buffer.from(options.headers.DPoP.split(".")[0], "base64url").toString());
    const verified = await compactVerify(options.headers.DPoP, await importJWK(header.jwk, "EdDSA"));
    const p = strictJSON(Buffer.from(verified.payload).toString());
    if (p.htm !== options.method || p.htu !== url || Math.abs(this.clock.time.wall - p.iat) > 60 || this.proofs.has(p.jti) || options.credentials !== "omit" || options.redirect !== "error") throw new Error("proof");
    this.proofs.add(p.jti);
    const jkt = await calculateJwkThumbprint(header.jwk, "sha256");
    const body = options.body ? strictJSON(options.body) : null;
    if (url.endsWith("/authorizations")) {
      const request_id = randomUUID();
      return Response.json({ request_id, authorization_url: `${authority.origin}/desktop/authorize?request_id=${request_id}&state=${body.state}`, expires_at: new Date((this.clock.time.wall + 600) * 1000).toISOString(), server_time: new Date(this.clock.time.wall * 1000).toISOString() }, { status: 201 });
    }
    if (url.endsWith("/logout")) return new Response(null, { status: 204 });
    if (!this.paid) return Response.json({ error: { code: "purchase_required" } }, { status: 403 });
    if (body.grant_type === "authorization_code") {
      const code = this.codes.get(body.code); this.codes.delete(body.code);
      if (!code || code.id !== body.request_id || code.challenge !== hash(body.code_verifier)) return Response.json({ error: { code: "invalid_grant" } }, { status: 400 });
      return Response.json(await this.pair(jkt));
    }
    if (this.refreshes.get(body.refresh_token) !== jkt) return Response.json({ error: { code: "invalid_grant" } }, { status: 400 });
    this.refreshes.delete(body.refresh_token);
    const result = await this.pair(jkt);
    if (this.dropRefresh) throw new Error("synthetic response lost after rotation");
    return Response.json(result, { status: this.deny ? 403 : 200 });
  };
}
