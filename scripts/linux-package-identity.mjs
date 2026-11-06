// Verification identities only. Neither identity changes runtime purchase trust.
export const distribution = Object.freeze({
  name: "spdbot", product: "SPDBot", appId: "de.spdlabs.spdbot", output: "release",
});
export const restricted = Object.freeze({
  name: "spdbot-ci-restricted", product: "SPDBot-CI-Restricted",
  appId: "de.spdlabs.spdbot.ci.restricted", output: ".omb-scratch/ci-restricted-package",
});
export const restrictedMarker = "SPDBOT-CI-RESTRICTED-NOT-FOR-DISTRIBUTION\n";

export function packageIdentity(mode) {
  if (mode === undefined) return distribution;
  if (mode === "--ci-restricted") return restricted;
  throw new Error(`Unknown package verification mode: ${mode}`);
}
