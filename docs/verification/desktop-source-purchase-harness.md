# Source purchase harness compatibility

Verified on 2026-11-06 from supplied HEAD `c0a79504dfc99f6c4b8a299631d86b7c63af2c66`, branch `spd-launch-buyer-access`, native Windows, Node 24.19.0, pnpm 10.33.0 and Electron 43.7.9. All source edits are unstaged. Git refs/index, PR state, production pins, purchase gate/verifier/consumer, packager/workflows and app source were not changed. Root owns integration, remote qualification and the separate production parent-port ordering fix.

## Inventory and contract

The initial AST inventory identified **120 direct source-server spawn sites in 108 test files**. The wider audit also found four secret-pipe server fixtures, the optional automation UI secret-pipe fixture, the shared restartable harness, nested CLI serve launches, the eval LocalVmWorld and two native utility-process smokes. Data-directory lock rejection and the read-only legacy-migration fixture remain raw. The decision-log permission/card workflow now explicitly receives signed source access. Opt-in live evals remain unmodified and disabled.

| Fixture family | Integration |
| --- | --- |
| Existing control-omb restarts | Explicit `OMB_TEST_PURCHASE=fixture`, `verificationServerEnvironment` and `verificationServerArgs`; retain extra provider/clock/peer hooks. Includes ACP, recovery, rooms/roots, routines, model/permissions, memory and data fixtures. Root's team-lifecycle correction remains unchanged. |
| Custom server fixtures | `sourcePurchaseHome` exclusively creates short TEMP profiles; `spawnSourcePurchaseServer` adds the existing source loader and retains original argv, provider fakes, stdio, timeouts and cleanup. Includes auth/privacy/hosted accounts, cloud/computers, coordination, threads, notifications and index API tests. |
| Secret-pipe fixtures | Explicit `sourcePurchaseServerArgs` / `sourcePurchaseEnvironment` around `spawnWithSecrets`; preserve its separate secrets pipe and offline fetch hooks. The missing-SDK 1Password profile also needs its own fresh ownership marker. |
| Shared restartable server | Own a fresh source profile, then apply the same signed source loader on every start. Existing automation lifecycle assertions and scheduled time remain unchanged. |
| Source CLI serve | Explicit positive-only wrapper preloads a hook that adds the signed loader only to the exact source-server child. Ordinary no-account/rejected credential and read-only/no-pair cases remain raw. Existing CLI pairing, shutdown and POSIX gateway/domain assertions remain. |
| Evals | LocalVmWorld uses the same fresh source profile/server helper; retains VM hook, local scripted engine and disposal. No real VM/provider or live tier was enabled. |
| Native approval smoke | Explicit source entry imports the signed loader before index; uses genuine utilityProcess parent port and the original private approval coordinator. Initial bot responses assert HTTP 201 before dereferencing. Node-only sealed PATH makes repository fake CLIs runnable on Windows. All UI mode branches are retained; UI playback was not run. |
| Native phone smoke | First proves the unchanged real dist-server bundle returns HTTP 402 even with authentic desktop-owner capability. Only a separate TEMP bundle receives public fixture pins, never private keys. Genuine parent nonce/signature proof travels over utilityProcess. Real compiled companion pairing/authorization/revocation runs with a source-only loopback binding/discovery wrapper. |

The custom helper refuses existing/adopted homes, even copied markers. The source loader requires the owned marker, canonical TEMP/profile relationship, matching HOME/USERPROFILE and a data path whose nearest existing ancestor stays inside that owned root. Inherited config/cache/provider-home paths are contained; developer CLI discovery is sealed. The control-omb loader restrictions remain. Authority and device proof still use the fixed synthetic key corpus, real token signatures, strict backend verifier and fresh nonce possession. No purchase environment bypass or global test-setup mock was added.

