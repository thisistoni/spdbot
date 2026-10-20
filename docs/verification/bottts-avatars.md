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
zoom/focus. Screenshots and `bottts-avatar-checks.json` are written to
`.omb-scratch/verify-evidence/` and uploaded by the renderer CI job.

Passing ordinary Vitest tests or the generic renderer smoke is not evidence
that this specific browser check ran. Record the exact commit and named test
result, inspect its screenshots, and disclose if it was skipped or blocked.
This browser fixture does not establish native Windows installer behavior,
paid image-provider access, or the user's live profile. A Windows package check
is a separate step; this change does not publish or deploy a release.
