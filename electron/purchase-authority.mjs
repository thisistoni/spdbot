// Build-owned trust. No environment variable, renderer input or unsigned key discovery.
// Populate current + next public keys through a reviewed app update before activation.
export const PURCHASE_AUTHORITY = Object.freeze({
  environment: "production",
  origin: "https://spdlabs.dev",
  onlineKeys: [],
  leaseKeys: [],
});

const origins = { production: "https://spdlabs.dev", preview: "https://spdlabs-preview.solutiv.org" };
const reserved = ["11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo", "PUAXw-hDiVqStwqnTRt-vJyYLM8uxJaMwM1V8Sr0Zgw"];
export function validateAuthority(authority = PURCHASE_AUTHORITY) {
  if (origins[authority.environment] !== authority.origin) throw new Error("access_unavailable");
  const keys = [...authority.onlineKeys, ...authority.leaseKeys];
  if (!authority.onlineKeys.length || !authority.leaseKeys.length || authority.onlineKeys.length > 2 || authority.leaseKeys.length > 2 ||
      new Set(keys.map(k => k.kid)).size !== keys.length || new Set(keys.map(k => k.x)).size !== keys.length) throw new Error("access_unavailable");
  for (const key of keys) {
    if (key.kty !== "OKP" || key.crv !== "Ed25519" || !/^[A-Za-z0-9_-]{43}$/.test(key.x) ||
        !/^[A-Za-z0-9_-]{1,80}$/.test(key.kid) || Object.keys(key).some(k => !["kty", "crv", "x", "kid"].includes(k)) ||
        reserved.includes(key.x) || /test|fixture|synthetic/i.test(key.kid)) throw new Error("access_unavailable");
  }
  return authority;
}
