# Native macOS launch validation

Validated on Antonio's connected MacBook on 2026-11-06 by the delegated Sol/xhigh tasks. These results cover merged polish commit `f9f35402ac5d65799534578120d2ba63950dc11c`, **not** the later purchase-access changes or PR #16 backports.

The first native pass on macOS 26.2 arm64/Electron 43.7.9 passed **179 tests and 18 DE/EN tour cases**, with 17 screenshots visually inspected. The follow-up used task-local Node 24.22.2 and pnpm 10.33.0 and ran the complete package preparation pipeline. A task-local 4096 MiB Node heap resolved its initial build OOM.

The full arm64 `.app` was built with `identity:null`, automatic certificate discovery disabled, `notarize:false`, directory target and `--publish never`, then locally ad hoc signed. Deep strict codesign verification passed, with no TeamIdentifier. All required resources were retained: 212 ASAR entries, no ASAR node_modules or enterprise server, native arm64 dependencies and the expected universal Speech helper. The actual package started outside the repository into a visible 1100×780 German SPDBot onboarding window; its own server returned HTTP 200. The packaged server smoke, DuckDB query and resvg PNG generation passed.

The app run used separate userData/data/HOME, Mock-Keychain and an outer sandbox denying personal files, external network and CUA permission requests. It required `--no-sandbox` inside that outer sandbox. Therefore normal Chromium renderer-sandbox behavior, Finder/Dock integration, installation/upgrade, release signing and notarization remain unverified. Cocoa still resolved some home/log paths to the denied OS home.

## Permission smoke limitation

The synthetic microphone smoke remains **failed**, with three positive audio-stream cases unresolved. The real app permission handler returns true; Chromium opens its fake audio input and reports stream startup, but the JavaScript promise remains pending. The same control case without SPDBot handlers hangs under Electron 43.7.9 and 43.7.10. This does not establish a specific upstream regression or justify changing app permission policy.

The separate negative native pass, including foreign audio, failed restore, camera/cloud-screen refusal and one-use display intent, passed. OS permissions were unchanged: microphone/camera not-determined, screen denied. The delegate passed 31 permission tests, 205 Electron syntax checks and source lint excluding generated outputs. Unfiltered lint includes the generated bundle and fails there.

The sole source patch adds a 10-second bounded per-capture failure with Electron/Chromium/URL diagnostics in `scripts/smoke-app-permissions.mjs`; Root integrated it and passed the unchanged positive and negative smoke on Windows Electron 43.7.9. This does not turn the macOS audio result green.

## Evidence locations

All paths below are on the connected Mac, not the Windows checkout:

- `/Users/antoniobeslic/CodexWorkspace/SPDBot_Desktop/outputs/macos-validation-2026-11-06/report.md`
- `/Users/antoniobeslic/CodexWorkspace/SPDBot_Desktop/outputs/macos-package-followup-2026-11-06/report.md`
- Same follow-up folder: `root-handoff.zip`, `SHA256SUMS`, `smoke-app-permissions.patch`, and `native/20c-packaged-onboarding.png`.
- Bundle: same folder, `package/mac-arm64/SPDBot.app`.

The follow-up preserved all 125 earlier evidence files, stopped its processes and removed temporary profiles. It performed no Git writes, installation or publication. Remote task: <t3-thread://v2/c7c98e2a-dd58-4516-89fc-9f3ea2147ea1/mcp:launch:1ff63f13cad7ddc60fece49be9e41244614cd503bd08092c82ff44503889997f>.
