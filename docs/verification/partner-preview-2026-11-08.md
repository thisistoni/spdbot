# Partner purchase preview

The owner requested a link for a partner to register, pay in Stripe test mode, download and set up SPDBot. The partner has Windows and an Apple-Silicon Mac. This recipe currently builds and qualifies Windows x64. The owned GitHub repository has no macOS signing/notarization secrets configured; no unsigned Mac download is advertised.

`node scripts/package-preview.mjs` copies tracked source into an isolated build directory, pins the real **public** preview authority from `build/preview-authority.json`, then builds the UI/server/companion and NSIS installer. Prepare native resources first with the existing Android, cloudflared, browser, DuckDB and Windows CUA scripts. No private key, synthetic authority or authentication bypass enters the package. The ordinary checkout's production authority stays empty and its distribution guard remains closed.

The build uses app ID `de.spdlabs.spdbot.preview`, product **SPDBot Preview**, package `spdbot-preview`, its own application-data profile, default workspace `~/.spdbot-preview` and `spdbot-preview://auth/callback`. The normal SPDBot profile and protocol are separate. Preview builds do not check the stable updater feed. The website must return the corresponding preview callback protocol; production keeps `spdbot://auth/callback`.

Run `node scripts/check-preview-package.mjs` against the built output. It checks the actual ASAR authority and metadata, public pins in the bundled server, test-file exclusions and installer header, then writes a SHA-256/size/version catalog. The private preview download mount serves that catalog and file only after server-side identity and purchase verification.

Verified locally: 112 purchase/identity tests, four preview boundary tests, TypeScript, scoped Oxlint, actual NSIS build and successful per-user installation. Artifact inspection confirms the real preview pins. The first installer is **unsigned**, matching the current Windows signing configuration; the account page discloses the possible Windows publisher warning. Native browser authorization, paid download and setup evidence are recorded after the live test, separately from these build checks.

Tracking: [SPD-28](https://linear.app/devtones/issue/SPD-28). This work does not activate production keys, production commerce or a normal public release.