The loader waits for independently verified access **before** importing index, preventing a health-ready/purchase-not-ready startup race. It explicitly attaches only when import did not already register its port, supporting both the supplied HEAD and Root's separate explicit-attach production integration without replaying a nonce. The combined production integration must be verified by Root after merge.

## Before and after evidence

All log names below are under `C:/Users/Anwender/AppData/Local/Temp/`. Logs/reports are evidence, not shipping files.

| Reproduction | Before | After |
| --- | --- | --- |
| ACP context/recovery + automatic recovery | 19/19 failed, HTTP 402 after raw restart; `spdbot-compat-before-restarts.log` | These suites plus hosted access: **37 passed**; `spdbot-compat-after-handshake.log`. |
| Seven representative custom fixtures | **33 failed, 11 passed**; `spdbot-compat-before-custom.log` | Signed execution reached original assertions; final broad results below. An intermediate run exposed the startup proof race, fixed by loader readiness. |
| Four secret-pipe fixtures | **19 failed, 2 passed**; `spdbot-compat-before-secret-spawns.log` | Execution-positive assertions now reached; final cloud results below. |
| Shared automation lifecycle | **1 failed**, HTTP 402 at first bot creation; `spdbot-compat-restartable-before.log` | **1 passed**, including scheduled work and restart/orphan cleanup; `spdbot-compat-restartable-after.log`. |
| CLI serve/read-only audit | **1 failed, 33 passed, 11 skipped**; no pairing code because HTTP 402; `spdbot-compat-standalone-audit.log` | CLI/security group **57 passed, 6 existing skips**; `spdbot-compat-final-security-cli.log`. |
| Evals | Root CI: 4 failed/65 passed; three lazy-claim scenarios and installSkill returned 402. | **69 passed in 13 files**; final parity commands below. |
| Native approval | Original HEAD script locally reproduced `whole.id` TypeError; `spdbot-compat-native-approval-before.log`. | Full non-UI native approval smoke passed; `spdbot-compat-native-approval-modes.log`. |
| Native phone | Unchanged compiled artifact deliberately proves HTTP 402 with real owner capability. | Separate signed TEMP bundle passed all original pairing, forged-header, reply, sidecar restart, control-token and unpair/revocation assertions; `spdbot-compat-native-phone-relay-auth.log`. |

No skips, retries or original assertion/timeout changes were added to make a suite pass. Static AST comparison against the supplied HEAD found **9,502 unchanged expect calls and 1,121 unchanged test declarations/explicit timeout arguments across 121 edited test files**. Optional UI tests stay disabled; existing Windows platform skips remain.

## Ubuntu-driven follow-up

Root supplied clean historical Ubuntu logs for run `42291415029` on `0c930ab`: shard 2 had **38 failed files / 184 failed / 4652 passed / 67 skipped**; shard 3 **28 / 384 / 5281 / 97**; shard 4 **31 / 146 / 4876 / 87**. These are remote baseline evidence, not successful runs of this change. All **97** failed file names were mapped: **94** are covered by direct fixture edits or their source harness dependencies. Three remain Root-owned and untouched here: `server/thread-capacity-api.test.ts`, `server/direct-coordination.e2e.test.ts`, and `server/purchase-bypass.e2e.test.ts`. Mapping: TEMP `spdbot-compat-ubuntu-shards-mapping.json`.

The follow-up audit covered already-factored argv whose environment omitted the purchase opt-in: `server/acp-shutdown.e2e.test.ts`, `server/long-running-chief.e2e.test.ts`, `server/runtime-coordination.e2e.test.ts`, `server/runtime-paths.e2e.test.ts`, and `server/routine-recovery.e2e.test.ts`. Quota-switch needed a fresh owned source profile. `scripts/verify-workspace-backup.ts` retains its excluded provider/auth home and its real encrypted restore assertions while restarting with the signed loader. The optional data/company-backup verification scripts had the same raw restart; their argv/env now use the existing signed launcher helpers, preserving the special backup home. Those two manual UI workflows were syntax-checked only; browser/UI execution was excluded by the task.

