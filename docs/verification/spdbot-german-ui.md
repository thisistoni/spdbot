# SPDBot German interface verification

This pass follows user-reachable surfaces, not the percentage of translated
catalog entries. Explicit saved language choices remain supported. A fresh
renderer defaults to German before pairing/connection UI renders; app-owned
native startup, tray and menu copy is German as well.

## Reviewed surfaces

- Native startup and failure screens, application/tray/context menus and dialogs.
- Sidebar, workspace switcher, chat and group menus, search, keyboard help,
  attachments, code/diagram actions, citations, exports and confirmation dialogs.
- Simple/advanced Settings navigation, appearance, provider/model selection,
  API keys, computer/browser controls, login settings, usage and local backups.
- New bot tabs and presets; bot identity/instructions, permissions, tools,
  skills, memory, history, prompt preview and model settings.
- Routine/automation calendar, schedules, advanced cron descriptions, run cards,
  limits and trigger actions. Scheduling and permission behavior is unchanged.
- Team/map/library import views, browser and remote-computer controls, local VM,
  pairing/browser sign-in and first-use tour/import views.

Unsupported upstream cloud/organization/mobile offers are removed by the
companion Settings patch, not marketed as SPDBot services. Avatar controls and
native application/data identity are covered by their separate patches.

## Evidence and limits

`check-spd-german.mjs` records screenshots and visible text from the actual
renderer with a disposable fake-engine workspace. Its Windows desktop bridge is
synthetic, Chromium runs on Linux, and the startup HTML screenshot is not a
native Electron/package run. Run `node scripts/testing/run-spd-german-ci.mjs`
with `OMB_VERIFY_PLAYWRIGHT` and `OMB_VERIFY_BROWSER_CHROME` pointing to the installed test client and browser.
`OMB_SPD_EVIDENCE` selects the screenshot and text-inventory directory. The
`spd-german` job is included in the CI gate; a failed or unexpectedly skipped
German browser check cannot satisfy that gate.

Component tests cover German dialogs, browser/approval states, pairing,
markdown language changes, scheduling summaries and preservation of original
content. Native Node tests cover startup/menu behavior. `i18n:check` verifies
placeholder/source-hash consistency; catalog coverage alone is not visual proof.

Provider/model names, user content, exact technical paths/commands, raw external
errors and prompt contents remain verbatim. Native standard OS menu roles follow
the operating system language. Voice approval recognition still accepts the
existing `yes`/`no` commands; German prompts explicitly say those commands rather
than claiming German recognition. No permission or speech-recognition logic was
changed. Required license notices and third-party credits are preserved.
