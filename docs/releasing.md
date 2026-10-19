# Releasing SPDBot

Ordinary PRs and merges never create a release or deployment. Run **Actions →
Prepare next release** to open a version-bump PR, then deliberately run
**Actions → Release** on the intended, tested commit to assemble a draft.
Leave **publish** unticked unless publication was explicitly requested.
No release, tag, signing credential, or account change is part of the installer
configuration update.

## Owned downloads and update feed

Desktop downloads and `app-update.yml` target only the public
[SPDBot releases](https://github.com/thisistoni/spdbot/releases) in
`thisistoni/spdbot`. Clients need no GitHub token. Keep that destination public;
a private repository cannot serve this unauthenticated updater.

Download names start with `SPDBot-`, including the versioned DMG, ZIP, NSIS,
DEB and AppImage files. Stable aliases are `SPDBot.dmg` (Apple silicon),
`SPDBot-intel.dmg`, `SPDBot-setup.exe`, `SPDBot-amd64.deb`, and
`SPDBot.AppImage`. All updater manifests and blockmaps accompany their artifacts.

There is no mirror to an upstream repository and no `RELEASES_PAT` requirement.
The release workflow uses its scoped `GITHUB_TOKEN` only for this repository.
Publishing a reviewed draft in GitHub's UI has no upstream mirror or docs-hook
side effect. Desktop publication no longer dispatches npm or Docker publishing;
those workflows are separate and are not a SPDBot desktop release requirement.
The inherited npm publishing jobs are restricted to their upstream repository;
they cannot publish the upstream package from this fork. Creating an owned
SPDBot npm distribution is a separate task.

An existing upstream installation still reads its baked-in upstream feed. This
change does not migrate those installations or publish a bridge for them. The
SPDBot feed becomes active only in a build packaged with this configuration.
Until SPDBot has a published release, there is no real update to download; do
not describe an unavailable feed as a successful end-to-end update test.

## Compatibility and remaining branding

Safe display labels include the Windows installer/uninstaller captions,
Windows shortcut and Apps & Features entry, Linux launcher, macOS permission
text and download names. The NSIS `customHeader` sets `Name` and `BrandingText`
after the standard template; it does not rename installed files. We preserve
`package.json`'s `openmausbot` name, `productName: OpenMausBot`,
`com.openmausbot.app`, the executable and install directories, the speech-helper
bundle identity, `openmausbot://` links, `OMB_*` variables and existing data paths.
These names participate in OS integration, saved credentials and helper lookup;
renaming them is not a cosmetic search-and-replace.

Consequently the `.app`/executable names, some secondary native dialogs and file
properties, speech-helper prompts and current icon assets can still show the
inherited branding. They need a separately tested follow-up, not an invented replacement
icon or an untested credential migration. The required LICENSE, NOTICE and
third-party credits remain unchanged.

`OMB_NSIS_TEST=1 pnpm exec vitest run scripts/installer-config.test.mjs` compiles
small installer/uninstaller fixtures with electron-builder's pinned NSIS, checks
English/German captions and unchanged file names, and retains warnings-as-errors.
The Windows packaging workflow runs this too. These compiler checks do not
replace installing and viewing the actual packaged app on Windows.

Desktop packaging excludes the separately licensed `dist-server/enterprise/`
layer using the existing resource filter. It distributes the permitted core
edition without changing core runtime behavior or licensing checks.

## Verification retained

The manual release builds macOS arm64 + x64, Windows x64 and Ubuntu x64 from one
pinned commit. Existing checks still cover:

- Passing CI for the exact release tree, including the release-CI recovery lane.
- Complete native resources, packaged-server startup and helper/module paths.
- macOS signature verification before notarization, stapling, regenerated
  blockmaps and hashes after the final bytes change.
- Windows updater configuration without a fictitious signing publisher.
- Linux package metadata, sandbox resources, installation/upgrade and launch.
- A complete artifact set, feed file names, sizes and hashes, and uploaded asset
  digests before optional publication.

The workflow refuses to replace an already published version. A new release
requires a version bump; ordinary merging alone does not publish it.
`ship_without_ci` remains the existing explicit emergency override, not a normal
release path. See [browser packaging](browser-packaging.md) for native resource
provenance and [verification](verification/README.md) for runtime recipes.

The artifact-only **Package Windows** and **Package Ubuntu** workflows do not
publish a release. The optional real-feed Linux update smoke needs an existing
published SPDBot release, unlike the ordinary package/launch checks.

## Signing setup before an actual release

The SPDBot repository needs its own authorized Developer ID certificate and
notarization account. No upstream credentials or signing identity are assumed.
The existing secret names are:

- `MAC_CERT_P12_BASE64` and `MAC_CERT_PASSWORD`: the authorized Developer ID
  Application certificate export and its password.
- `APPLE_API_KEY_P8_BASE64`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER_ID`: the
  authorized App Store Connect notarization key and its identifiers.

Configuring those credentials is a separate, explicit action. This change does
not create or copy secrets. Windows remains unsigned; do not set `publisherName`
until installers are genuinely signed, because it would reject updates.

For a local fallback, use the existing `package:mac`, `package:win` or
`package:linux` commands, then perform the same native verification as the
workflow. A macOS package must be signed, notarized, stapled and re-zipped before
regenerating its blockmaps and feed. Upload the complete verified desktop asset
set only to `thisistoni/spdbot` after a concrete publication request.

Cloudflare deployment remains separate: a deliberate **Actions → CI** run on
`main` with **deploy_composio_broker** selected, after the existing CI gate and
control-plane checks. PRs, merges and release-CI recovery do not deploy it.