- Quota-switch plus workspace-backup before adaptation: **7 failed**, purchase-denied setup (`spdbot-compat-additional-before.log`).
- All seven follow-up source suites afterwards: **34 passed**, no skips/failures (`spdbot-compat-additional-source.{log,json}`). Includes actual encrypted workspace restore/continuation, all routine recovery and shutdown cases, runtime paths/coordination and nine multi-turn Chief cases.
- Companion proxy's selected appearance-save cases before: **3 failed**, HTTP 402; **25 nonselected** (`spdbot-compat-shard2-before.log`). Its full suite afterwards: **28 passed**. Decision-log and CLI service-trust remain their existing Windows platform skips: **10 skips** across those two files; no new skips were added. Combined three-file result: **28 passed / 10 skipped** (`spdbot-compat-companion-service.{log,json}`). CLI service trust keeps real owner-token stdin and separate unauthenticated CLI/header denials.
- Automation lifecycle was already covered through the shared restartable helper: **1 passed** with the original schedule, webhook and orphan/restart assertions. Local-VM evals were already included in the **69 passed** eval parity run.
- Root's separate capacity check reported five raw steer-queue setup failures in its untouched checkout; this checkout's full signed `server/steer-queue.test.ts` already passed **43/43** in the broad core run. No production queue code was changed here. Root also compared old Windows shard 3 (**28 failed files / 381 failed / 5193 passed / 188 skipped**): its five Windows-only Host-Lazy-Claim HTTP 402 cases are covered by this checkout's **5/5 passing** `server/host-lazy-claim.e2e.test.ts` result.

```powershell
corepack pnpm exec vitest run server/quota-switch.e2e.test.ts server/workspace-backup-workflow.test.ts server/acp-shutdown.e2e.test.ts server/long-running-chief.e2e.test.ts server/runtime-coordination.e2e.test.ts server/runtime-paths.e2e.test.ts server/routine-recovery.e2e.test.ts --reporter=default --reporter=json --outputFile=$env:TEMP/spdbot-compat-additional-source.json
corepack pnpm exec vitest run companion/test/proxy.test.ts server/decision-log-wiring.test.ts server/cli-service-trust.e2e.test.ts --reporter=default --reporter=json --outputFile=$env:TEMP/spdbot-compat-companion-service.json
node --check scripts/verify-workspace-backup.ts
node --check scripts/verify-data.ts
node --check scripts/verify-company-backups.mjs
```


The final historical-log pass also includes Ubuntu shard 1 (**30 failed files / 117 failed tests**) and Windows shard 4 (**27 / 130**). Across all four Ubuntu shards plus the supplied Windows shards 3/4, **128 distinct failed files** are accounted for: **123** through these fixtures/helpers and **5 Root-owned files**, adding `server/guarded-messages-api.test.ts` and `server/mcp-selection.e2e.test.ts` to the untouched Root set above. Both eval test files map to LocalVmWorld and passed in the 69-test eval run. Delta-context, routine-unanswered-wait, Group-Local-VM and session-credentials already passed in the broad core run. No additional source edits were required for these last logs. Complete mapping: TEMP `spdbot-compat-all-old-shards-mapping.json`.

## Commands and results

`spdbot-compat-groups.json` (retained TEMP inventory) contains the exact two broad source file arrays: 86 core files and 20 cloud/computer files. The cloud command adds the four secret-pipe suites. Commands use Corepack only to resolve the repository's pinned pnpm.

