import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve("electron-builder"));
const { validateConfiguration } = builderRequire("app-builder-lib/out/util/config/config.js");
const { AppInfo } = builderRequire("app-builder-lib/out/appInfo.js");
const { FileMatcher } = builderRequire("app-builder-lib/out/fileMatcher.js");
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const config = parse(read("electron-builder.yml"));
const release = parse(read(".github/workflows/release.yml"));
const packageJson = JSON.parse(read("package.json"));
const temporary = [];
const nsisTemplateDir = path.join(path.dirname(builderRequire.resolve("app-builder-lib/package.json")), "templates/nsis");
afterEach(() => temporary.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const workflowText = ["release", "prepare-release", "package-linux", "package-win"]
  .map((name) => read(`.github/workflows/${name}.yml`)).join("\n");

describe("SPDBot desktop distribution", () => {
  it("is valid configuration for the installed electron-builder", async () => {
    await validateConfiguration(config, { isEnabled: false });
  });

  it("targets only the owned public feed with independent package and runtime identities", () => {
    expect(config.publish).toEqual([{ provider: "github", owner: "thisistoni", repo: "spdbot" }]);
    expect(packageJson.name).toBe("spdbot");
    expect(config).toMatchObject({ appId: "de.spdlabs.spdbot", productName: "SPDBot" });
    expect(config.protocols[0].schemes).toEqual(["spdbot"]);
    expect(config.linux.executableName).toBe("spdbot");
    expect(packageJson.desktopName).toBe("de.spdlabs.spdbot.desktop");
    expect(new AppInfo({ metadata: packageJson, config }).updaterCacheDirName).toBe("spdbot-updater");
    expect(config.win.publisherName).toBeUndefined();
  });

  it("uses SPDBot download/display labels while retaining both mac architectures", () => {
    expect(config.artifactName).toBe("SPDBot-${version}-${arch}.${ext}");
    expect(config.dmg.artifactName).toBe("SPDBot-${version}-${arch}.dmg");
    expect(config.nsis.artifactName).toBe("SPDBot-${version}-setup.${ext}");
    expect(config.nsis.shortcutName).toBe("SPDBot");
    expect(config.linux.desktop.entry.Name).toBe("SPDBot");
    for (const target of config.mac.target) expect(target.arch).toEqual(["arm64", "x64"]);
    for (const description of Object.values(config.mac.extendInfo)) expect(description).toMatch(/^SPDBot /);
  });

  it("brands NSIS captions after the default name with independent installed files", () => {
    expect(config.nsis.include).toBe("build/installer.nsh");
    expect(config.nsis.uninstallDisplayName).toBe("SPDBot ${version}");
    const include = read(config.nsis.include);
    expect(include).toMatch(/!macro customHeader[\s\S]*Name "SPDBot" "SPDBot"[\s\S]*BrandingText "SPDBot \$\{VERSION\}"\s+!macroend/);
    expect(include).not.toMatch(/^\s*!(?:define|undef)\b/m);

    const template = readFileSync(path.join(nsisTemplateDir, "installer.nsi"), "utf8");
    const common = readFileSync(path.join(nsisTemplateDir, "common.nsh"), "utf8");
    expect(template.indexOf('!include "common.nsh"')).toBeLessThan(template.indexOf("!insertmacro customHeader"));
    expect(template.indexOf("!insertmacro addLangs")).toBeLessThan(template.indexOf("!insertmacro customHeader"));
    expect(common).toContain('Name "${PRODUCT_NAME}" "${DoubleAmpersand}"');
    expect(common).toContain('!define APP_EXECUTABLE_FILENAME "${PRODUCT_FILENAME}.exe"');
    expect(common).toContain('!define UNINSTALL_FILENAME "Uninstall ${PRODUCT_FILENAME}.exe"');
  });

  // Package Windows already downloads this pinned compiler. Opt in locally
  // rather than making ordinary unit tests download executable build tools.
  it.runIf(process.env.OMB_NSIS_TEST === "1").each([false, true])(
    "compiles localized SPDBot NSIS captions with warnings as errors (uninstaller: %s)",
    async (uninstaller) => {
      const { getMakeNsisPath } = builderRequire("app-builder-lib/out/toolsets/windows.js");
      const compiler = await getMakeNsisPath(config.toolsets?.nsis, config.nsis.customNsisBinary);
      const dir = mkdtempSync(path.join(tmpdir(), "spdbot-nsis-"));
      temporary.push(dir);
      const nsisPath = (value) => process.platform === "win32" ? value : value.replaceAll("\\", "/");
      const script = path.join(dir, "caption.nsi");
      const output = path.join(dir, "caption.exe");
      writeFileSync(script, `Unicode true
!define PRODUCT_NAME "${config.productName}"
!define PRODUCT_FILENAME "SPDBot"
!define VERSION "${packageJson.version}"
${uninstaller ? "!define BUILD_UNINSTALLER" : ""}
!include "${nsisPath(path.resolve(config.nsis.include))}"
!include "${nsisPath(path.join(nsisTemplateDir, "common.nsh"))}"
!include "MUI2.nsh"
!insertmacro MUI_PAGE_INSTFILES
${uninstaller ? "!insertmacro MUI_UNPAGE_INSTFILES" : ""}
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "German"
!insertmacro customHeader
OutFile "${nsisPath(output)}"
Section
  DetailPrint "\${APP_EXECUTABLE_FILENAME}"
  DetailPrint "\${UNINSTALL_FILENAME}"
  ${uninstaller ? 'WriteUninstaller "$TEMP/caption-uninstall.exe"' : ""}
SectionEnd
${uninstaller ? 'Section "Uninstall"\n  DetailPrint "uninstall fixture"\nSectionEnd' : ""}
`);
      const run = (...args) => spawnSync(compiler.path, args, {
        encoding: "utf8", env: { ...process.env, ...compiler.env }, timeout: 30_000,
      });
      const preprocessed = run("-PPO", script);
      expect(preprocessed.status, preprocessed.stderr).toBe(0);
      expect([...preprocessed.stdout.matchAll(/^Name .+$/gm)].at(-1)?.[0]).toBe('Name "SPDBot" "SPDBot"');
      expect([...preprocessed.stdout.matchAll(/^BrandingText .+$/gm)].at(-1)?.[0]).toBe(`BrandingText "SPDBot ${packageJson.version}"`);
      expect(preprocessed.stdout).toContain('DetailPrint "SPDBot.exe"');
      expect(preprocessed.stdout).toContain('DetailPrint "Uninstall SPDBot.exe"');
      for (const [language, setup, uninstall] of [
        ["English", "$(^Name) Setup", "$(^Name) Uninstall"],
        ["German", "Installation von $(^Name)", "Deinstallation von $(^Name)"],
      ]) {
        const nlf = readFileSync(path.join(compiler.env.NSISDIR, "Contrib/Language files", `${language}.nlf`), "utf8").replaceAll("\r\n", "\n");
        expect(nlf).toContain(`# ^SetupCaption\n${setup}`);
        expect(nlf).toContain(`# ^UninstallCaption\n${uninstall}`);
      }
      const compiled = run("-WX", "-V3", script);
      expect(compiled.status, compiled.stdout + compiled.stderr).toBe(0);
      expect(existsSync(output)).toBe(true);
    }, 120_000,
  );

  it("excludes enterprise and stale legacy CLI payloads using electron-builder's real resource filter", () => {
    const resource = config.extraResources.find((entry) => entry.from === "dist-server");
    const source = path.resolve("fixture-server");
    const filter = new FileMatcher(source, path.resolve("fixture-output"), (value) => value, resource.filter).createFilter();
    const file = { isDirectory: () => false };
    for (const relative of ["index.js", "spdbot.js", "desktop-entry.mjs", "enterprise.js", "drivers/agents-proxy.js", "package.json"]) {
      expect(filter(path.join(source, relative), file), relative).toBe(true);
    }
    for (const relative of ["enterprise/LICENSE", "enterprise/server/index.js", "openmausbot.js", "server/openmausbot.js"]) {
      expect(filter(path.join(source, relative), file), relative).toBe(false);
    }
    expect(filter(path.join(source, "enterprise"), { isDirectory: () => true })).toBe(false);
    for (const helper of ["OpenMausBot Speech", "OpenMausBot Recorder"]) expect(config.files).toContain(`!electron/resources/${helper}.app/**`);
    expect(config.extraResources).toContainEqual({ from: "LICENSE", to: "licenses/OpenMausBot-LICENSE.txt" });
    expect(config.extraResources).toContainEqual({ from: "NOTICE", to: "licenses/OpenMausBot-NOTICE.txt" });
  });

  it("keeps publication deliberate and removes upstream mirror/registry side effects", () => {
    expect(Object.keys(release.on)).toEqual(["workflow_dispatch"]);
    expect(release.on.workflow_dispatch.inputs.publish.default).toBe(false);
    expect(release.jobs.assemble.needs).toEqual(["prepare", "ci", "mac", "windows", "linux"]);
    expect(workflowText).not.toMatch(/milind-soni|RELEASES_PAT/);
    expect(JSON.stringify(release)).not.toContain("gh workflow run");
    expect(existsSync(new URL("../.github/workflows/sync-published-release.yml", import.meta.url))).toBe(false);
    const publish = release.jobs.assemble.steps.find((step) => step.name === "Publish (only when asked to)");
    expect(publish.if).toBe("${{ inputs.publish }}");
    expect(publish.run).toContain('--repo "$GITHUB_REPOSITORY" --draft=false --latest');
    expect(release.jobs.assemble.permissions).toEqual({ contents: "write" });
  });

  it("cannot publish the inherited npm package from this fork", () => {
    const npm = parse(read(".github/workflows/npm-package.yml"));
    for (const name of ["publish-npm", "update-github-release"]) {
      expect(npm.jobs[name].if).toBe("github.repository == 'milind-soni/OpenMausBot' && startsWith(github.ref, 'refs/tags/v')");
    }
    expect(npm.jobs["pack-and-prove"].if).toBeUndefined();
  });

  it("does not require an already-published update to build the first Linux package", () => {
    const linux = parse(read(".github/workflows/package-linux.yml"));
    expect(linux.on.workflow_dispatch.inputs.verify_update.default).toBe(false);
    expect(linux.jobs.package.steps.find((step) => step.run === "pnpm smoke:linux-update").if).toBe("inputs.verify_update");
    expect(linux.jobs.package.steps.find((step) => step.run === "pnpm smoke:linux-package").if).toBeUndefined();
  });

  it.each([false, true])("runs the actual renamed feed verifier (corrupt hash: %s)", (corrupt) => {
    const dir = mkdtempSync(path.join(tmpdir(), "spdbot-feed-"));
    temporary.push(dir);
    const version = "0.1.116";
    const files = {
      "latest-mac.yml": ["x64.zip", "arm64.zip", "x64.dmg", "arm64.dmg"],
      "latest.yml": ["setup.exe"],
      "latest-linux.yml": ["x86_64.AppImage", "amd64.deb"],
    };
    for (const [feed, suffixes] of Object.entries(files)) {
      const entries = suffixes.map((suffix) => {
        const url = `SPDBot-${version}-${suffix}`;
        const bytes = Buffer.from(`fixture: ${url}`);
        writeFileSync(path.join(dir, url), bytes);
        return { url, sha512: createHash("sha512").update(bytes).digest("base64"), size: bytes.length };
      });
      writeFileSync(path.join(dir, feed), stringify({ version, files: entries, path: entries[0].url, sha512: entries[0].sha512 }));
    }
    if (corrupt) writeFileSync(path.join(dir, `SPDBot-${version}-setup.exe`), "corrupted");
    const step = release.jobs.assemble.steps.find((entry) => entry.name === "Verify every feed hash against the actual bytes");
    const script = step.run.match(/<<'EOF'\n([\s\S]*?)\nEOF/)[1]
      .replaceAll("${{ needs.prepare.outputs.version }}", version);
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: dir, encoding: "utf8" });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr + result.stdout).toBe(corrupt ? 1 : 0);
  });
});
