import { compactVerify, importJWK, calculateJwkThumbprint } from "./purchase-jose.mjs";
import { exact, integer, opaque, publicJwk, strictJSON, uuid } from "./purchase-wire.mjs";

export const MAX_ACCEPTED_OFFLINE_LEASE_SECONDS = 259200;
const common = ["v", "iss", "aud", "sub", "environment", "product", "device_id", "sid", "cnf", "iat", "exp", "jti"];
const extras = {
  lease: ["entitlement_id", "entitlement_revision", "rights", "policy_version", "lease_seq", "nbf", "refresh_after"],
  status: ["state", "reason_code", "entitlement_revision", "lease_seq"],
  online: ["nbf"],
};
const kinds = {
  lease: ["spd-offline-lease+jwt", "spdbot-desktop-offline-v1"],
  status: ["spd-access-status+jwt", "spdbot-desktop-status-v1"],
  online: ["spd-online-access+jwt", "spdbot-commerce-api"],
};
const reasons = ["active", "access_suspended", "access_revoked", "purchase_required", "payment_pending", "device_revoked", "session_revoked", "session_expired"];

export async function verifyToken(raw, kind, authority, binding, now, { historical = false } = {}) {
  if (typeof raw !== "string" || raw.length > 8192 || !Number.isFinite(now)) throw new Error("invalid_access_token");
  const parts = raw.split(".");
  if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p) || Buffer.from(p, "base64url").toString("base64url") !== p)) throw new Error("invalid_access_token");
  const header = exact(strictJSON(Buffer.from(parts[0], "base64url").toString("utf8")), ["alg", "typ", "kid"]);
  const [typ, aud] = kinds[kind];
  if (header.alg !== "EdDSA" || header.typ !== typ || typeof header.kid !== "string") throw new Error("invalid_access_token");
  const key = (kind === "online" ? authority.onlineKeys : authority.leaseKeys).find(k => k.kid === header.kid);
  if (!key) throw new Error("untrusted_access_key");
  const verified = await compactVerify(raw, await importJWK(key, "EdDSA"), { algorithms: ["EdDSA"] });
  const p = exact(strictJSON(Buffer.from(verified.payload).toString("utf8")), [...common, ...extras[kind]]);
  if ([...common, ...extras[kind]].some(k => !Object.hasOwn(p, k))) throw new Error("invalid_access_token");
  exact(p.cnf, ["jkt"]);
  if (p.v !== 1 || p.iss !== authority.origin || p.aud !== aud || p.environment !== authority.environment || p.product !== "spdbot-desktop" ||
      !uuid(p.sub) || !uuid(p.sid) || !uuid(p.device_id) || !opaque(p.cnf.jkt) || !uuid(p.jti) ||
      !integer(p.iat) || !integer(p.exp) || p.exp <= p.iat ||
      p.exp - p.iat > (kind === "lease" ? MAX_ACCEPTED_OFFLINE_LEASE_SECONDS : 300)) throw new Error("invalid_access_token");
  if (binding && (p.sub !== binding.principal || p.sid !== binding.sid || p.device_id !== binding.device_id || p.cnf.jkt !== binding.jkt)) throw new Error("wrong_access_binding");
  if (kind !== "status" && (!integer(p.nbf) || p.nbf !== p.iat)) throw new Error("invalid_access_times");
  if (p.iat > now + 60 || (!historical && p.exp <= now)) throw new Error("expired_access");
  if (kind !== "online" && (!integer(p.entitlement_revision) || !integer(p.lease_seq) || p.lease_seq < 1)) throw new Error("invalid_access_sequence");
  if (kind === "lease" && (!uuid(p.entitlement_id) || p.entitlement_revision < 1 || !integer(p.refresh_after) ||
      p.refresh_after !== Math.min(p.iat + 86400, p.exp) || p.policy_version !== "launch-v1" ||
      !Array.isArray(p.rights) || p.rights.length !== 1 || p.rights[0] !== "local.run")) throw new Error("invalid_access_rights");
  if (kind === "status" && (!["active", "suspended", "revoked", "not_purchased"].includes(p.state) || !reasons.includes(p.reason_code) ||
      (p.state === "active") !== (p.reason_code === "active"))) throw new Error("invalid_access_decision");
  const stateReasons = { active: ["active"], suspended: ["access_suspended"], revoked: ["access_revoked", "device_revoked", "session_revoked", "session_expired"], not_purchased: ["purchase_required", "payment_pending"] };
  if (kind === "status" && !stateReasons[p.state].includes(p.reason_code)) throw new Error("invalid_access_decision");
  return p;
}

export async function deviceThumbprint(jwk) {
  return calculateJwkThumbprint(publicJwk(jwk), "sha256");
}
export function bindingOf(p, sessionExpires) {
  if (!integer(sessionExpires) || sessionExpires <= p.iat || sessionExpires - p.iat > 2592000) throw new Error("invalid_session_expiry");
  return { principal: p.sub, sid: p.sid, device_id: p.device_id, jkt: p.cnf.jkt, session_expires: sessionExpires };
}