```powershell
$groups = Get-Content -Raw "$env:TEMP/spdbot-compat-groups.json" | ConvertFrom-Json
$core = $groups[1]
corepack pnpm exec vitest run @core --reporter=default --reporter=json --outputFile=$env:TEMP/spdbot-compat-source-core.json
$cloud = @($groups[0]) + @('server/cloud-onepassword.e2e.test.ts', 'server/cloud-routine-level.e2e.test.ts', 'server/cloud-guest-shell.e2e.test.ts', 'server/opencode-provider-keys.e2e.test.ts')
corepack pnpm exec vitest run @cloud --reporter=default --reporter=json --outputFile=$env:TEMP/spdbot-compat-source-cloud.json
corepack pnpm exec vitest run server/cloud-onepassword.e2e.test.ts
corepack pnpm exec vitest run server/automations-lifecycle.e2e.test.ts
corepack pnpm exec vitest run server/cli.test.ts server/testing/source-purchase-fixture.test.ts server/purchase-access.test.ts server/purchase-bypass.e2e.test.ts scripts/testing/restricted-package-execution.e2e.test.ts scripts/testing/automations-journey.ui.e2e.test.ts
node --test electron/purchase-access.node-test.mjs
corepack pnpm exec tsc -p evals/tsconfig.json
corepack pnpm exec vitest run --config evals/vitest.config.ts
corepack pnpm eval
corepack pnpm eval --golden
corepack pnpm eval --live
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm i18n:check
corepack pnpm check:electron
corepack pnpm build:server
node scripts/check-purchase-artifacts.mjs
corepack pnpm exec vitest run scripts/testing/verification-docs.test.ts server/testing/source-purchase-fixture.test.ts server/purchase-access.test.ts server/purchase-bypass.e2e.test.ts server/control-omb.test.ts server/harness/registry.test.ts server/turn-dispatch-guard.test.ts scripts/testing/restricted-package-execution.e2e.test.ts
```

Native commands are `pnpm exec electron scripts/smoke-approval-modes.cjs` and `pnpm exec electron scripts/smoke-phone-relay-auth.cjs`. The local Node wrapper launches the installed Electron executable with a temporary main profile and a platform/PATH-only environment, omitting inherited ELECTRON_RUN_AS_NODE **only for those child processes**, with windowsHide. Shell/user environment is unchanged. Native approval and phone smokes passed, including runtime assertions that both compiled sidecar generations bound only 127.0.0.1. No browser/audio UI mode was requested or run.

- Broad core source result: **832 passed, 3 failed, 115 existing skips**, 86 files (**64 passed / 2 failed / 20 fully skipped**); `spdbot-compat-source-core.{log,json}`. All three failures are listed below; none is purchase admission.
- Broad cloud source run: **149 passed, 2 failed, 14 existing skips**, 24 files. One harness-owned missing-SDK profile was subsequently corrected and its complete file passed **3/3** (`spdbot-compat-onepassword-final.log`). The remaining failure is Windows symlink EPERM below; no green aggregate is claimed by adding rerun totals.
- Additional signed-fixture/CLI/security group: **57 passed, 6 existing skips**, including two optional UI skips. Separate source security/helper/control-omb check previously passed **30 tests**; the final helper/docs-only check passed **13/13** (`spdbot-compat-docs-helper-final.log`).
- Consumer security suite: **111 passed**, no skips (`spdbot-compat-consumer-final.log`). Existing standalone/copied-lease, bad signature/nonce, wrong authority, expired/revoked/rollback, HTTP/WS/SSE and execution-denial tests are unchanged. Restricted production pins stay empty.
- Evals final: standalone typecheck passed; **69/69 tests in 13 files**, **6/6 Tier 1 scenarios**, **1/1 golden replay** passed. `pnpm eval --live` printed `live tier skipped`; no live env was enabled. Logs: `spdbot-compat-evals-{types,tests}.log`, `spdbot-compat-eval-{cli,golden,live}.log`.
- Lint, typecheck, standalone eval types, i18n (**12 catalogs / 6929 strings**), Electron syntax (**215 modules**), ten added/changed script/loader syntax checks, production server build and `git diff --check` passed. Final focused guards/docs command passed **95 tests with 2 existing platform skips** across eight files, including all **7** documentation checks (`spdbot-compat-final-guards.log`). The production server build and existing artifact guard passed for **949** built UI/core-server artifacts. A separate scan also found none of the new fixture marker, prefix, CLI hook or TEMP-bundle identity in those 949 artifacts. No runtime import graph includes testing helpers; server/testing is excluded from emitted server inputs and scripts/testing is outside builder file inputs.

