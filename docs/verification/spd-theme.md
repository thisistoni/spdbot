# SPD theme

SPD is the first choice in Settings → Appearance → Skin and the default when
there is no valid saved theme, on both fresh and prior installations. Every
valid saved theme still takes precedence; all previous themes remain available
in their relative order. Storage keys and explicit font, chat width, interface
mode and message-color preferences are unchanged. The native desktop window
also starts with SPD's background until the renderer synchronizes its selection.

## Design source

Inspected [SPD-Studio at fd7ddaba](https://github.com/thisistoni/SPD-Studio/tree/fd7ddaba5e5853757298ccdf6d7ba2dbc21b2e60),
including `AGENTS.md`, `DESIGN.md`, the local design skill, `app/globals.css`,
the dashboard, cards, buttons, permission controls and bundled Outfit font.
The reference's Taste skill explicitly excludes app screens; no landing-page
layout or motion was transferred into this application.

| Reference | SPD app token |
| --- | --- |
| Background `#08070e` | App background |
| Card `#13101e`, popover `#171122` | Cards, menus and composer |
| Primary `#d5adff`, foreground `#1a0a2d` | Accent fill and its label |
| Text `#f4f0fa`, secondary `#b6a9c8`, muted `#a396b5` | Three text levels |
| Secondary `#21162f`, text `#e9dcf7` | Neutral user bubbles |
| Border `#352943` | Composer ring; hairlines lifted to `#372b45` for the existing 1.5:1 gate |
| Outfit, weights 100–900 | Locally bundled theme font, with license and attribution |
| 12px dashboard cells, 20px panel token | Existing `--radius-lg` / `--radius-xl` |

The app's semantic status and bot identity colors remain distinct. The existing
“Color my messages” option can still override the neutral user-bubble color.
The font override remains independent of the theme. No external font request
is needed; the production build contains the identical Outfit asset and license.

## Reproduce

Use Node 24+ and pnpm 10.33.0. Start the repository's isolated fake-engine
fixture (uses the [verify-omb skill](../../.claude/skills/verify-omb/SKILL.md)):

```sh
node --experimental-strip-types scripts/verify-spd-theme.ts
```

Use the exact `previewUrl` printed by that process:

```sh
OMB_VERIFY_PLAYWRIGHT=/absolute/path/to/playwright/index.mjs \
OMB_VERIFY_BROWSER_CHROME=/absolute/path/to/chromium \
OMB_SPD_EVIDENCE=/tmp/omb-spd-theme-evidence \
node scripts/testing/check-spd-theme.mjs http://127.0.0.1:PORT/__spd-theme.html
```

The runner refuses other hosts/routes. It opens a disposable browser profile,
disables analytics and runs the real `src/main.tsx` startup, settings and chat.
The server has synthetic messages, a temporary home and only the fake engine.
Interrupt the launcher with Ctrl-C afterwards to remove its fixture data.

## Checks and evidence — 2026-10-19

- 99 targeted tests across skins, defaults/persistence, fonts, desktop mapping,
  desktop capabilities, Appearance and Simple settings passed:
  `pnpm exec vitest run src/lib/skins.test.ts src/lib/skins.default.test.ts src/lib/fonts.test.ts electron/skin-overlay.test.mjs src/components/SettingsModal.appearance.test.ts src/components/SettingsModal.simple.test.ts src/lib/desktop.test.ts`.
- `pnpm check:contrast`: all 52 SPD pairs passed. Existing Midnight exceptions
  remain at their previous baseline; no other theme's palette changed.
- `pnpm lint`, `pnpm typecheck`, `pnpm i18n:check`, `pnpm check:electron`
  (203 modules), `pnpm exec vite build`, and `git diff --check` passed.
- Browser checks and images: [evidence](evidence/spd-theme/README.md).

The environment's cached dependencies initially lacked the two DiceBear
packages already merged into main. `pnpm install --frozen-lockfile` installed
them without a lockfile change. Electron's automatic download failed; the
official 43.7.9 Linux archive was downloaded and verified against the installed
package's SHA-256 manifest, then used through `ELECTRON_OVERRIDE_DIST_PATH` for
the syntax check. Build output retains pre-existing CSS `::highlight` optimizer
warnings and the large-chunk warning.

## Limits

Windows caption rendering, hover colors, maximize/restore labels and bridge
calls were exercised in Chromium with a Windows capability stub. The native
window background mapping is covered by unit tests. This is not a packaged
Windows execution, native OS window-action test or native titlebar screenshot.
The screenshot filenames that mention Windows refer to this renderer fixture.

The full cross-platform suite and desktop packaging were not run locally.
German is selected and the new description is translated; existing incomplete
German translations elsewhere remain unchanged. No release, deployment or
merge is part of this change.

## CI follow-up — 2026-10-19

The first CI run exposed a hardcoded count of nine skins in
`src/lib/glass-surface.test.ts`. The test now compares the sorted CSS skin IDs
against `SKIN_IDS`, retaining duplicate detection and the existing required-token
and shared-glass-rule assertions. Five temporary mutations confirmed that a
missing skin, an unknown or duplicate ID at the same count, a missing menu token
and a glass rule inside a skin are all rejected. The stylesheet was restored
byte-for-byte after those probes.

Running every test that reads `src/styles.css` also caught the SPD purple bot
identity token copied from Dusk. It now matches `toneForSurface` for SPD's
background: `#8963cc`, with 4.51:1 name contrast (6.16:1 highlight, 3.27:1 shadow).
The existing identity assertions were retained unchanged.

All 512 tests across the 21 CSS, skin, persistence, desktop mapping and settings
test files passed, as did the contrast gate. Reproduce that expanded selection:

```sh
mapfile -t spd_css_tests < <(rg -l 'styles\.css' src --glob '*.test.ts')
pnpm exec vitest run "${spd_css_tests[@]}" src/lib/skins.default.test.ts \
  electron/skin-overlay.test.mjs src/components/SettingsModal.appearance.test.ts \
  src/components/SettingsModal.simple.test.ts
pnpm check:contrast
```

## SPD default and picker order — 2026-10-19

SPD now starts first in the picker and is used whenever the saved theme is
missing, invalid or unreadable. The prior-install fallback was removed; a valid
saved choice, including Meadow or Midnight, is still restored unchanged.
Simple/Advanced mode, custom fonts and other preferences keep their existing
behavior. The main desktop window starts with the same SPD background before
the renderer reports the selected theme.

- 217 targeted tests passed across defaults/persistence, skin registration,
  interface mode, glass surfaces, identity colors, native skin mapping and
  Appearance/Simple settings. Coverage includes two launches with each of the
  ten saved themes, fresh and prior installations without a usable choice,
  blocked storage and the rendered picker order.
- 10 additional documentation and window-chrome tests passed.
- The browser fixture passed all 11 checks, including SPD's default and first
  position, a saved Meadow selection surviving reload, all ten theme switches,
  preserved font/preferences and the Windows renderer bridge. Seven screenshots
  were refreshed; desktop and mobile picker views were visually inspected.
- `pnpm check:electron` syntax-checked all 203 modules. Native Windows execution
  remains outside this environment; the renderer test uses a stubbed bridge.
- `pnpm lint`, `pnpm typecheck`, `pnpm i18n:check`, `pnpm exec vite build`
  and `git diff --check` passed. The build retains the existing `::highlight`
  and chunk-size warnings.
