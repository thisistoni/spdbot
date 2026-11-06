// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/buffer_utils.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var strictDecoder = new TextDecoder("utf-8", { fatal: true });
var MAX_INT32 = 2 ** 32;
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0);
  const buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers) {
    buf.set(buffer, i);
    i += buffer.length;
  }
  return buf;
}
function encode(string) {
  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code > 127) {
      throw new TypeError("non-ASCII string encountered in encode()");
    }
    bytes[i] = code;
  }
  return bytes;
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/crypto_key.js
var unusable = (name, prop = "algorithm.name") => new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
function checkUsage(key, usage) {
  if (usage && !key.usages.includes(usage)) {
    throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
  }
}
function checkModulusLength(alg, key) {
  const { modulusLength } = key.algorithm;
  if (typeof modulusLength !== "number" || modulusLength < 2048) {
    throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
  }
}
function checkCryptoKey(key, expected, usage) {
  const algorithm = key.algorithm;
  if (algorithm.name !== expected.name) {
    throw unusable(expected.name);
  }
  if (expected.hash && algorithm.hash?.name !== expected.hash) {
    throw unusable(expected.hash, "algorithm.hash");
  }
  if (expected.namedCurve && algorithm.namedCurve !== expected.namedCurve) {
    throw unusable(expected.namedCurve, "algorithm.namedCurve");
  }
  if (expected.length !== void 0 && algorithm.length !== expected.length) {
    throw unusable(expected.length, "algorithm.length");
  }
  checkUsage(key, usage);
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/invalid_key_input.js
function message(msg, actual, ...types) {
  if (types.length > 2) {
    const last = types.pop();
    msg += `one of type ${types.join(", ")}, or ${last}.`;
  } else if (types.length === 2) {
    msg += `one of type ${types[0]} or ${types[1]}.`;
  } else {
    msg += `of type ${types[0]}.`;
  }
  if (actual == null) {
    msg += ` Received ${actual}`;
  } else if (typeof actual === "function" && actual.name) {
    msg += ` Received function ${actual.name}`;
  } else if (typeof actual === "object" && actual != null) {
    if (actual.constructor?.name) {
      msg += ` Received an instance of ${actual.constructor.name}`;
    }
  }
  return msg;
}
var invalidKeyInput = (actual, ...types) => message("Key must be ", actual, ...types);
var withAlg = (alg, actual, ...types) => message(`Key for the ${alg} algorithm must be `, actual, ...types);

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/util/errors.js
var JOSEError = class extends Error {
  static code = "ERR_JOSE_GENERIC";
  code = "ERR_JOSE_GENERIC";
  constructor(message2, options) {
    super(message2, options);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
};
var JOSEAlgNotAllowed = class extends JOSEError {
  static code = "ERR_JOSE_ALG_NOT_ALLOWED";
  code = "ERR_JOSE_ALG_NOT_ALLOWED";
};
var JOSENotSupported = class extends JOSEError {
  static code = "ERR_JOSE_NOT_SUPPORTED";
  code = "ERR_JOSE_NOT_SUPPORTED";
};
var JWSInvalid = class extends JOSEError {
  static code = "ERR_JWS_INVALID";
  code = "ERR_JWS_INVALID";
};
var JWTInvalid = class extends JOSEError {
  static code = "ERR_JWT_INVALID";
  code = "ERR_JWT_INVALID";
};
var JWKInvalid = class extends JOSEError {
  static code = "ERR_JWK_INVALID";
  code = "ERR_JWK_INVALID";
};
var JWSSignatureVerificationFailed = class extends JOSEError {
  static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  constructor(message2 = "signature verification failed", options) {
    super(message2, options);
  }
};

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/is_key_like.js
var isCryptoKey = (key) => {
  if (key?.[Symbol.toStringTag] === "CryptoKey")
    return true;
  try {
    return key instanceof CryptoKey;
  } catch {
    return false;
  }
};
var isKeyObject = (key) => key?.[Symbol.toStringTag] === "KeyObject";
var isKeyLike = (key) => isCryptoKey(key) || isKeyObject(key);

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/base64.js
function encodeBase64(input) {
  if (Uint8Array.prototype.toBase64) {
    return input.toBase64();
  }
  const CHUNK_SIZE = 32768;
  const arr = [];
  for (let i = 0; i < input.length; i += CHUNK_SIZE) {
    arr.push(String.fromCharCode.apply(null, input.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(arr.join(""));
}
function decodeBase64(encoded) {
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(encoded);
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/util/base64url.js
var invalid = "The input to be decoded is not correctly encoded.";
function decode(input) {
  if (Uint8Array.fromBase64) {
    try {
      return Uint8Array.fromBase64(typeof input === "string" ? input : decoder.decode(input), {
        alphabet: "base64url"
      });
    } catch (cause) {
      throw new TypeError(invalid, { cause });
    }
  }
  let encoded = input;
  if (encoded instanceof Uint8Array) {
    encoded = decoder.decode(encoded);
  }
  if (encoded.includes("+") || encoded.includes("/")) {
    throw new TypeError(invalid);
  }
  encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeBase64(encoded);
  } catch {
    throw new TypeError(invalid);
  }
}
function encode2(input) {
  let unencoded = input;
  if (typeof unencoded === "string") {
    unencoded = encoder.encode(unencoded);
  }
  if (Uint8Array.prototype.toBase64) {
    return unencoded.toBase64({ alphabet: "base64url", omitPadding: true });
  }
  return encodeBase64(unencoded).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/type_checks.js
function isObject(input) {
  if (typeof input !== "object" || input === null || Object.prototype.toString.call(input) !== "[object Object]") {
    return false;
  }
  const prototype = Object.getPrototypeOf(input);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/helpers.js
function assertNotSet(value, name) {
  if (value !== void 0) {
    throw new TypeError(`${name} can only be called once`);
  }
}
function decodeBase64url(value, label, ErrorClass) {
  try {
    return decode(value);
  } catch {
    throw new ErrorClass(`Failed to base64url decode the ${label}`);
  }
}
function encodeBase64url(value, label, ErrorClass) {
  try {
    return encode(value);
  } catch {
    throw new ErrorClass(`The ${label} is not a valid base64url string`);
  }
}
async function digest(algorithm, data) {
  const subtleDigest = `SHA-${algorithm.slice(-3)}`;
  return new Uint8Array(await crypto.subtle.digest(subtleDigest, data));
}
function parseJoseHeader(b64, ErrorClass, message2) {
  let parsed;
  try {
    parsed = JSON.parse(strictDecoder.decode(decode(b64)));
  } catch {
    throw new ErrorClass(message2);
  }
  if (!isObject(parsed)) {
    throw new ErrorClass(message2);
  }
  return parsed;
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/jwk_to_key.js
async function jwkToKey(entry, jwk) {
  if (jwk.kty === "RSA" && "oth" in jwk && jwk.oth !== void 0) {
    throw new JOSENotSupported('RSA JWK "oth" (Other Primes Info) Parameter value is not supported');
  }
  if (!entry.kty.includes(jwk.kty)) {
    throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
  }
  const algorithm = entry.resolve?.({ kty: jwk.kty, crv: jwk.crv }) ?? entry.subtle;
  const isPrivate = !!(jwk.d || jwk.priv);
  const keyData = { ...jwk };
  if (keyData.kty !== "AKP") {
    delete keyData.alg;
  }
  delete keyData.use;
  return crypto.subtle.importKey("jwk", keyData, algorithm, jwk.ext ?? !isPrivate, jwk.key_ops ?? entry.usages[isPrivate ? 1 : 0]);
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/jwk_metadata.js
function snapshotJwk(jwk) {
  return { __proto__: null, ...jwk };
}
function normalizeJwk(jwk) {
  const normalized = snapshotJwk(jwk);
  if (normalized.ext !== void 0 && typeof normalized.ext !== "boolean") {
    throw new TypeError('"ext" (Extractable) Parameter must be a boolean');
  }
  if (normalized.key_ops !== void 0) {
    const value = normalized.key_ops;
    const keyOps = Array.isArray(value) ? [...value] : void 0;
    if (!keyOps || keyOps.some((operation) => typeof operation !== "string") || new Set(keyOps).size !== keyOps.length) {
      throw new TypeError('"key_ops" (Key Operations) Parameter must be an array of unique strings');
    }
    normalized.key_ops = keyOps;
  }
  return normalized;
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/key.js
var tag = (key) => key[Symbol.toStringTag];
var jwkMatchesOp = (entry, key, usage) => {
  const { alg } = entry;
  if (key.use !== void 0) {
    const expected = usage === "sign" || usage === "verify" ? "sig" : "enc";
    if (key.use !== expected) {
      throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
    }
  }
  if (key.alg !== void 0 && key.alg !== alg) {
    throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
  }
  if (Array.isArray(key.key_ops)) {
    const expectedKeyOp = usage === "encrypt" || usage === "decrypt" ? entry.ops?.[usage === "encrypt" ? 0 : 1] : usage;
    if (expectedKeyOp && !key.key_ops.includes(expectedKeyOp)) {
      throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
    }
  }
};
function checkKeyType(entry, key, usage) {
  const { alg, secret } = entry;
  const privateKey = usage === "decrypt" || usage === "sign";
  if (secret && key instanceof Uint8Array)
    return [BYTES, key];
  if (isObject(key)) {
    const normalized = normalizeJwk(key);
    if (typeof normalized.kty !== "string") {
      throw new TypeError(secret ? withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key", "Uint8Array") : withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key"));
    }
    const valid = secret ? normalized.kty === "oct" && typeof normalized.k === "string" : normalized.kty !== "oct" && (privateKey ? normalized.kty === "AKP" && typeof normalized.priv === "string" || typeof normalized.d === "string" : normalized.d === void 0 && normalized.priv === void 0);
    if (!valid) {
      throw new TypeError(secret ? `JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present` : `JSON Web Key for this operation must be a ${privateKey ? "private" : "public"} JWK`);
    }
    jwkMatchesOp(entry, normalized, usage);
    return [JWK, key, normalized];
  }
  if (!isKeyLike(key)) {
    throw new TypeError(secret ? withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key", "Uint8Array") : withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key"));
  }
  if (secret) {
    if (key.type !== "secret") {
      throw new TypeError(`${tag(key)} instances for symmetric algorithms must be of type "secret"`);
    }
  } else {
    if (key.type === "secret") {
      throw new TypeError(`${tag(key)} instances for asymmetric algorithms must not be of type "secret"`);
    }
    const expectedType = privateKey ? "private" : "public";
    if ((key.type === "public" || key.type === "private") && key.type !== expectedType) {
      const operation = usage === "sign" ? "signing" : usage === "verify" ? "verifying" : `${usage.slice(0, -1)}tion`;
      throw new TypeError(`${tag(key)} instances for asymmetric algorithm ${operation} must be of type "${expectedType}"`);
    }
  }
  return isCryptoKey(key) ? [CRYPTO, key] : [KEYOBJECT, key];
}
var BYTES = 0;
var CRYPTO = 1;
var KEYOBJECT = 2;
var JWK = 3;
var cache;
var nist = {
  __proto__: null,
  prime256v1: "P-256",
  secp384r1: "P-384",
  secp521r1: "P-521"
};
function cached(key, alg, value) {
  cache ||= /* @__PURE__ */ new WeakMap();
  const entry = cache.get(key);
  if (value) {
    if (entry) {
      entry[alg] = value;
    } else {
      cache.set(key, { [alg]: value });
    }
  }
  return value ?? entry?.[alg];
}
var handleJWK = async (key, jwk, entry) => cached(key, entry.alg) ?? cached(key, entry.alg, await jwkToKey(entry, { ...jwk, alg: entry.alg }));
var handleKeyObject = (keyObject, entry) => {
  const hit = cached(keyObject, entry.alg);
  if (hit)
    return hit;
  const isPublic = keyObject.type === "public";
  const usages = entry.usages[isPublic ? 0 : 1];
  const { asymmetricKeyType } = keyObject;
  const crv = nist[keyObject.asymmetricKeyDetails?.namedCurve];
  const params = entry.resolve?.({ crv, asymmetricKeyType }) ?? entry.subtle;
  return cached(keyObject, entry.alg, keyObject.toCryptoKey(params, isPublic, usages));
};
async function prepareKey(entry, key, usage) {
  const tagged = checkKeyType(entry, key, usage);
  switch (tagged[0]) {
    case BYTES:
    case CRYPTO:
      return tagged[1];
    case JWK: {
      const key2 = tagged[1];
      const normalized = tagged[2];
      if (normalized.kty === "oct") {
        return decode(normalized.k);
      }
      if (!Object.isFrozen(key2)) {
        const { key_ops } = key2;
        if (Array.isArray(key_ops))
          Object.freeze(key_ops);
        Object.freeze(key2);
      }
      return handleJWK(key2, normalized, entry);
    }
    case KEYOBJECT: {
      const keyObject = tagged[1];
      if (keyObject.type === "secret") {
        return keyObject.export();
      }
      if ("toCryptoKey" in keyObject && typeof keyObject.toCryptoKey === "function") {
        return handleKeyObject(keyObject, entry);
      }
      return handleJWK(keyObject, keyObject.export({ format: "jwk" }), entry);
    }
  }
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/key_descriptor.js
function table(entries) {
  const out = { __proto__: null };
  for (const alg in entries) {
    out[alg] = { ...entries[alg], alg };
  }
  return out;
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/jwe_algorithms.js
var wrap = [
  ["encrypt", "wrapKey"],
  ["decrypt", "unwrapKey"]
];
var derive = [[], ["deriveBits"]];
var none = [[], []];
function rsaes(bits) {
  return {
    kty: ["RSA"],
    subtle: { name: "RSA-OAEP", hash: `SHA-${bits}` },
    usages: wrap,
    ops: ["wrapKey", "unwrapKey"]
  };
}
function ecdh() {
  return {
    kty: ["EC", "OKP"],
    subtle: { name: "ECDH" },
    resolve: ({ kty, crv, asymmetricKeyType }) => {
      if (crv === "X25519" || asymmetricKeyType === "x25519") {
        return { name: "X25519" };
      }
      if (kty === "OKP") {
        throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      return { name: "ECDH", namedCurve: crv };
    },
    usages: derive,
    ops: [void 0, "deriveBits"]
  };
}
function aeskw(bits, gcm = false) {
  return {
    kty: ["oct"],
    secret: true,
    subtle: { name: gcm ? "AES-GCM" : "AES-KW", length: bits },
    usages: none,
    ops: gcm ? ["encrypt", "decrypt"] : ["wrapKey", "unwrapKey"]
  };
}
function pbes2() {
  return {
    kty: ["oct"],
    secret: true,
    subtle: { name: "PBKDF2" },
    usages: none,
    ops: ["deriveBits", "deriveBits"]
  };
}
var JWE = table({
  dir: {
    kty: ["oct"],
    secret: true,
    subtle: { name: "AES-GCM" },
    usages: none,
    ops: ["encrypt", "decrypt"]
  },
  "RSA-OAEP": rsaes(1),
  "RSA-OAEP-256": rsaes(256),
  "RSA-OAEP-384": rsaes(384),
  "RSA-OAEP-512": rsaes(512),
  "ECDH-ES": ecdh(),
  "ECDH-ES+A128KW": ecdh(),
  "ECDH-ES+A192KW": ecdh(),
  "ECDH-ES+A256KW": ecdh(),
  A128KW: aeskw(128),
  A192KW: aeskw(192),
  A256KW: aeskw(256),
  A128GCMKW: aeskw(128, true),
  A192GCMKW: aeskw(192, true),
  A256GCMKW: aeskw(256, true),
  "PBES2-HS256+A128KW": pbes2(),
  "PBES2-HS384+A192KW": pbes2(),
  "PBES2-HS512+A256KW": pbes2()
});
var contentOps = ["encrypt", "decrypt"];
function contentEncryption(bits, cbc = false) {
  return {
    kty: ["oct"],
    secret: true,
    subtle: { name: cbc ? "AES-CBC" : "AES-GCM", length: bits },
    usages: none,
    ops: contentOps,
    cekBits: bits,
    ivBits: cbc ? 128 : 96,
    cbc
  };
}
var ENC = table({
  A128GCM: contentEncryption(128),
  A192GCM: contentEncryption(192),
  A256GCM: contentEncryption(256),
  "A128CBC-HS256": contentEncryption(256, true),
  "A192CBC-HS384": contentEncryption(384, true),
  "A256CBC-HS512": contentEncryption(512, true)
});

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/options.js
var JWS_RECOGNIZED = { __proto__: null, b64: true };
function validateAlgorithms(option, algorithms) {
  if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s !== "string"))) {
    throw new TypeError(`"${option}" option must be an array of strings`);
  }
  if (!algorithms) {
    return void 0;
  }
  return new Set(algorithms);
}
function validateCritDuplicates(Err, protectedHeader) {
  const { crit } = protectedHeader ?? {};
  if (Array.isArray(crit) && new Set(crit).size !== crit.length) {
    throw new Err('"crit" (Critical) Header Parameter MUST NOT contain duplicate values');
  }
}
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0) {
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  }
  if (!protectedHeader || protectedHeader.crit === void 0) {
    return [];
  }
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input !== "string" || input.length === 0)) {
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  }
  const recognized = recognizedOption === void 0 ? recognizedDefault : { __proto__: null, ...recognizedOption, ...recognizedDefault };
  for (const parameter of protectedHeader.crit) {
    if (!(parameter in recognized)) {
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    }
    if (!Object.hasOwn(joseHeader, parameter) || joseHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    }
    if (recognized[parameter] && (!Object.hasOwn(protectedHeader, parameter) || protectedHeader[parameter] === void 0)) {
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
    }
  }
  return protectedHeader.crit;
}
function validateB64(protectedHeader, extensions) {
  if (extensions.includes("b64")) {
    const b64 = protectedHeader.b64;
    if (typeof b64 !== "boolean") {
      throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    }
    return b64;
  }
  return true;
}
function serializeJoseHeader(Err, header) {
  let serialized;
  let parsed;
  try {
    serialized = JSON.stringify(header);
    parsed = JSON.parse(serialized);
  } catch (cause) {
    throw new Err("JOSE Header is not valid JSON", { cause });
  }
  if (!isObject(parsed)) {
    throw new Err("JOSE Header is not a JSON object");
  }
  return [parsed, serialized];
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/signing.js
async function getSigKey(entry, key, usage) {
  if (key instanceof Uint8Array) {
    return crypto.subtle.importKey("raw", key, entry.subtle, false, [
      usage
    ]);
  }
  checkCryptoKey(key, entry.subtle, usage);
  if (entry.minRsaBits)
    checkModulusLength(entry.alg, key);
  return key;
}
async function sign(entry, key, data) {
  const cryptoKey = await getSigKey(entry, key, "sign");
  const signature = await crypto.subtle.sign(entry.signing, cryptoKey, data);
  return new Uint8Array(signature);
}
async function verify(entry, key, signature, data) {
  const cryptoKey = await getSigKey(entry, key, "verify");
  try {
    return await crypto.subtle.verify(entry.signing, cryptoKey, signature, data);
  } catch {
    return false;
  }
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/jws_algorithms.js
var sig = [["verify"], ["sign"]];
function hmac(bits) {
  const subtle = { name: "HMAC", hash: `SHA-${bits}` };
  return { kty: ["oct"], secret: true, subtle, signing: subtle, usages: sig };
}
function rsa(bits, saltLength) {
  const name = saltLength ? "RSA-PSS" : "RSASSA-PKCS1-v1_5";
  const subtle = { name, hash: `SHA-${bits}` };
  return {
    kty: ["RSA"],
    subtle,
    signing: saltLength ? { ...subtle, saltLength } : subtle,
    usages: sig,
    minRsaBits: 2048
  };
}
function ecdsa(crv, bits) {
  return {
    kty: ["EC"],
    crv,
    subtle: { name: "ECDSA", namedCurve: crv },
    signing: { name: "ECDSA", hash: `SHA-${bits}` },
    usages: sig
  };
}
function eddsa() {
  const subtle = { name: "Ed25519" };
  return {
    kty: ["OKP"],
    crv: "Ed25519",
    subtle,
    signing: subtle,
    usages: sig
  };
}
function mldsa(bits) {
  const name = `ML-DSA-${bits}`;
  const subtle = { name };
  return {
    kty: ["AKP"],
    subtle,
    signing: subtle,
    usages: sig
  };
}
var JWS = table({
  HS256: hmac(256),
  HS384: hmac(384),
  HS512: hmac(512),
  RS256: rsa(256),
  RS384: rsa(384),
  RS512: rsa(512),
  PS256: rsa(256, 32),
  PS384: rsa(384, 48),
  PS512: rsa(512, 64),
  ES256: ecdsa("P-256", 256),
  ES384: ecdsa("P-384", 384),
  ES512: ecdsa("P-521", 512),
  EdDSA: eddsa(),
  Ed25519: eddsa(),
  "ML-DSA-44": mldsa(44),
  "ML-DSA-65": mldsa(65),
  "ML-DSA-87": mldsa(87)
});
function jwsAlgorithm(alg) {
  const entry = typeof alg === "string" ? JWS[alg] : void 0;
  if (!entry) {
    throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
  return entry;
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/jws_verify.js
function prepareVerify(options) {
  return [options && validateAlgorithms("algorithms", options.algorithms), options?.crit];
}
function parseProtectedHeader(encodedProtected, parsedProtected = encodedProtected === void 0 ? {} : parseJoseHeader(encodedProtected, JWSInvalid, "JWS Protected Header is invalid")) {
  return parsedProtected;
}
function validateJwsHeaders(parsedProt, joseHeader, shared) {
  const b64 = validateB64(parsedProt, validateCrit(JWSInvalid, JWS_RECOGNIZED, shared[1], parsedProt, joseHeader));
  const alg = joseHeader.alg;
  if (typeof alg !== "string" || !alg) {
    throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  }
  if (shared[0] && !shared[0].has(alg)) {
    throw new JOSEAlgNotAllowed('"alg" (Algorithm) Header Parameter value not allowed');
  }
  return [b64, alg];
}
function encodeCompactUnencodedPayload(payload) {
  try {
    return encode(payload);
  } catch {
    throw new JWSInvalid("JWS Compact Serialization payload must use only ASCII characters");
  }
}
async function verifyPrepared(jws, shared, key, encodedProtected, parsedProt, alg, signingPayload) {
  let resolvedKey = false;
  if (typeof key === "function") {
    key = await key(parsedProt, jws);
    resolvedKey = true;
  }
  const b64 = typeof signingPayload === "string";
  const entry = jwsAlgorithm(alg);
  const data = concat(encodedProtected !== void 0 ? encode(encodedProtected) : new Uint8Array(), encode("."), b64 ? shared[2] ??= encodeBase64url(signingPayload, "payload", JWSInvalid) : signingPayload);
  const signature = decodeBase64url(jws.signature, "signature", JWSInvalid);
  const k = await prepareKey(entry, key, "verify");
  if (!await verify(entry, k, signature, data)) {
    throw new JWSSignatureVerificationFailed();
  }
  const payload = b64 ? decodeBase64url(signingPayload, "payload", JWSInvalid) : signingPayload;
  return [payload, parsedProt, b64, k, resolvedKey];
}
async function verifyCompact(jws, shared, key) {
  if (jws instanceof Uint8Array) {
    jws = decoder.decode(jws);
  }
  if (typeof jws !== "string") {
    throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
  }
  const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
  if (length !== 3) {
    throw new JWSInvalid("Invalid Compact JWS");
  }
  const compactJws = { payload, protected: protectedHeader, signature };
  const parsedProt = parseProtectedHeader(protectedHeader);
  const [b64, alg] = validateJwsHeaders(parsedProt, parsedProt, shared);
  const signingPayload = b64 ? payload : encodeCompactUnencodedPayload(payload);
  return verifyPrepared(compactJws, shared, key, protectedHeader, parsedProt, alg, signingPayload);
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/jws/compact/verify.js
async function compactVerify(jws, key, options) {
  const verified = await verifyCompact(jws, prepareVerify(options), key);
  const result = { payload: verified[0], protectedHeader: verified[1] };
  if (typeof key === "function") {
    return { ...result, key: verified[3] };
  }
  return result;
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/jwt_claims_set.js
var epoch = (date) => Math.floor(date.getTime() / 1e3);
var multipliers = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  y: 31557600
};
var REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
function invalidDuration() {
  throw new TypeError("Invalid time period format");
}
function secs(str) {
  if (typeof str !== "string") {
    invalidDuration();
  }
  const matched = REGEX.exec(str);
  if (!matched || matched[4] && matched[1]) {
    invalidDuration();
  }
  const value = parseFloat(matched[2]);
  const numericDate2 = Math.round(value * multipliers[matched[3][0].toLowerCase()]);
  if (!Number.isFinite(numericDate2)) {
    invalidDuration();
  }
  if (matched[1] === "-" || matched[4] === "ago") {
    return -numericDate2;
  }
  return numericDate2;
}
function validateInput(label, input) {
  if (!Number.isFinite(input)) {
    throw new TypeError(`Invalid ${label} input`);
  }
  return input;
}
function validateStringClaim(claim, value) {
  if (typeof value !== "string") {
    throw new TypeError(`"${claim}" claim must be a string`);
  }
}
function validateAudienceClaim(value) {
  if (typeof value !== "string" && (!Array.isArray(value) || Array.from(value).some((member) => typeof member !== "string"))) {
    throw new TypeError('"aud" claim must be a string or an array of strings');
  }
}
function numericDate(value, label) {
  if (typeof value === "number")
    return validateInput(label, value);
  if (value instanceof Date)
    return validateInput(label, epoch(value));
  return epoch(/* @__PURE__ */ new Date()) + secs(value);
}
var producerPayloads;
function producerPayload(producer) {
  return producerPayloads.get(producer);
}
function jwtData(producer) {
  const payload = producerPayload(producer);
  for (const claim of ["iat", "nbf", "exp"]) {
    const value = payload[claim];
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError(`"${claim}" claim must be a finite number`);
    }
  }
  return encoder.encode(JSON.stringify(payload));
}
var JWTClaimsBuilder = class {
  constructor(payload = {}) {
    if (!isObject(payload)) {
      throw new TypeError("JWT Claims Set MUST be an object");
    }
    ;
    (producerPayloads ||= /* @__PURE__ */ new WeakMap()).set(this, structuredClone(payload));
  }
  setIssuer(value) {
    validateStringClaim("iss", value);
    producerPayload(this).iss = value;
    return this;
  }
  setSubject(value) {
    validateStringClaim("sub", value);
    producerPayload(this).sub = value;
    return this;
  }
  setAudience(value) {
    validateAudienceClaim(value);
    producerPayload(this).aud = value;
    return this;
  }
  setJti(value) {
    validateStringClaim("jti", value);
    producerPayload(this).jti = value;
    return this;
  }
  setNotBefore(value) {
    producerPayload(this).nbf = numericDate(value, "setNotBefore");
    return this;
  }
  setExpirationTime(value) {
    producerPayload(this).exp = numericDate(value, "setExpirationTime");
    return this;
  }
  setIssuedAt(value) {
    const payload = producerPayload(this);
    if (value === void 0) {
      payload.iat = epoch(/* @__PURE__ */ new Date());
    } else if (typeof value === "string") {
      payload.iat = validateInput("setIssuedAt", epoch(/* @__PURE__ */ new Date()) + secs(value));
    } else {
      payload.iat = numericDate(value, "setIssuedAt");
    }
    return this;
  }
};

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/jws_sign.js
function serializeProtectedHeader(protectedHeader) {
  if (protectedHeader === void 0)
    return [void 0, ""];
  const normalized = serializeJoseHeader(JWSInvalid, protectedHeader);
  return [normalized[0], encode2(normalized[1])];
}
function validateSignatureHeader(protectedHeader, joseHeader, crit) {
  validateCritDuplicates(JWSInvalid, protectedHeader);
  return validateB64(protectedHeader, validateCrit(JWSInvalid, JWS_RECOGNIZED, crit, protectedHeader, joseHeader));
}
function signatureAlgorithm(joseHeader) {
  const alg = joseHeader.alg;
  if (typeof alg !== "string" || !alg) {
    throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  }
  return jwsAlgorithm(alg);
}
async function signSignature(protectedHeader, payload, entry, key) {
  const data = concat(encode(protectedHeader), encode("."), payload);
  const k = await prepareKey(entry, key, "sign");
  return encode2(await sign(entry, k, data));
}
async function createCompactSignature(payload, inputProtectedHeader, inputCrit, key, rejectUnencoded) {
  const [protectedHeader, protectedHeaderString] = serializeProtectedHeader(inputProtectedHeader);
  if (!protectedHeader) {
    throw new JWSInvalid("either setProtectedHeader or setUnprotectedHeader must be called before #sign()");
  }
  const b64 = validateSignatureHeader(protectedHeader, protectedHeader, inputCrit);
  if (!b64)
    rejectUnencoded();
  const entry = signatureAlgorithm(protectedHeader);
  const encodedPayload = encode2(payload);
  const signature = await signSignature(protectedHeaderString, encode(encodedPayload), entry, key);
  return `${protectedHeaderString}.${encodedPayload}.${signature}`;
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/jwt/sign.js
var SignJWT_base = JWTClaimsBuilder;
var SignJWT = class extends SignJWT_base {
  #protectedHeader;
  setProtectedHeader(protectedHeader) {
    assertNotSet(this.#protectedHeader, "setProtectedHeader");
    this.#protectedHeader = protectedHeader;
    return this;
  }
  async sign(key, options) {
    return createCompactSignature(jwtData(this), this.#protectedHeader, options?.crit, key, () => {
      throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
    });
  }
};

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/key_algorithm.js
var algArgument = '"alg" (Algorithm)';
function unsupportedAlg(source = 'JWK "alg" (Algorithm) Parameter') {
  throw new JOSENotSupported(`Invalid or unsupported ${source} value`);
}
function keyAlgorithm(alg, source) {
  return (typeof alg === "string" ? JWS[alg] ?? JWE[alg] : void 0) ?? unsupportedAlg(source);
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/lib/key_options.js
function validateExtractableOption(extractable) {
  if (extractable !== void 0 && typeof extractable !== "boolean") {
    throw new TypeError('"extractable" option must be a boolean');
  }
  return extractable;
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/key/export.js
function omitUndefinedProperties(jwk) {
  return Object.fromEntries(Object.entries(jwk).filter(([, value]) => value !== void 0));
}
async function keyToJWK(key) {
  if (isKeyObject(key)) {
    if (key.type === "secret") {
      key = key.export();
    } else {
      return key.export({ format: "jwk" });
    }
  }
  if (key instanceof Uint8Array) {
    return {
      kty: "oct",
      k: encode2(key)
    };
  }
  if (!isCryptoKey(key)) {
    throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject", "Uint8Array"));
  }
  if (!key.extractable) {
    throw new TypeError("non-extractable CryptoKey cannot be exported as a JWK");
  }
  const { ext, key_ops, alg, use, ...jwk } = omitUndefinedProperties(await crypto.subtle.exportKey("jwk", key));
  if (jwk.kty === "AKP") {
    ;
    jwk.alg = alg;
  }
  return jwk;
}
function exportJWK(key) {
  return keyToJWK(key);
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/jwk/thumbprint.js
var check = (value, description) => {
  if (typeof value !== "string" || !value) {
    throw new JWKInvalid(`${description} missing or invalid`);
  }
};
async function calculateJwkThumbprint(key, digestAlgorithm) {
  let jwk;
  if (isObject(key)) {
    jwk = snapshotJwk(key);
    if (typeof jwk.kty !== "string") {
      throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject", "JSON Web Key"));
    }
  } else if (isKeyLike(key)) {
    jwk = snapshotJwk(await exportJWK(key));
  } else {
    throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject", "JSON Web Key"));
  }
  digestAlgorithm ??= "sha256";
  if (digestAlgorithm !== "sha256" && digestAlgorithm !== "sha384" && digestAlgorithm !== "sha512") {
    throw new TypeError('digestAlgorithm must one of "sha256", "sha384", or "sha512"');
  }
  let components;
  switch (jwk.kty) {
    case "AKP":
      check(jwk.alg, '"alg" (Algorithm) Parameter');
      check(jwk.pub, '"pub" (Public key) Parameter');
      components = { alg: jwk.alg, kty: jwk.kty, pub: jwk.pub };
      break;
    case "EC":
      check(jwk.crv, '"crv" (Curve) Parameter');
      check(jwk.x, '"x" (X Coordinate) Parameter');
      check(jwk.y, '"y" (Y Coordinate) Parameter');
      components = { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y };
      break;
    case "OKP":
      check(jwk.crv, '"crv" (Subtype of Key Pair) Parameter');
      check(jwk.x, '"x" (Public Key) Parameter');
      components = { crv: jwk.crv, kty: jwk.kty, x: jwk.x };
      break;
    case "RSA":
      check(jwk.e, '"e" (Exponent) Parameter');
      check(jwk.n, '"n" (Modulus) Parameter');
      components = { e: jwk.e, kty: jwk.kty, n: jwk.n };
      break;
    case "oct":
      if (typeof jwk.k !== "string") {
        throw new JWKInvalid('"k" (Key Value) Parameter missing or invalid');
      }
      components = { k: jwk.k, kty: jwk.kty };
      break;
    default:
      throw new JOSENotSupported('"kty" (Key Type) Parameter missing or unsupported');
  }
  const data = encode(JSON.stringify(components));
  return encode2(await digest(digestAlgorithm, data));
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/key/import.js
async function importJWK(jwk, alg, options) {
  if (!isObject(jwk)) {
    throw new TypeError("JWK must be an object");
  }
  const normalized = normalizeJwk(jwk);
  const extractable = validateExtractableOption(options?.extractable);
  const { alg: jwkAlg } = normalized;
  alg ??= jwkAlg;
  const ext = extractable ?? normalized.ext;
  if (normalized.kty !== "oct" && !alg) {
    throw new TypeError('"alg" argument is required when "jwk.alg" is not present');
  }
  switch (normalized.kty) {
    case "oct":
      if (typeof normalized.k !== "string") {
        throw new TypeError('missing "k" (Key Value) Parameter value');
      }
      return decode(normalized.k);
    case "AKP": {
      if (typeof jwkAlg !== "string" || !jwkAlg) {
        throw new TypeError('missing "alg" (Algorithm) Parameter value');
      }
      if (alg !== jwkAlg) {
        throw new TypeError("JWK alg and alg option value mismatch");
      }
      return jwkToKey(keyAlgorithm(alg), { ...normalized, ext });
    }
    case "RSA":
    case "EC":
    case "OKP":
      return jwkToKey(keyAlgorithm(alg), { ...normalized, alg, ext });
    default:
      throw new JOSENotSupported('Unsupported "kty" (Key Type) Parameter value');
  }
}

// node_modules/.pnpm/jose@6.2.10/node_modules/jose/dist/webapi/key/generate_key_pair.js
function getModulusLengthOption(options) {
  const modulusLength = options?.modulusLength ?? 2048;
  if (typeof modulusLength !== "number" || !Number.isInteger(modulusLength) || modulusLength < 2048) {
    throw new JOSENotSupported("Invalid or unsupported modulusLength option provided, 2048 bits or larger keys must be used");
  }
  return modulusLength;
}
async function generateKeyPair(alg, options) {
  const extractable = validateExtractableOption(options?.extractable);
  const entry = keyAlgorithm(alg, algArgument);
  if (entry.secret) {
    unsupportedAlg(algArgument);
  }
  let algorithm;
  if (entry.resolve) {
    const crv = options?.crv ?? "P-256";
    switch (crv) {
      case "P-256":
      case "P-384":
      case "P-521":
        algorithm = { name: "ECDH", namedCurve: crv };
        break;
      case "X25519":
        algorithm = { name: "X25519" };
        break;
      default:
        throw new JOSENotSupported("Invalid or unsupported crv option provided, supported values are P-256, P-384, P-521, and X25519");
    }
  } else {
    if (entry.crv !== void 0 && options?.crv !== void 0 && options.crv !== entry.crv) {
      throw new JOSENotSupported(`Invalid or unsupported crv option provided, the only supported value for ${alg} is ${entry.crv}`);
    }
    algorithm = entry.kty[0] === "RSA" ? {
      ...entry.subtle,
      publicExponent: Uint8Array.of(1, 0, 1),
      modulusLength: getModulusLengthOption(options)
    } : entry.subtle;
  }
  return crypto.subtle.generateKey(algorithm, extractable ?? false, [
    ...entry.usages[1],
    ...entry.usages[0]
  ]);
}
export {
  SignJWT,
  calculateJwkThumbprint,
  compactVerify,
  exportJWK,
  generateKeyPair,
  importJWK
};
