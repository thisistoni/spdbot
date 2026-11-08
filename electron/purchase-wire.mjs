import { createHash, timingSafeEqual } from "node:crypto";

export const hash = text => createHash("sha256").update(text).digest("base64url");
export const integer = n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
export const uuid = s => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export const opaque = s => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s) && Buffer.from(s, "base64url").toString("base64url") === s;
export function equal(a, b) {
  return typeof a === "string" && typeof b === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function exact(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k))) throw new Error("invalid_access_response");
  return value;
}
export function publicJwk(value) {
  exact(value, ["kty", "crv", "x"]);
  if (value.kty !== "OKP" || value.crv !== "Ed25519" || !opaque(value.x)) throw new Error("invalid_device_key");
  return value;
}

// JSON.parse alone accepts duplicate keys. Scan the grammar first, including escaped names.
export function strictJSON(text, limit = 65536) {
  if (typeof text !== "string" || Buffer.byteLength(text) > limit) throw new Error("invalid_access_response");
  let at = 0;
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[at] ?? "!") && at < text.length) at++; };
  const string = () => {
    const start = at++;
    while (at < text.length) {
      if (text[at] === "\\") { at += 2; continue; }
      if (text[at++] === '"') return JSON.parse(text.slice(start, at));
    }
    throw new Error("invalid_access_response");
  };
  const value = (depth = 0) => {
    if (depth > 20) throw new Error("invalid_access_response");
    whitespace();
    if (text[at] === '"') { string(); return; }
    if (text[at] === "{" || text[at] === "[") {
      const object = text[at++] === "{";
      const end = object ? "}" : "]";
      const keys = new Set();
      whitespace();
      if (text[at] === end) { at++; return; }
      while (at < text.length) {
        if (object) {
          whitespace();
          if (text[at] !== '"') throw new Error("invalid_access_response");
          const key = string();
          if (keys.has(key) || key === "__proto__") throw new Error("invalid_access_response");
          keys.add(key);
          whitespace();
          if (text[at++] !== ":") throw new Error("invalid_access_response");
        }
        value(depth + 1);
        whitespace();
        if (text[at] === end) { at++; return; }
        if (text[at++] !== ",") throw new Error("invalid_access_response");
      }
      throw new Error("invalid_access_response");
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
    if (!match) throw new Error("invalid_access_response");
    at += match[0].length;
  };
  value(); whitespace();
  if (at !== text.length) throw new Error("invalid_access_response");
  return JSON.parse(text);
}

export function callback(raw, protocol = "spdbot:") {
  // eslint-disable-next-line no-control-regex -- Protocol callbacks may contain no control characters.
  if (typeof raw !== "string" || Buffer.byteLength(raw) > 2048 || /[\x00-\x20\x7f]/.test(raw) || /%(?![a-f\d]{2})/i.test(raw)) throw new Error("invalid_callback");
  const url = new URL(raw);
  if (!["spdbot:", "spdbot-preview:"].includes(protocol) || url.protocol !== protocol || url.hostname !== "auth" || url.pathname !== "/callback" || url.username || url.password || url.port || url.hash ||
      url.searchParams.size !== 3 || ["request_id", "code", "state"].some(k => url.searchParams.getAll(k).length !== 1)) throw new Error("invalid_callback");
  const result = Object.fromEntries(url.searchParams);
  if (!uuid(result.request_id) || !opaque(result.state) || !opaque(result.code)) throw new Error("invalid_callback");
  // The authority emits only ASCII, unescaped opaque parameters.
  if (url.search.includes("%") || url.search.includes("+")) throw new Error("invalid_callback");
  return result;
}
export function authorizationURL(raw, authority, requestId, state) {
  const url = new URL(raw);
  if (url.origin !== authority.origin || url.protocol !== "https:" || url.username || url.password || url.hash || url.pathname !== "/desktop/authorize" ||
      url.searchParams.size !== 2 || url.searchParams.getAll("request_id").length !== 1 || url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.get("request_id") !== requestId || !equal(url.searchParams.get("state"), state)) throw new Error("invalid_authorization_url");
  return url.href;
}
export const possessionBytes = (nonce, lease) => Buffer.from(`SPDBOT-LOCAL-POSSESSION-V1\n${nonce}\n${hash(lease)}`);
