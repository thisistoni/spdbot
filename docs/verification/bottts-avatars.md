# Bottts Neutral customization

The two production avatar editors share `BotttsAvatarEditor`. The pinned
Bottts Neutral definition supports 14 eye variants, 9 mouth variants,
8 textures, background color, and the common border-radius option. It has
no head, antennas, or side units. The app exposes square, rounded, and circle
shapes, palette/custom colors, and automatic or explicit faces/textures.

Unset options keep the original bot-ID-seeded SVG byte-for-byte. Reset clears
only these overrides and selects Bottts; a saved custom image, its crop framing,
and legacy mascot settings are retained. Uploading or generating an image does
not discard the saved Bottts options. The optional appearance field uses the
existing profile API and save queue, including defaults, copies, backups, and
package export/import. A late image generation cannot overwrite a newer face
choice from another client.

## Focused checks

```sh
pnpm exec vitest run src/lib/bottts-avatar.test.ts src/components/BotttsAvatarEditor.dom.test.ts src/components/Avatar.test.ts src/components/BotProfileAvatarCard.test.ts src/components/BotSettingsDialog.simple.test.ts src/components/bot-panel/PanelShell.dom.test.ts src/state/bot-profile-copy.test.ts server/bottts-avatar-persistence.test.ts server/avatar-image.test.ts
pnpm lint
pnpm typecheck
pnpm i18n:check
pnpm check:electron
```

## Real browser check

```sh
OMB_UI_E2E=1 pnpm exec vitest run scripts/testing/bottts-avatar-ui.e2e.test.ts
```

This uses the existing `control-omb ui` launcher with a disposable fake-engine
workspace. It drives the real App, both production avatar editors, profile
persistence, and the real attachment upload handler in pinned Chromium. It
checks German labels, face/color/shape/texture changes, Escape/reopen, actual
reload, reset to the original face, and preservation of a custom image and its
zoom/focus in both editors. A second bot keeps its original face and color;
the check measures small sidebar and large profile avatars. Synthetic quadrant
PNGs go through each editor's real upload handler, and the real zoom slider
saves the framing before reset. The advanced image-crop selector is scoped to
its four-button group because the Bottts shape also offers a circle; the global
ambiguity guard stays enabled. Screenshots and `bottts-avatar-checks.json` are written to
`.omb-scratch/verify-evidence/` and uploaded by the renderer CI job.

Passing ordinary Vitest tests or the generic renderer smoke is not evidence
that this specific browser check ran. Record the exact commit and named test
result, inspect its screenshots, and disclose if it was skipped or blocked.
This browser fixture does not establish native Windows installer behavior,
paid image-provider access, or the user's live profile. A Windows package check
is a separate step; this change does not publish or deploy a release.

## Integrated verification, 2026-10-22

Integrated `main` at `73fa5309e`, including the actual merges of PRs #12 and
#13. The conflict resolutions preserve both Bottts options and the German
identity/crop labels. No bot color defaults, stored faces, custom images,
permissions or agent runtime behavior were changed.

The dedicated browser check passed on Linux, Node 24.19.0, pnpm 10.33.0,
agent-browser 0.37.0 and Chromium 154.0.8037.57 with the sandbox enabled.
Both real editors cover options, save/reload, Escape/reopen, PNG uploads,
retained crop at 150% and 180%, reset, multiple bots, and small/large sizes.
The complete German browser check also passed all seven phases. Its New bot
readiness selector targets the outer draft fieldset because the avatar controls
now contain nested fieldsets; strict matching and all mutation/branding guards
remain enabled.

A separate actual Electron development app ran on Linux/Xvfb, using the real
main process, preload and production React entry. The German welcome screen
and skip path, bot creation through the real dialog, sending a message to the
repository fake provider, and Settings were exercised. Both avatar editors
saved face choices and a real quadrant PNG with a 160% crop. The app was closed
through its native window, the server was stopped, and both were launched anew
from the same disposable profile/workspace. New PIDs, unchanged bot/color,
transcript, onboarding state, German language, face options, upload and crop
were verified. A synthetic legacy MausBot marker in that temporary home stayed
unchanged. No existing user's app, data or credentials were used.

The [restart receipt](evidence/spdbot-integration/restart-receipt.json) records
both process pairs and actual `sandbox: true`, `contextIsolation: true`,
`nodeIntegration: false`; no `--no-sandbox` flag was used. Screenshots were
opened and inspected:

- [Actual German Electron welcome](evidence/spdbot-integration/onboarding-electron.png)
- [Simple editor](evidence/spdbot-integration/avatar-simple-electron-de.png)
- [Custom image and crop](evidence/spdbot-integration/avatar-crop-electron-de.png)
- [Advanced editor](evidence/spdbot-integration/avatar-advanced-electron-de.png)
- [After actual app and server restart](evidence/spdbot-integration/after-real-restart-electron-de.png)
- [German Settings](evidence/spdbot-integration/settings-electron-de.png)

### CLI and Windows fixture findings

The [offline access finding](https://github.com/thisistoni/spdbot/pull/12#discussion_r4352753343)
was reproduced through `main()` without a listener: discovery returned 1 before
`runAccess` could edit the local file. Only `access` is removed from live
discovery; `pair`, `sessions` and `status` retain product checks. The regression
covers add/list/remove through `main`, forbids network calls and preserves
unrelated config. All three also passed through the actual `server/spdbot.ts`
process entry with a disposable workspace and no listener.

The [Windows failure on integrated main](https://github.com/thisistoni/spdbot/actions/runs/39840892693/job/120042651431)
was reproduced locally at the same `makeBot` assertion: Stop acknowledges the
interrupt before the fake provider exits, so the next test's section change
correctly gets 409 while a bot is busy. The provenance test now holds its reader
and delays its shutdown by 750 ms, reproducing slow Windows termination on
Linux. Before the fix the next test fails 409/200; after explicitly asserting
fleet idle following Stop, the complete file passes. Assertions, limits,
timeouts and production security/agent code remain unchanged.

The older [Comms ECONNRESET](https://github.com/thisistoni/spdbot/actions/runs/39642993698/job/119373223502)
is not claimed to have the same cause. The previous PR Windows run passed
`server/comms.test.ts`; its failures were in another lending fixture. All 32
Comms cases also passed locally after this integration. The process/socket
failure diagnostics remain in place; no retry or speculative runtime fix was
introduced.

### Practical limits

This proves the real Electron **development app** and separately controlled
server under Linux/Xvfb, not a native Windows/macOS installation. Browser
reload is reported separately from the actual app/server restart. Native
Windows install/uninstall/display, OS integration and real provider sign-in
remain practical checks. No release, publishing, deployment or real credentials
were used; Windows packages, if built, must use build-only/`--publish never`.