export function emptySecurity(binding) {
  return { binding, lease: null, installedStatus: null, denialStatus: null, observedStatus: null, trustedStatus: null,
    highest_installed_lease_seq: 0, denial_seq: 0, highest_decision_seq: 0, highest_entitlement_revision: 0 };
}

// Does not mutate: callers commit the complete result atomically before enabling it.
export async function applyDecision(security, response, authority, now, options) {
  const status = await verifyToken(response.access_status, "status", authority, security.binding, now, options);
  const s = { ...security };
  if (status.lease_seq < s.highest_decision_seq || status.entitlement_revision < s.highest_entitlement_revision) throw new Error("stale_access_decision");
  s.highest_decision_seq = status.lease_seq;
  s.highest_entitlement_revision = status.entitlement_revision;
  s.observedStatus = response.access_status;
  const baseline = s.trustedStatus ? await verifyToken(s.trustedStatus, "status", authority, s.binding, now, { historical: true }) : null;
  if (!baseline || status.iat >= baseline.iat) s.trustedStatus = response.access_status;
  if (status.state !== "active") {
    if (status.lease_seq <= s.highest_installed_lease_seq || (status.lease_seq === s.denial_seq && response.access_status !== s.denialStatus)) throw new Error("stale_access_denial");
    s.denial_seq = status.lease_seq;
    s.denialStatus = response.access_status;
    return { security: s, status };
  }
  if (response.offline_lease !== undefined) {
    const lease = await verifyToken(response.offline_lease, "lease", authority, s.binding, now, options);
    if (lease.lease_seq !== status.lease_seq || lease.entitlement_revision !== status.entitlement_revision || lease.iat !== status.iat ||
        lease.exp > s.binding.session_expires || lease.lease_seq <= s.denial_seq || lease.lease_seq <= s.highest_installed_lease_seq) throw new Error("stale_access_lease");
    s.lease = response.offline_lease;
    s.installedStatus = response.access_status;
    s.highest_installed_lease_seq = lease.lease_seq;
  }
  return { security: s, status };
}

export async function validateSecurity(s, authority, now) {
  exact(s, ["binding", "lease", "installedStatus", "denialStatus", "observedStatus", "trustedStatus", "highest_installed_lease_seq", "denial_seq", "highest_decision_seq", "highest_entitlement_revision"]);
  exact(s.binding, ["principal", "sid", "device_id", "jkt", "session_expires"]);
  if (!uuid(s.binding.principal) || !uuid(s.binding.sid) || !uuid(s.binding.device_id) || !opaque(s.binding.jkt) || !integer(s.binding.session_expires)) throw new Error("invalid_access_state");
  let rebuilt = emptySecurity(s.binding);
  const historical = { historical: true };
  // A denial may predate a restored lease, or supersede the installed lease.
  const decisions = [];
  if (s.installedStatus && s.lease) decisions.push({ access_status: s.installedStatus, offline_lease: s.lease });
  else if (s.installedStatus || s.lease) throw new Error("invalid_access_state");
  if (s.denialStatus) decisions.push({ access_status: s.denialStatus });
  if (s.observedStatus && !decisions.some(d => d.access_status === s.observedStatus)) decisions.push({ access_status: s.observedStatus });
  if (s.trustedStatus && !decisions.some(d => d.access_status === s.trustedStatus)) decisions.push({ access_status: s.trustedStatus });
  const parsed = await Promise.all(decisions.map(async d => ({ d, p: await verifyToken(d.access_status, "status", authority, s.binding, now, historical) })));
  parsed.sort((a, b) => a.p.lease_seq - b.p.lease_seq);
  for (const { d } of parsed) rebuilt = (await applyDecision(rebuilt, d, authority, now, historical)).security;
  for (const field of ["highest_installed_lease_seq", "denial_seq", "highest_decision_seq", "highest_entitlement_revision"]) {
    if (!integer(s[field]) || s[field] !== rebuilt[field]) throw new Error("invalid_access_watermark");
  }
  if (!rebuilt.observedStatus || rebuilt.observedStatus !== s.observedStatus || rebuilt.trustedStatus !== s.trustedStatus) throw new Error("invalid_access_state");
  return rebuilt;
}

export async function usableLease(s, authority, now) {
  if (!s?.lease) throw new Error("purchase_required");
  const lease = await verifyToken(s.lease, "lease", authority, s.binding, now);
  if (lease.lease_seq !== s.highest_installed_lease_seq || lease.lease_seq <= s.denial_seq || lease.exp > s.binding.session_expires || now >= s.binding.session_expires) throw new Error("access_denied");
  return lease;
}
