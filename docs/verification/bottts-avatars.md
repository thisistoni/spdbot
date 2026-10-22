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

## Independent verification, 2026-10-22

The expanded browser check passed on Linux, Node 24.19.0, pnpm 10.33.0,
agent-browser 0.37.0 and system Chromium 154.0.8037.57. Browser sandbox flags
were unchanged. Its eight screenshots cover both editors, shape/texture
controls, and retained uploaded crops at 150% and 180%; inspect the files from
the corresponding run, rather than relying on an older screenshot set.

The Windows failure in [CI run 39642993698](https://github.com/thisistoni/spdbot/actions/runs/39642993698/job/119373223502)
is still an open investigation. On its exact head `cfcb7278`, the focused
delegated-step-cap test and all 32 tests in `server/comms.test.ts` passed on
Linux. That test file is byte-identical to `main` at `0c76806f`; this comparison
does not prove a Windows fix. The historical log shows `ECONNRESET` while
polling `/api/bots`, and subsequent tests use the same server successfully.
The fixture starts one child in `beforeAll` and stops it in `afterAll`.

The fixture now drains and retains a bounded stdout tail, records process
exit/signal and socket reuse, and diagnoses transport failures with a separate,
unpooled health connection. It still fails the original request immediately;
there is no retry of that operation, no changed step cap or assertion, and no
agent-runtime change. The extra diagnostics are not a demonstrated remedy for
the historical reset. Native Windows reproduction and the macOS smoke result
must be checked at the published head.

Final product identity, full German interface and an actual app restart still
require integration after PRs #12 and #13 merge. Browser reload alone proves
only profile persistence; it does not establish a desktop restart or provider
sign-in. Keep those checks separate and use disposable data.
