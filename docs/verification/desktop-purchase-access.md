# Desktop purchase access

Implemented on 2026-11-06 for SPDBot Windows/macOS, tracked by [SPD-26](https://linear.app/devtones/issue/SPD-26). The original delegate handoff was unstaged on `spd-launch-buyer-access` at `251739ced770a71b61e6cb0b078d854e8a28cb0f`; Root owns subsequent fixes and Git integration. Evidence uses fresh TEMP profiles. No website, enterprise source/licensing, provider credentials, customer profiles, provisioning, deployment or release were changed.

## Authority and execution

The sibling website contract and actual commerce services were read: `docs/commerce/{access-api-v1,handoff,activation,review-2026-11-06}.md`, `docs/spdbot-commerce-access-plan.md`, `docs/commerce/fixtures/access-v1.json`, and `lib/commerce/{desktop-auth,device-proof,tokens,keyring,http,config}.ts`. No protocol changes were needed. The website remains independently disabled until Root configures its authority and providers. The confirmed offer stays EUR 99 once, Windows/macOS, buyer-funded AI accounts. Device count remains server-owned/unset; no support/update term was invented.

`electron/purchase-authority.mjs` is build-owned trust. The checked-in production origin is exactly `https://spdlabs.dev`; its public key lists are deliberately empty. Runtime is restricted without trusted keys. `scripts/before-pack-purchase.mjs` additionally refuses distribution with absent, duplicate, synthetic, malformed or cross-environment trust. No environment variable, IPC payload, unsigned manifest, JWKS discovery or token URL can activate access.

Main generates an Ed25519 installation key and PKCE S256 verifier/state. It validates the authority's exact HTTPS browser URL and opens it through the OS browser only after a connection action. The native callback parser accepts only `spdbot://auth/callback` and its three unique, bounded, strictly encoded parameters. Request ID, constant-time state comparison, expiry and synchronous consumption precede redemption. Cold callbacks are dispatched into the same controller but cannot redeem after a restart because pending PKCE state is deliberately memory-only. Windows `second-instance` and macOS `open-url` are intercepted before other deep links, reusing the existing instance lock and scheme.

The renderer gets four sender-validated actions and redacted state. Its exact local origin, owning WebContents and main frame must match. Code/verifier, refresh/access tokens and private device keys never cross this bridge. DPoP uses JOSE EdDSA, a fresh random JTI per request, fixed method/URL and `ath` on access-token requests; cookies, redirects and renderer-provided authorities are excluded.

Both processes independently run the strict verifier. Headers, signatures, pinned purpose-specific keys, JWT types, issuer/audience/environment/product/version, UUID identities, session/device/thumbprint bindings, exact rights/policy, safe integer types and time ordering are checked. Duplicate/unknown fields and string/null/fractional/unsafe numeric claims are rejected. Only `local.run` is granted; enterprise capabilities and existing owner/session/origin controls remain separate.

The offline lifetime is at most **259200 seconds**, refresh time is exactly `min(iat + 86400, exp)`, and expiry is also capped by the absolute session term. There is no expiry tolerance, restart renewal or network-failure extension. Separate installed-lease, denial, decision and entitlement-revision watermarks are rebuilt from signed records at startup. Active status-only observations retain the installed lease; denial blocks older/equal leases; restoration requires a newer active status plus matching lease installed atomically. Expired stored decisions remain usable as historical denial evidence, never as new online decisions.

`PurchaseClock` combines nondecreasing effective time with monotonic elapsed time, persists greatest observed time and a baseline backed by the retained signed status with greatest issuance time, and checks resume/restart/backward jumps beyond 60 seconds. A forward jump is preserved conservatively; correcting the system clock plus a fresh browser connection after sign-out provides recovery without renewing an old lease. HTTP dates cannot reset security time.

## Persistence and local backend

The only access file is `<Electron userData>/purchase-access.bin`. It is encrypted using Electron safeStorage, written through a serialized queue, flushed into an exclusive temporary file and atomically renamed. A flushed `.pending` journal makes interrupted writes fail closed on restart rather than restoring an old rotating credential or pre-denial record. Async Electron decryption's `{ result, shouldReEncrypt }` shape is supported. Missing/corrupt state or unavailable OS encryption cannot create a first lease. Linux plaintext storage is rejected.

Refresh removes the old credential durably **before** sending it. An ambiguous response cannot replay that generation, even after process death. A previously installed valid lease remains usable until its fixed deadline unless a signed denial arrives. Successful replacement credentials and the signed pair become usable only after encrypted commit. Sign-out immediately restricts Main/backend, cancels pending authorization and removes only access state/key/credentials, including the journal, without requiring encryption or network availability. Workspace/history/settings and provider accounts remain intact.

The backend generates a random one-use nonce. Main signs the exact contract bytes `SPDBOT-LOCAL-POSSESSION-V1\n<nonce>\n<SHA256(exact compact lease)>`. The child independently checks the public key/thumbprint, signature, nonce, complete signed state and time before execution. Subsequent updates travel only over Electron's private utility-process parent port and are verified again, with independent runtime watermarks. Standalone backends have no authenticated parent and start restricted. A copied lease without key possession does not unlock one.

Admission occurs behind existing authentication for HTTP and upgrade requests, at direct turn dispatch, registry provider adapters/background model calls, routine admission/scheduling and background services. A body arriving after expiry is checked again. Execution SSE writes and raw WebSocket ingress recheck effective time; streams close on restriction. Existing provider work receives stopAll, live calls/viewers close, routines cancel while their definitions/history survive, and CUA descriptors/host execution are withheld/stopped in Main. Safe explicit history/config/export reads and quit remain available. Already completed external effects cannot be undone; real provider cancellation behavior has not been certified by the fake engine.

The German connection bar uses existing palette/locale/caption helpers and concise actions. Onboarding waits for purchase connection so it cannot obscure the first connection action. No website design changed.

## Configuration and activation

1. Root configures the sibling Clerk/Stripe/PostgreSQL/signing authority using its activation guide. The desktop never substitutes Clerk identity alone for purchase authority.
2. In `electron/purchase-authority.mjs`, install independently provisioned **public-only** current/next Ed25519 JWKs for online and lease purposes: `{ kty: "OKP", crv: "Ed25519", x, kid }`. At most two per purpose; IDs and material must be unique. Never paste a private `d` value, use the corpus keys, or add runtime overrides. This worker generated no shipping authority keys.
3. A preview build requires a reviewed source configuration using environment `preview` and exact origin `https://spdlabs-preview.solutiv.org`, with different public keys. Production never trusts preview tokens. Fixture trust is available only in the isolated source-test loaders/builds described below.
4. Ship compatible public pins before activating a new server signer. Retain verification overlap through all outstanding offline leases and rollout/session response requirements. Rebuild `electron/vendor/purchase-jose.mjs` with `node scripts/bundle-purchase-jose.mjs` only when updating the pinned JOSE dependency; its MIT license ships separately.
5. Run the focused checks, artifact guard, genuine merchant/Clerk browser journey and owner-approved packaged Windows/macOS qualification before release. electron-builder already declares `spdbot`; registration/installer signing/notarization still require packaged qualification. No release or production activation was attempted here.

## Verification and evidence

Node **24.19.0**, pnpm **10.33.0**, installed Electron **43.7.9**, Windows host. Every runtime fixture used fresh TEMP home/profile/data paths, fake engines/authority and no provider credentials.

- `node --test electron/purchase-access.node-test.mjs`: **104 passed**. Executes all 23 shared lease corpus cases; strict numeric checks for all three token types; denial/status-only/restoration and corrupt watermarks; callback/URL injection, state/code races, expiry/nonbuyers; DPoP transport; serialized/lost refresh and restart; encrypted atomic storage/journal failure, baseline corruption, unavailable encryption and sign-out preservation; IPC sender checks and clock jumps.
- Focused Vitest suites cover the independent backend nonce/possession/update verifier, HTTP/WS/SSE, running routine expiry/revocation, background startup/restore and provider dispatch across expiry. The real control-omb backend proves HTTP/CLI/MCP side effects are denied without access while history and actual export still work. Registry/turn-dispatch and source/route guards are included. Final combined command/results are recorded below.
- `node scripts/testing/run-purchase-native.mjs`: **passed** using the real Electron executable, native safeStorage, actual IPC/preload/component and utilityProcess parent port. A separate Electron process delivers warm callback arguments through the real single-instance event; a cold unowned callback and replay are rejected. A second offline process restores the identical lease hash/expiry; synthetic elapsed time plus the native resume-event handler expires it and sign-out clears access. The first native run caught the decryption result-object mismatch, now covered by a regression.
- Native evidence: `C:/Users/Anwender/AppData/Local/Temp/spdbot-native-purchase-Xsnr5F/{online.json,offline.json,native-active.png,native-restricted.png}`. The active screenshot was inspected in an equivalent fixture; final screenshots are retained here. The test mounts the real connection component in a small test shell; this is not a full packaged-app visual test.
- Full `pnpm test:electron` run: **957 tests: 937 passed, 16 skipped, 4 failed** in unchanged tests. `cloud-sync-engine.node-test.mjs` and `cloud-sync-scan.node-test.mjs` cannot create symlinks on this Windows host (`EPERM`); two `vendor-updater.node-test.mjs` Linux AppImage tests require `mv` (`ENOENT`). These failures were not hidden or changed. Later consumer-only checks pass with the final 104 tests. Evidence: `C:/Users/Anwender/AppData/Local/Temp/spdbot-purchase-electron-final.log`.
- Production UI build passed, with the repository's existing CSS `::highlight` optimizer and large-chunk warnings. Core server bundling, full lint, types, i18n and Electron syntax checks were run; final results follow.
- Artifact guard checks the Electron import graph and built UI/core server artifacts for fixture private keys/authority/loaders, tests source exclusions and verifies that packaging rejects the current empty trust configuration.

### Final commands

```powershell
node --test electron/purchase-access.node-test.mjs
corepack pnpm exec vitest run server/purchase-access.test.ts server/purchase-bypass.e2e.test.ts server/control-omb.test.ts server/harness/registry.test.ts server/turn-dispatch-guard.test.ts scripts/testing/file-size-ratchet.test.ts scripts/testing/index-route-ratchet.test.ts scripts/after-pack.test.mjs
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm i18n:check
corepack pnpm check:electron
corepack pnpm build
corepack pnpm build:server
node scripts/check-purchase-artifacts.mjs
node scripts/testing/run-purchase-native.mjs
```

Final results: consumer Node suite **104 passed**; combined Vitest suite **81 passed, 11 platform skips** across eight files. Full lint, typecheck, all 12 locale catalogs (6928 source strings), 215 Electron module syntax checks, production UI build and core server build passed. The artifact guard passed for the Electron import graph and **949** built UI/core-server artifacts. Native Windows fixture passed with private utility-process verification. The documentation guard also passed all **7** checks. The separate full Electron-suite host failures remain as listed above.

A final review added a retained signed time-baseline status separate from the latest sequence observation. This prevents a newer denial issued during a small authority-clock correction from being lost or reviving the old lease after restart. Main and backend regression tests execute this case.

## Source exclusions and limits

`electron/testing/**` and Electron node tests are excluded explicitly by electron-builder; `server/testing/**` and server tests are excluded by server compilation. The control-omb purchase loader is source-only, explicitly selected by the fresh-profile launcher and requires its TEMP marker. It replaces build trust for a synthetic signed fixture rather than disabling verification. Restricted fixture mode loads no replacement. The native child's temporary test build contains only public fixture authority keys. None is a runtime option in production artifacts. Existing personal app/profile data receives no automatic entitlement.

Windows native evidence does **not** prove installed OS `spdbot` registration, signed installer behavior, packaged full-main lifecycle, a real browser/Clerk/Stripe buyer journey or physical suspend/resume. macOS Keychain/open-url/installer/notarization and provider cancellation remain unverified. No browser was opened, speaker playback performed or normal user profile accessed. Linux purchase distribution is outside this Windows/macOS offer.

A local administrator can replace code, restore an entire protected profile/machine or access OS-decryptable credentials. This software-only limitation does not create a bypass flag or unlimited offline term. Storage that cannot be written or removed restricts the current process; the journal prevents normal interrupted updates from reviving previous state, but no software can guarantee persistence against complete machine rollback.

The size ratchet shrinks `electron/main.mjs` from 3444 to 3402 lines and `server/index.ts` from 17285 to 17279 by moving existing window-persistence logic and private-message types into small modules. Config/Claude caps are unchanged. No new non-vendored source file exceeds 1000 lines. Generated `dist*` output is untracked/ignored and is not part of the handoff.

## Pre-activation package qualification

Implemented locally on Windows against `abe07379cde6326d0bb36a513780f7cdef380752`.
This resolves review integration concern A by adding the separate restricted
package path described in [CI documentation](../ci.md#linux-qualification-before-purchase-activation).
Production pins, purchase protocol/verifiers, consumer/server gating and the
ordinary distribution guard are unchanged. No distribution is activated.

The explicit Linux CI fixture builds the real main/UI/server/companion/native
resource trees. It has a separate package/app/install/AppArmor identity,
artifact prefix and ignored output directory; no publisher or update feed.
Its guard refuses shipping identities/output, resource omissions, prepackaged
inputs and every publishing policy except `never`. Actual packaged main and
purchase source bytes must match. The existing resource validators still run
with a real packager context, including browser/CUA/connector/DuckDB checks.
Source-only authority stays excluded from both kinds of package.

`package-linux` was absent from the central gate's `needs` list at this HEAD.
It is now required for runtime changes, with existing docs-only skip rules.
The Intel macOS PR runner expression is preserved. Valid production pins
select the ordinary distribution build and its existing active-package smoke;
invalid/partial pins fail instead of falling back to restricted qualification.

While pins are empty, required restricted qualification covers real package
contents/compliance, legacy DEB directory-mode repair, desktop registration,
Chromium/AppArmor installation, installed browser, locked application/backend
behavior, close/SIGTERM cleanup and same-profile SIGKILL restart. The old
active CUA package start/crash/retry, Wayland seat-safety and AppImage private
CUA staging assertions are **not run** in that lane. Linux CUA source tests and
`scripts/testing/restricted-package-execution.e2e.test.ts` separately qualify
the signed source fixture and fake engine before/after restart. This does not
qualify customer execution or purchase activation. CI records the distinction
in its job summary; normal release commands retain their rejecting guard.

An additional existing source test failure was reproduced at handoff:
`server/team-lifecycle.e2e.test.ts` restarts with plain `server/index.ts` rather
than `verificationServerArgs(env)` and without `OMB_TEST_PURCHASE=fixture`.
Its first post-restart mutation at the original line 108 returns HTTP 402.
Root's correction and remaining source-fixture audit are recorded below.
The new focused source smoke uses the existing launcher helpers on restart
and verifies actual fake-engine replies, captured requests and retained history.

Scoped file manifest:

- `.github/workflows/ci.yml`, `package.json`: explicit task/qualification selection and required job integration.
- `scripts/ci-restricted-builder.mjs`, `scripts/package-ci-restricted.mjs`: isolated builder configuration, guard, installer inputs and real resource checks.
- `scripts/linux-package-identity.mjs`, `scripts/select-linux-qualification.mjs`: fixed verification identities and fail-closed selection.
- `scripts/verify-linux-package.mjs`, `scripts/smoke-deb-upgrade.mjs`: retain distribution defaults and verify the separate fixture identity.
- `scripts/run-linux-restricted-smoke.mjs`: actual restricted package IPC/backend and lifecycle qualification on Linux.
- `scripts/purchase-packaging.test.mjs`, `scripts/ci-workflow.test.ts`, `scripts/testing/restricted-package-execution.e2e.test.ts`: real guard/config negatives, required gate checks and separate source execution.
- `docs/ci.md`, `docs/verification/desktop-purchase-access.md`: qualification boundary, manifest and evidence.

Local validation (Node 24.19.0, Corepack pnpm 10.33.0, Windows):

- `pnpm exec vitest run scripts/purchase-packaging.test.mjs scripts/ci-workflow.test.ts scripts/ci-scope.test.ts scripts/testing/verification-docs.test.ts scripts/testing/restricted-package-execution.e2e.test.ts scripts/after-pack.test.mjs scripts/linux-after-install.test.mjs electron/cua-linux-runtime.test.mjs server/purchase-access.test.ts server/purchase-bypass.e2e.test.ts`: **162 passed, 54 platform skips, 10 files passed**. Includes **24** focused packaging tests. Output: `.omb-scratch/ci-packaging-tests.log` (ignored).
- `pnpm lint`, `pnpm typecheck`, `pnpm check:electron` (215 modules), `pnpm i18n:check`: passed.
- `pnpm build`, `pnpm build:server`, `pnpm build:companion`: passed. Vite reported the existing highlight pseudo-element and large-chunk warnings.
- `node scripts/check-purchase-artifacts.mjs`: passed for the Electron import graph and **949** UI/core-server artifacts.
- Node syntax checks for the seven packaging/verification entry modules and `git diff --check`: passed. The target index is unchanged/empty and branch/HEAD match the supplied base. Ignored build output and generated fixture installer inputs are not source changes.

The separate exploratory `server/team-lifecycle.e2e.test.ts` run failed as
described above at handoff; no full-suite or native Linux success is claimed.

Native Linux package assembly/execution, DEB installation/upgrade, AppArmor,
setuid sandbox, packaged browser and unpacked/AppImage/DEB lifecycle require
GitHub's Ubuntu 24.04 x64 job. They cannot be reported as passed from Windows.
No Windows symlink/permission workaround is part of this change. No native
macOS buyer-access evidence or real buyer/provider/release evidence is added.

### Root package integration checks

Root reproduced the team-lifecycle HTTP 402, then changed both restart calls
to use `verificationServerEnvironment`, explicit `OMB_TEST_PURCHASE=fixture`
and `verificationServerArgs`. The existing signed source loader now retains
the same test contract as the initial launch; runtime gating is unchanged.
The complete lifecycle test, including malformed-registry recovery, passes.
The packaging guard test now replaces the temporary authority declaration as
a whole so its negative cases still work after production pins are filled.

The same ten-file command above plus `server/team-lifecycle.e2e.test.ts`
passed **163 tests with 54 platform skips** across 11 files on Windows.
Log: `C:/Users/Anwender/AppData/Local/Temp/spdbot-root-restricted-package-tests.log`.
The original failure is retained in `spdbot-team-restart-before.log` in the
same temporary directory. The earlier remote static failure on `abe07379c`
was a Markdown link to a Windows-only diagnostic directory; that reference
is now explicitly a local evidence path, not a repository link.

An exploratory `server/acp-recovery.e2e.test.ts` run reproduced the same
missing signed fixture on two restarted-server cases. Evidence is retained
in `spdbot-root-fixture-compatibility.log` in that temporary directory.
Other direct source-server launch/restart fixtures still need compatibility
review before PR #17 is ready. No successful full-suite result is claimed.
Additional Root files: `server/team-lifecycle.e2e.test.ts` and
`docs/verification/desktop-purchase-access-review.md`.

## Root integration follow-up

Root verified the 53-file handoff against the working tree at `251739ced770a71b61e6cb0b078d854e8a28cb0f`, reran all 104 consumer tests successfully, and checked the built artifact exclusions. The first packaged-server smoke reproduced a missing restricted-mode allowance: `GET /api/search` returned 402. Workspace backup export/status/download were also absent from the allowlist despite the intended data-export access.

The allowlist now preserves these exact read/export operations behind their existing authentication and backup authorization. Upload and restore remain restricted. The real restricted-harness regression checks search and backup status, retains the independent provider-login-storage safeguard, and verifies upload/restore remain denied. `server/purchase-access.test.ts`, `server/purchase-bypass.e2e.test.ts` and `server/workspace-backup-http.test.ts` passed together: **21 tests**. Server build and the 949-artifact exclusion check passed again.

The first rebuilt packaged smoke advanced beyond search, but its `bots --json` child twice returned valid JSON followed by Windows exit code `3221226505`. That historical failure is retained in `C:/Users/Anwender/AppData/Local/Temp/spdbot-root-purchase-packaged-smoke.log`; the verified fix is recorded below. Empty trust still deliberately prevents normal electron-builder packaging, including the existing CI package job. No production activation or complete desktop package qualification is claimed.

## Root review fixes, 2026-11-06

The [independent review](desktop-purchase-access-review.md) remains a record of the original 53-file snapshot. Root corrected all five reproduced findings:

- **F1:** strict ISO calendar validation accepts HTTP milliseconds, rounds absolute deadlines down and keeps signed JWT NumericDates integral. The actual sibling website authorization/signing code now opens the browser handoff and yields an accepted lease at `.123Z`; only database/rate-limit persistence was replaced in this producer/consumer diagnostic.
- **F2:** CUA start, enable and retry fail closed without an injected purchase/context guard, recheck after async inspection/start/cleanup, and do not publish a revoked host. Stop/disable remain available. Main checks the remote/platform context and owns one initial startup; later purchase transitions control restart/stop. Linux runtime checks both before spawn and after handshake. Windows fake-host regressions passed; Linux/macOS-specific lifecycle cases await their native CI hosts.
- **F3:** both Main state and backend admission recheck the current effective time and rollback after verification. Provider dispatch also calls synchronous `assertNow()` immediately before the adapter. The expiry/rollback regressions require zero adapter calls.
- **F4:** exact GET conversation-export and usage-CSV paths remain behind existing authentication. Markdown, JSON, CSV and a CLI export containing the seeded German greeting pass. The CLI manifest must contain a transcript and no skipped exports; its `bytes` field counts attachments, so transcript content is checked directly.
- **F5:** the German access bar exposes **Verbindung zurücksetzen** when secure access storage fails, including when no connection was restored. Reset removes only purchase state/journal, revalidates storage/trust and permits a fresh key/browser connection in the same process. Interrupted-write and adjacent-data preservation tests pass; the native Windows test clicks the actual reset button, reconnects and then verifies an offline restart.

The Windows CLI crash was isolated to forced process termination after finite HTTP commands. Those verbs now set the exit code, flush and terminate naturally; long-lived MCP/events and legacy service/pair commands retain their previous exit behavior. The packaged smoke now records bots stderr and **passes in full** against a copied server outside the repository with no node_modules in reach. No purchase guard was bypassed.

Root validation after these fixes:

- **111 consumer tests passed**; nine focused Vitest files: **52 passed, 29 platform skips**. Includes restricted HTTP/MCP/CLI, CUA Windows lifecycle, export, backup, documentation and source-size checks. Counts overlap earlier handoff suites.
- Native Windows Electron **43.7.9**: encrypted storage, warm/cold/replayed callbacks, private utility-process verification, German reset action, same-process reconnect, offline restart, unchanged deadline and exact three-day expiry passed. Latest evidence: `C:/Users/Anwender/AppData/Local/Temp/spdbot-native-purchase-lcP1pQ`; reset screenshot was visually checked in the preceding identical UI run `spdbot-native-purchase-xwoVSG/native-reset.png`. The fixture styles are not a full-app layout certification.
- Actual website producer diagnostic: `C:/Users/Anwender/AppData/Local/Temp/spdbot-access-review-fixes-20261106/protocol.json`.
- Typecheck, lint, locale checks, Electron syntax, renderer/server builds and the **949-artifact** exclusion check passed. Existing CSS/chunk warnings remain. Windows fake-media permission smoke passed with Electron **43.7.9** after removing inherited `ELECTRON_RUN_AS_NODE` only in that test process.
- Root logs are under `%TEMP%/spdbot-root-access-*`; the copied packaged server result is `spdbot-root-access-packaged-fixed.log`.

The [macOS package validation](macos-launch-validation.md) covers the earlier merged polish commit, not this buyer-access implementation. Normal distribution remains blocked by empty production public pins. A separate nonpublishable restricted-package CI fixture is still pending; the ordinary release guard must remain intact. Live merchant/identity configuration and packaged buyer journeys remain activation requirements.

## Exact owned-file manifest

- `docs/verification/README.md`
- `docs/verification/desktop-purchase-access-review.md`
- `docs/verification/desktop-purchase-access.md`
- `docs/verification/macos-launch-validation.md`
- `electron-builder.yml`
- `electron/cua-launch.test.mjs`
- `electron/cua-linux-runtime.cjs`
- `electron/cua-linux-runtime.test.mjs`
- `electron/cua-windows-isolation.test.mjs`
- `electron/cua.mjs`
- `electron/main.mjs`
- `electron/preload.cjs`
- `electron/purchase-access.node-test.mjs`
- `electron/purchase-authority.d.mts`
- `electron/purchase-authority.mjs`
- `electron/purchase-client.mjs`
- `electron/purchase-clock.d.mts`
- `electron/purchase-clock.mjs`
- `electron/purchase-desktop.mjs`
- `electron/purchase-jose.mjs`
- `electron/purchase-store.mjs`
- `electron/purchase-verifier.d.mts`
- `electron/purchase-verifier.mjs`
- `electron/purchase-wire.d.mts`
- `electron/purchase-wire.mjs`
- `electron/testing/purchase/access-v1.json`
- `electron/testing/purchase/fake-authority.mjs`
- `electron/vendor/purchase-jose.mjs`
- `electron/window-state-persistence.mjs`
- `scripts/before-pack-purchase.mjs`
- `scripts/bundle-purchase-jose.mjs`
- `scripts/check-purchase-artifacts.mjs`
- `scripts/control-omb.ts`
- `scripts/smoke-app-permissions.mjs`
- `scripts/smoke-packaged-server.mjs`
- `scripts/testing/file-size-ratchet.test.ts`
- `scripts/testing/purchase-native-main.mjs`
- `scripts/testing/purchase-native-ui.tsx`
- `scripts/testing/run-purchase-native.mjs`
- `server/desktop-private-message.ts`
- `server/exit.ts`
- `server/index.ts`
- `server/purchase-access.test.ts`
- `server/purchase-access.ts`
- `server/purchase-background.ts`
- `server/purchase-bypass.e2e.test.ts`
- `server/purchase-http.ts`
- `server/purchase-provider.ts`
- `server/purchase-runtime.ts`
- `server/spdbot.ts`
- `server/testing/purchase-authority.mjs`
- `server/testing/purchase-native-child.ts`
- `server/testing/purchase-parent.mjs`
- `shared/purchase-access.ts`
- `src/App.tsx`
- `src/components/PurchaseAccessBar.tsx`
- `src/components/onboarding/WelcomeGate.tsx`
- `src/lib/purchase-access.ts`
- `src/locales/de.json`
- `src/locales/en.json`
- `src/locales/source-hashes.json`
- `src/types/ogb.d.ts`
- `third_party/jose/LICENSE.md`
