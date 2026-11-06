# Desktop branding and tour polish

Checked on Windows on 2026-11-06, from `spd-launch-desktop-polish` based on
`4447f75d9`, with Node 24.19.0, pnpm 10.33.0 and Electron 43.7.9.
Related scope: [SPD-5](https://linear.app/devtones/issue/SPD-5),
[SPD-10](https://linear.app/devtones/issue/SPD-10),
[SPD-15](https://linear.app/devtones/issue/SPD-15) and
[SPD-19](https://linear.app/devtones/issue/SPD-19).

## Changes

- The core brand uses the existing SPD-Studio favicon mark. The renderer and
  server share that default; custom deployment brands retain their existing
  entitlement checks and logo behavior.
- `public/app-icon.svg` is the vector source. `node scripts/generate-spd-icons.mjs`
  derives the web/PWA icons, Electron window/startup/tray PNG, Windows ICO and
  macOS ICNS/iconset. The macOS tile retains the 824px grid inside a 1024px canvas.
- Welcome and tour surfaces use the mark. The bot step uses the shared Bottts
  renderer and preserves custom images, crop and zoom.
- The tour action row wraps whole actions and keeps progress together. With the
  real German labels, the previous 320px card wrapped both the step count and
  skip label. [Before](evidence/desktop-polish/tour-before-de.png) and
  [after](evidence/desktop-polish/tour-after-de.png).
- 65 missing German entries cover active dynamic labels in appearance,
  model effort, connected-app categories/descriptions and the team catalog.
  Source hashes and placeholders are checked. German has 6323/6919 entries;
  dormant legacy keys and disabled upstream offers were not filled in.

## Reproduce

```powershell
corepack pnpm install --frozen-lockfile
node scripts/generate-spd-icons.mjs --check
node scripts/verify-desktop-polish.mjs
node scripts/verify-startup-tray.mjs
```

The polish smoke mounts real renderer components in native Electron with a
temporary profile and synthetic attachment. Requests stay on the fixture's
loopback origin. No real workspace, provider login or user preferences are used.
`--show-fixture` leaves the finished window open for inspection; close that
window to finish. Evidence is printed under a unique temporary directory.

The smoke passed 18 combinations: German/English, 1100/840/390px window content
widths, and 100/150/200% zoom. 840px is the production main window minimum;
390px is an additional narrow-layout stress check. It checks containment,
non-overlapping actions, progress, initial focus, Tab, Enter and Escape. It also
checks small/large stable Bottts avatars, a saved custom image and framing after
a welcome color edit, Windows ICO/PNG decoding, and German appearance options.
See the [receipt](evidence/desktop-polish/receipt.json),
[custom bot](evidence/desktop-polish/welcome-custom-bot-de.png) and
[native window capture](evidence/desktop-polish/native-window.png).

The separate native startup/tray smoke passed, including restore and Quit.
Targeted Vitest: 178 tests in 13 files passed. Targeted Node tests: 14 passed.
`lint`, `typecheck`, `i18n:check`, `check:electron` (205 modules), `build`,
`build:server`, icon regeneration check and `git diff --check` passed.
Build warnings remain for CSS `::highlight` optimization and large chunks.

## Limits and release checks

This is a native Windows Electron component/startup smoke, not an installed
SPDBot package or full provider-authentication test. The full suite was not run.
The real owner app/profile was not installed over or reset.

The macOS configuration still targets DMG/ZIP for arm64/x64. The ICNS header,
chunk lengths and embedded PNG sizes (32 through 1024px) were inspected, and
the package resource filter still excludes `enterprise/`. Native macOS rendering,
Dock/Finder icons, packaging, signing and notarization need a Mac. Windows
installer/upgrade behavior and final package icon inspection remain release
checks. No version bump, release, deployment or publishing was performed.