## Remaining failures and limits

1. `server/index.test.ts`: two existing English greeting/search assertions fail against the current German default. Focused diagnostic reproduced both after successful signed access (`spdbot-compat-existing-greeting-failures.log`); expectations were retained.
2. `server/cloud-lending-memory.e2e.test.ts`: existing symlink memory case hits Windows `EPERM` at symlink creation. No privilege/OS change, new skip or weakened assertion was applied.
3. `server/thread-aware-bots.e2e.test.ts`: existing quiet self-thread case never starts the second queued task within its original 15-second poll after release. The broad run stalled at the third task (line 277); isolation stalled at the second task (line 274), both after release (`spdbot-compat-remaining-diagnostics.log`). This is an unresolved functional scheduler result after admission, not HTTP 402; because raw startup previously masked it, its pre-access baseline classification is unproven. No production coordination code was changed. Root separately reports that synchronous dispatch reservation fixes the capacity/FIFO issue on its newer remote integration; that production change is not present or tested in this supplied-HEAD checkout.

This is Windows source/native-fixture evidence, not full CI, Linux/macOS package qualification, real commerce activation, real providers, a release or deployment. Root owns the separate Linux package/verifier and production private-listener-ordering changes. Their combined commit and native macOS behavior remain to be qualified remotely. Existing unrelated full-Electron Windows symlink/POSIX-tool limitations recorded in [desktop purchase access](desktop-purchase-access.md) remain outside this work.

## File manifest

<details>
<summary>Scoped unstaged files</summary>

