import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PURCHASE_AUTHORITY, validateAuthority } from "../electron/purchase-authority.mjs";
import { distribution, restricted } from "./linux-package-identity.mjs";

export function selectQualification(authority = PURCHASE_AUTHORITY) {
  // Only the deliberately unconfigured state selects the restricted fixture.
  // Partial, malformed or synthetic configuration is an error, never a fallback.
  if (authority.environment === "production" && authority.origin === "https://spdlabs.dev" &&
      Array.isArray(authority.onlineKeys) && authority.onlineKeys.length === 0 &&
      Array.isArray(authority.leaseKeys) && authority.leaseKeys.length === 0) return "restricted";
  validateAuthority(authority);
  return "distribution";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error("Qualification selection accepts no overrides");
  const mode = selectQualification();
  const identity = mode === "restricted" ? restricted : distribution;
  const output = `mode=${mode}\noutput=${identity.output}\nproduct=${identity.product}\nname=${identity.name}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  console.log(output.trim());
  if (mode === "restricted") console.log("Restricted-package qualification only; active distribution lifecycle is NOT qualified.");
}
