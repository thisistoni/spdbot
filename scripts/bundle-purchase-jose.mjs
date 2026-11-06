import { build } from "esbuild";
await build({ stdin: { contents: 'export { compactVerify, SignJWT, importJWK, exportJWK, generateKeyPair, calculateJwkThumbprint } from "jose";', resolveDir: process.cwd(), sourcefile: "purchase-jose-entry.mjs" },
  outfile: "electron/vendor/purchase-jose.mjs", bundle: true, format: "esm", platform: "node", target: "node24", legalComments: "inline" });