```text
companion/test/proxy.test.ts
docs/verification/README.md
docs/verification/desktop-source-purchase-harness.md
evals/runners/local-vm-world.ts
scripts/smoke-approval-modes.cjs
scripts/smoke-phone-relay-auth.cjs
scripts/testing/automations-journey.ui.e2e.test.ts
scripts/testing/phone-sidecar-fixture.mjs
scripts/testing/purchase-server-fixture.mjs
scripts/verify-company-backups.mjs
scripts/verify-data.ts
scripts/verify-workspace-backup.ts
server/acp-context-reports.e2e.test.ts
server/acp-recovery.e2e.test.ts
server/acp-shutdown.e2e.test.ts
server/admin-activity.e2e.test.ts
server/antigravity-account-api.test.ts
server/app-events-cloud.e2e.test.ts
server/automatic-recovery.e2e.test.ts
server/boat-included.e2e.test.ts
server/boot-readiness.e2e.test.ts
server/bot-visibility.e2e.test.ts
server/bot-wire-privacy.e2e.test.ts
server/branching.test.ts
server/browser-codex-path.integration.test.ts
server/browser-shutdown.e2e.test.ts
server/bulk-delete-tasks.e2e.test.ts
server/card-answerers.e2e.test.ts
server/chat-followups-restart.test.ts
server/chatgpt-plan-api.test.ts
server/claude-account-api.test.ts
server/cli-probe-env.test.ts
server/cli-service-trust.e2e.test.ts
server/cli.test.ts
server/cloud-computer-auto-sleep.e2e.test.ts
server/cloud-computer-lazy.e2e.test.ts
server/cloud-computer-slow-start.e2e.test.ts
server/cloud-connected-apps.e2e.test.ts
server/cloud-credit.e2e.test.ts
server/cloud-guest-shell.e2e.test.ts
server/cloud-home-server.test.ts
server/cloud-lending-browser.e2e.test.ts
server/cloud-lending-memory.e2e.test.ts
server/cloud-lending.e2e.test.ts
server/cloud-logins.e2e.test.ts
server/cloud-move-merge.e2e.test.ts
server/cloud-move.e2e.test.ts
server/cloud-onepassword.e2e.test.ts
server/cloud-personal.e2e.test.ts
server/cloud-routine-level.e2e.test.ts
server/cloud-sharing.e2e.test.ts
server/cloud-sync.e2e.test.ts
server/codex-review.e2e.test.ts
server/command-allowlist.e2e.test.ts
server/comms.test.ts
server/computer-engine-removal.e2e.test.ts
server/context-compaction.e2e.test.ts
server/data/data.e2e.test.ts
server/decider-included.e2e.test.ts
server/decider-rooms.e2e.test.ts
server/decision-log-wiring.test.ts
server/delta-context.e2e.test.ts
server/digest.e2e.test.ts
server/email-signin.test.ts
server/engine-status-reads.e2e.test.ts
server/full-access-default.e2e.test.ts
server/full-access-workflows.e2e.test.ts
server/grok-sign-in-api.test.ts
server/group-goal-run.e2e.test.ts
server/group-goal-wait-cap.e2e.test.ts
server/group-local-vm.e2e.test.ts
server/helper-model.e2e.test.ts
server/highlevel.e2e.test.ts
server/hooks.e2e.test.ts
server/host-lazy-claim.e2e.test.ts
server/hosted-access.test.ts
server/hosted-models-api.test.ts
server/index.test.ts
server/live-call.e2e.test.ts
server/long-running-chief.e2e.test.ts
server/memory-capture-restart.e2e.test.ts
server/model-variant-return.e2e.test.ts
server/no-omb-cards.e2e.test.ts
server/notification-routing.e2e.test.ts
server/notification-wiring.test.ts
server/onboarding-model-default.e2e.test.ts
server/openai-compat-vm.e2e.test.ts
server/opencode-provider-keys.e2e.test.ts
server/opencode-variants.e2e.test.ts
server/peer-allowlist.e2e.test.ts
server/peer-approval.e2e.test.ts
server/people-invite.test.ts
server/phone-claim.e2e.test.ts
server/place-view.e2e.test.ts
server/post-to-room.test.ts
server/product-isolation.e2e.test.ts
server/quota-switch.e2e.test.ts
server/remote-sessions.test.ts
server/respond-replay.e2e.test.ts
server/room-chat-wait.e2e.test.ts
server/room-coordination.e2e.test.ts
server/room-holds.e2e.test.ts
server/room-question-tasks.e2e.test.ts
server/room-recovery.e2e.test.ts
server/room-roots.e2e.test.ts
server/routine-recovery.e2e.test.ts
server/routine-results.e2e.test.ts
server/routine-run-broadcast.e2e.test.ts
server/routine-unanswered-wait.e2e.test.ts
server/routines-startup.test.ts
server/runtime-coordination.e2e.test.ts
server/runtime-paths.e2e.test.ts
server/runtime-roots.e2e.test.ts
server/safety-floor.e2e.test.ts
server/session-credentials.e2e.test.ts
server/setup-connect-card.e2e.test.ts
server/shared-computers.gate.test.ts
server/steer-e2e.test.ts
server/steer-queue.test.ts
server/steer-unattended.e2e.test.ts
server/surface-pins.e2e.test.ts
server/team-memory-integrity.e2e.test.ts
server/testing/purchase-parent.mjs
server/testing/purchase-source-entry.mjs
server/testing/restartable-server.ts
server/testing/source-cli-server-hooks.mjs
server/testing/source-purchase-fixture.test.ts
server/testing/source-purchase-fixture.ts
server/thread-aware-bots.e2e.test.ts
server/thread-model-follow.e2e.test.ts
server/thread-page-frames.e2e.test.ts
server/thread-title-regenerate.e2e.test.ts
server/tool-scope.e2e.test.ts
server/trust-controls.e2e.test.ts
server/usage-attribution.e2e.test.ts
server/vps-routing.test.ts
server/webhook-restart.e2e.test.ts
```

</details>
