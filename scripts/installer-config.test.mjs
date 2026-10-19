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
const { FileMatcher } = builderRequire("app-builder-lib/out/fileMatcher.js");
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const config = parse(read("electron-builder.yml"));
const release = parse(read(".github/workflows/release.yml"));
const packageJson = JSON.parse(read("package.json"));
const temporary = [];
afterEach(() => temporary.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const workflowText = ["release", "prepare-release", "package-linux", "package-win"]
  .map((name) => read(`.github/workflows/${name}.yml`)).join("\n");

describe("SPDBot desktop distribution", () => {
  it("is valid configuration for the installed electron-builder", async () => {
    await validateConfiguration(config, { isEnabled: false });
  });

  it("targets only the owned public feed without changing persisted runtime identities", () => {
    expect(config.publish).toEqual([{ provider: "github", owner: "thisistoni", repo: "spdbot" }]);
    expect(packageJson.name).toBe("openmausbot");
    expect(config).toMatchObject({ appId: "com.openmausbot.app", productName: "OpenMausBot" });
    expect(config.protocols[0].schemes).toEqual(["openmausbot"]);
    expect(config.linux.executableName).toBe("openmausbot");
    expect(packageJson.desktopName).toBe("com.openmausbot.app.desktop");
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

  it("excludes only enterprise payloads using electron-builder's real resource filter", () => {
    const resource = config.extraResources.find((entry) => entry.from === "dist-server");
    const source = path.resolve("fixture-server");
    const filter = new FileMatcher(source, path.resolve("fixture-output"), (value) => value, resource.filter).createFilter();
    const file = { isDirectory: () => false };
    for (const relative of ["index.js", "desktop-entry.mjs", "enterprise.js", "drivers/agents-proxy.js", "package.json"]) {
      expect(filter(path.join(source, relative), file), relative).toBe(true);
    }
    for (const relative of ["enterprise/LICENSE", "enterprise/server/index.js"]) {
      expect(filter(path.join(source, relative), file), relative).toBe(false);
    }
    expect(filter(path.join(source, "enterprise"), { isDirectory: () => true })).toBe(false);
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
