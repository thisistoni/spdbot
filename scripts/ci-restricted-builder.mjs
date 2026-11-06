import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { PURCHASE_AUTHORITY } from "../electron/purchase-authority.mjs";
import afterPack from "./after-pack.mjs";
import { restricted, restrictedMarker } from "./linux-package-identity.mjs";
import { selectQualification } from "./select-linux-qualification.mjs";

export const root = fileURLToPath(new URL("../", import.meta.url));
const inputs = ".omb-scratch/ci-restricted-inputs";
const base = parse(readFileSync(path.join(root, "electron-builder.yml"), "utf8"));
const builderRequire = createRequire(import.meta.resolve("electron-builder"));
const { extractFile, listPackage } = createRequire(builderRequire.resolve("app-builder-lib"))("@electron/asar");

// Derive the fixture's install policy from the real hooks. Only package-owned
// names/paths change; permission repairs, sandbox and AppArmor checks stay intact.
export function restrictedInstallInput(file) {
  return readFileSync(path.join(root, "build", file), "utf8")
    .replaceAll("SPDBot", restricted.product).replaceAll("spdbot", restricted.name);
}
export async function prepareRestrictedInputs() {
  await mkdir(path.join(root, inputs), { recursive: true });
  for (const file of ["linux-after-install.sh", "linux-after-remove.sh", "linux-spdbot-browser.apparmor"]) {
    await writeFile(path.join(root, inputs, file), restrictedInstallInput(file));
  }
}

export function assertRestrictedContext(context) {
  assert.equal(selectQualification(PURCHASE_AUTHORITY), "restricted", "CI fixture requires empty production pins");
  assert.equal(context.electronPlatformName, "linux");
  assert.equal(context.arch, 1, "CI fixture is Linux x64 only");
  const { packager } = context;
  assert.equal(packager.info.options.publish, "never", "CI fixture cannot publish");
  assert.ok(!packager.info.options.prepackaged, "CI fixture must build actual runtime resources");
  const config = packager.config;
  for (const key of ["appId", "productName", "artifactName", "publish", "asar", "files", "extraMetadata", "extraResources", "protocols", "deb", "linux", "directories"]) {
    assert.deepEqual(config[key], fixture[key], `CI fixture configuration changed: ${key}`);
  }
  assert.equal(config.afterPack, afterPackRestricted);
  assert.equal(config.beforePack, beforePackRestricted);
  assert.equal(path.resolve(packager.info.projectDir), path.resolve(root));
  assert.equal(packager.appInfo.name, restricted.name);
  assert.equal(packager.appInfo.sanitizedProductName, restricted.product);
}

export async function beforePackRestricted(context) {
  assertRestrictedContext(context);
  for (const file of ["linux-after-install.sh", "linux-after-remove.sh", "linux-spdbot-browser.apparmor"]) {
    assert.equal(await readFile(path.join(root, inputs, file), "utf8"), restrictedInstallInput(file));
  }
}

export function assertRestrictedResources(resources) {
  const archive = path.join(resources, "app.asar");
  const metadata = JSON.parse(extractFile(archive, "package.json").toString());
  assert.equal(metadata.name, restricted.name);
  assert.equal(metadata.desktopName, `${restricted.appId}.desktop`);
  for (const file of ["main.mjs", "purchase-authority.mjs", "purchase-client.mjs", "purchase-desktop.mjs", "purchase-verifier.mjs"]) {
    assert.deepEqual(extractFile(archive, `electron/${file}`), readFileSync(path.join(root, "electron", file)), `CI changed runtime ${file}`);
  }
  for (const file of listPackage(archive)) assert.doesNotMatch(file, /(?:[\\/]testing[\\/]|\.test\.|\.node-test\.)/);
  for (const file of ["ui/index.html", "server/index.js", "server/desktop-entry.mjs", "companion/index.js", "licenses/jose-LICENSE.md", "licenses/OpenMausBot-LICENSE.txt", "licenses/OpenMausBot-NOTICE.txt"]) {
    assert.ok(existsSync(path.join(resources, file)), `Missing actual package resource: ${file}`);
  }
  for (const resource of base.extraResources) {
    assert.ok(existsSync(path.join(resources, resource.to)), `Missing required resource: ${resource.to}`);
  }
  assert.equal(existsSync(path.join(resources, "server/enterprise")), false);
  assert.equal(existsSync(path.join(resources, "app-update.yml")), false, "CI fixture must have no update feed");
}

async function afterPackRestricted(context) {
  assertRestrictedContext(context);
  // Keep the real required-resource validation, including pinned browser, CUA,
  // connector and DuckDB trees. Never pass a partial/unit-test packager context.
  await afterPack(context);
  const resources = context.packager.getResourcesDir(context.appOutDir);
  assertRestrictedResources(resources);
  await writeFile(path.join(resources, "CI-RESTRICTED-NOT-FOR-DISTRIBUTION"), restrictedMarker);
}

const fixture = {
  ...base,
  files: [{ filter: base.files }],
  appId: restricted.appId,
  productName: restricted.product,
  artifactName: "SPDBot-CI-RESTRICTED-NOT-FOR-DISTRIBUTION-${version}-${arch}.${ext}",
  extraMetadata: { name: restricted.name, desktopName: `${restricted.appId}.desktop` },
  directories: { ...base.directories, output: restricted.output },
  publish: null,
  protocols: [{ name: restricted.product, schemes: [restricted.name] }],
  beforePack: beforePackRestricted,
  afterPack: afterPackRestricted,
  linux: {
    ...base.linux, executableName: restricted.name,
    synopsis: "SPDBot restricted CI fixture - not for distribution",
    description: "Nonpublishable package qualification fixture with execution locked.",
    desktop: { entry: { ...base.linux.desktop.entry, Name: restricted.product, Comment: "Restricted CI fixture" } },
    extraResources: base.linux.extraResources.map(resource => resource.from === "build/linux-spdbot-browser.apparmor"
      ? { from: `${inputs}/linux-spdbot-browser.apparmor`, to: `${restricted.name}-browser.apparmor` } : resource),
  },
  deb: { ...base.deb, afterInstall: `${inputs}/linux-after-install.sh`, afterRemove: `${inputs}/linux-after-remove.sh` },
};
// electron-builder normalizes and merges configuration in place. Return a fresh
// tree so one invocation/override cannot mutate a later invocation's boundary.
export default function restrictedBuilderConfig() {
  const { beforePack, afterPack, ...data } = fixture;
  return { ...structuredClone(data), beforePack, afterPack };
}
