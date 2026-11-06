# Targeted upstream launch backports — 2026-11-06

Implemented manually on `spd-launch-access-hardening`, base
`606a253f7d7584e1d7f95157b2af75c1b5751df5`, following desktop polish
`d5a7e17c8`. This record covers only the five commits below. The
[launch audit](../plans/upstream-launch-audit-2026-11-06.md) remains a historical
research handoff; its other recommended batches have not been implemented here.

## Provenance and modified source

Apache-core changes adapted from OpenMausBot; original attribution and
`LICENSE`/`NOTICE` are retained. No enterprise implementation was imported.

| Source commit | Original attribution | Local change |
| --- | --- | --- |
| [`367848d0cb73078e850e63658352376c47097796`](https://github.com/milind-soni/OpenMausBot/commit/367848d0cb73078e850e63658352376c47097796), [PR 3177](https://github.com/milind-soni/OpenMausBot/pull/3177) | Milind Soni; co-author Claude Opus 5.5 | `server/config.ts`: Claude (API key) always receives the saved key and optional base URL; unset/on extends it to other Claude instances. Key changes reload both built-in instances. |
| [`9022b979c4f2116dd36f59b2fd56738ff5a79fac`](https://github.com/milind-soni/OpenMausBot/commit/9022b979c4f2116dd36f59b2fd56738ff5a79fac), PR 3177 | Milind Soni; co-author Claude Opus 5.5 | `server/drivers/claude.ts`: snapshot billing/account method follows the effective turn environment or CLI API-key sign-in. Existing keep-warm eligibility now rejects those metered instances. `server/testing/fake-claude-cli.ts` adds the upstream synthetic API-key auth mode. |
| [`14265e33c330f46999a93c170507a9816f774fc6`](https://github.com/milind-soni/OpenMausBot/commit/14265e33c330f46999a93c170507a9816f774fc6), [PR 3561](https://github.com/milind-soni/OpenMausBot/pull/3561) | milind-soni; co-author Claude Opus 5.5 | `server/request-auth.ts`: sensitive Local VM/webhook-address GETs require the desktop owner capability or a session. Cookie-only browser sessions need positive same-origin proof for effect GETs too, including connector refresh, viewers and browser streams. |
| [`b879e18787aa91e501e1ae25eae6c637386ea259`](https://github.com/milind-soni/OpenMausBot/commit/b879e18787aa91e501e1ae25eae6c637386ea259), [PR 3985](https://github.com/milind-soni/OpenMausBot/pull/3985) | kevin; co-author Milind Soni | `shared/redact.ts`: mask Basic/Proxy-Authorization base64 credentials, including quoted/JSON headers, while preserving placeholders and ordinary prose. |
| [`19139f5c284f8710e0a2471f1b89e0ac44a54a88`](https://github.com/milind-soni/OpenMausBot/commit/19139f5c284f8710e0a2471f1b89e0ac44a54a88) | Rudy Celekli | `server/login-store.ts`: held secrets include the `URLSearchParams` form-urlencoded spelling, including `! ' ( ) ~`, spaces and plus signs. |

No dependency outside this selection was needed. The disabled Cloud sign-in
copy/locales from the first commit were deliberately omitted. No versions,
dependencies, data paths, upload code, avatars, fork permission fields,
owner/request capability headers, branding, Cloud-offer guards or enterprise
package exclusions were changed. SPD-24 was not reapplied. Purchase entitlement
and its server contract remain separate work.

## Regression coverage

- `server/config.test.ts` and `server/drivers/claude.test.ts`: both built-in
  Claude instances; key present/absent; every-Claude unset/on/off; base URL;
  reload selection; the CLI's own API-key login; inherited keys stripped from
  turns. New selected tests produced 11 expected failures on the original
  production code, then passed after the backports.
- `server/claude-billing.e2e.test.ts`: shared `control-omb` launcher, disposable
  home/data, sealed CLI PATH, fake Claude only. Saves synthetic settings, runs
  both instances through `send`, `wait` and `messages`, checks the actual CLI
  key environment and resulting task state. With every-Claude on both are
  metered with no keep-warm window; off leaves plain Claude subscription/warm
  and Claude API metered/no window. Receipts retain full wait/messages JSON.
- `server/request-auth.test.ts`: anonymous/wrong owner denied, real owner and
  paired callers admitted, ordinary lists preserved; hosted cookie-only
  effect GETs reject missing/none/same-site/cross-site/foreign-origin proof
  and accept matching Origin or same-origin Fetch Metadata. Includes webhook
  addresses, both Local VM forms, connector refresh, viewer and browser stream.
- `server/request-auth.e2e.test.ts`: actual isolated desktop-mode HTTP routes,
  simulated private parent capability, unsigned browser, forged owner,
  forwarded host, legitimate owner and paired bearer. No desktop GUI or VM
  is started. **The fork has no webhook-address handler:** its authenticated
  GET remains 404; the resolver guard is ported, without importing a new API.
- `server/redact.test.ts`, `server/login-store.test.ts`,
  `server/chat-widgets.test.ts`, `server/decision-log.test.ts`: synthetic Basic
  and Proxy headers, case/quoting/JSON/padding, placeholders, prose,
  idempotence, form URLs/bodies, overlapping saved/filled secrets, widget
  fallbacks/actions and persisted/CSV decision logs.

## Check receipts

Windows, Node `24.19.0`, Corepack pnpm `10.33.0` (the global pnpm is older).
All commands ran from the desktop repo. No install or lockfile update ran.

```powershell
corepack pnpm exec vitest run server/config.test.ts server/drivers/claude.test.ts server/drivers/claude-accounts.test.ts server/drivers/claude-keepwarm.test.ts server/cache-keepwarm.test.ts server/request-auth.test.ts server/request-auth.e2e.test.ts server/redact.test.ts server/login-store.test.ts server/webhooks.test.ts server/local-computer.test.ts server/local-computer-proxy.test.ts server/routes/desktop-viewer.test.ts server/routes/browser-viewers.test.ts server/connector-card-text.test.ts server/connector-proxy.test.ts server/decision-log.test.ts server/turn-log.test.ts server/chat-widgets.test.ts
# PASS: 19 files, 674 tests passed, 12 skipped; 129.14 s.

corepack pnpm exec vitest run server/claude-billing.e2e.test.ts server/request-auth.e2e.test.ts server/chat-widgets.test.ts server/decision-log.test.ts server/request-auth.test.ts server/redact.test.ts server/login-store.test.ts server/config.test.ts
# PASS after final regression/evidence additions: 8 files, 343 passed, 3 skipped; 17.14 s.

node --test electron/desktop-server-auth.node-test.mjs electron/desktop-viewer-permissions.node-test.mjs
# PASS: 7 tests; Node-level owner-header and viewer-permission coverage.
```

The Vitest runs overlap; their test totals must not be added.

### CI follow-up: source-size ratchet

PR #16 at `c5b7c0120` failed Ubuntu shard 3 only because the backports grew
`server/config.ts` to 1,438 lines and `server/drivers/claude.ts` to 2,172 lines.
The shard otherwise passed 5,442 tests and skipped 70.

The existing key-injection block and its comments now live in
`server/anthropic-key-routing.ts`; the public instance constant remains exported
from `server/config.ts`. The existing account/billing snapshot return now lives
in `server/drivers/claude-auth-status.ts`. Both moves preserve the decisions,
environment mapping, cached auth state and snapshot fields. No limits were
raised: the ratchet was lowered to 1,434 and 2,165 lines respectively.

The CI correction does not change product behavior, provider credentials,
dependencies, policy, UI or native capture runtime. Follow-up validation on
Windows passed:

- `corepack pnpm exec vitest run scripts/testing/file-size-ratchet.test.ts server/config.test.ts server/drivers/claude.test.ts server/drivers/claude-auth.test.ts server/drivers/claude-accounts.test.ts server/drivers/claude-keepwarm.test.ts server/cache-keepwarm.test.ts server/claude-billing.e2e.test.ts`: **459 passed, 5 skipped**, eight files, 84.68 seconds. The isolated fake-CLI billing journeys still pass.
- `corepack pnpm exec vitest run scripts/testing/verification-docs.test.ts scripts/testing/file-size-ratchet.test.ts`: **8 passed**; the size test overlaps the run above.
- Full lint, typecheck, i18n validation, Electron syntax (205 modules) and diff whitespace checks passed. Native/package/provider verification was not repeated for this extraction; remote CI must verify the new commit.

The table below records the original backport run.

| Check | Result |
| --- | --- |
| `corepack pnpm lint` | Passed, including the added fixtures. |
| `corepack pnpm typecheck` | Passed. |
| `corepack pnpm i18n:check` | Passed; 12 catalogs, 6,919 English strings; no copy changes. |
| `corepack pnpm check:electron` | Passed; 205 modules syntax-checked with Electron as Node. |
| `corepack pnpm build:server` | Passed. Existing bundler also emits ignored enterprise output when its source exists; this is not an authorized distributable. Existing package exclusion remains required. |
| `corepack pnpm exec vite build` | Passed; 5,378 modules, 31.97 s. Existing `::highlight` CSS optimizer and large-chunk warnings remain. |
| `corepack pnpm exec vitest run scripts/testing/verification-docs.test.ts` | Passed; 7 documentation/link/route checks. |
| `git diff --check` | Passed. |

### Local evidence

Fixture data/homes were closed and removed by the shared launcher. Logs and
synthetic JSON receipts remain under
`C:\Users\Anwender\AppData\Local\Temp\openmausbot-verification-evidence`:

- `server-1793984930083-35608-claude-billing.json` and matching `.log`: every-Claude on, both metered, key applied, settled, no keep-warm.
- `server-1793984933499-35608-claude-billing.json` and matching `.log`: every-Claude off, plain Claude subscription/warm, API Claude metered/no window, both settled.
- `server-1793984937454-10860-sensitive-gets.json` and matching `.log`: rejection matrix and successful owner/paired Local VM reads.

The tests recreate these receipts on each run; the machine-local files are not
release artifacts. No actual provider credentials or live requests were used.

## Limits and handoff

Native app launch, installer/package smoke, macOS, real Claude/provider login,
real browser/VM control and live billing were not exercised. The Node tests and
Electron syntax check do not establish native/package behavior. Keep-warm
verification proves admission/window state, not a real 50-minute provider ping.
Hosted browser-session origin enforcement is tested through the real resolver,
not a live hosted sign-in. Redaction remains the selected upstream pattern and
held-secret spellings, not a guarantee against every possible secret encoding.

Changes are uncommitted for the parent; no branch/index/commit/push/PR/release
or deployment operation was performed. The desktop-polish PR remains a separate
review unit. Upload hardening, dependency remediation and all other audit batches
still need their own scoped implementation and verification.

## Root CI follow-up: coordination test synchronization

[SPD-27](https://linear.app/devtones/issue/SPD-27) tracks the Windows shard 2/4
failure in [run 42280610619](https://github.com/thisistoni/spdbot/actions/runs/42280610619)
at `464243c23089f17c4c4cc91bcd7728e5209bfc76`. One test in
`server/direct-coordination.e2e.test.ts` exceeded 45 seconds; the aggregate CI
failure follows that shard. The other required jobs, including the macOS smoke
on the PR's Intel runner, passed. The failed shard itself passed 4,819 tests and
skipped 147 before reporting the single timeout.

The original targeted test passed locally, so the remote timeout was not
reproduced. Inspection did expose an insufficient synchronization boundary:
handoff status `running` precedes provider setup, and the Chief can still be
inside its sending turn. Reconfiguring their shared engine at that point can
interrupt both conversations, rather than the intended teammate-only case.

The test now waits for the fake provider's existing `readyFile` receipt and a
non-busy Chief waiting for teammates before changing the engine key. All result
and interruption-reason assertions and the 45-second test timeout remain intact.
No runtime behavior, retry policy or provider settings were changed by this fix.

After the change, the full coordination E2E file passed **41/41 tests** on
Windows in 188.76 seconds, with no retries. The seven documentation checks,
targeted lint and whitespace checks also passed. Evidence:
`%TEMP%/spd-pr16-direct-coordination-fixed.log` and
`%TEMP%/spd-pr16-synchronization-docs.log`. GitHub CI must still confirm the
updated PR head.
