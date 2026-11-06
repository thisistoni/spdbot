import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { Packager, LinuxPackager } from "electron-builder";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import beforePackPurchase from "./before-pack-purchase.mjs";
import { PURCHASE_AUTHORITY } from "../electron/purchase-authority.mjs";
import { PurchaseClient } from "../electron/purchase-client.mjs";
import { PurchaseGate } from "../server/purchase-access.ts";
import { prepareRestrictedInputs, root } from "./ci-restricted-builder.mjs";
import { selectQualification } from "./select-linux-qualification.mjs";
import { restricted } from "./linux-package-identity.mjs";

const read = file => readFileSync(path.join(root, file), "utf8");
const builderRequire = createRequire(import.meta.resolve("electron-builder"));
const library = path.dirname(builderRequire.resolve("app-builder-lib"));
const { createElectronFrameworkSupport } = builderRequire(path.join(library, "electron/ElectronFramework.js"));
const publicKey = kid => ({ ...generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }), kid });
const configured = () => ({ ...PURCHASE_AUTHORITY, onlineKeys: [publicKey("online-current")], leaseKeys: [publicKey("lease-current")] });
const emptyProduction = { environment: "production", origin: "https://spdlabs.dev", onlineKeys: [], leaseKeys: [] };

async function builderContext(overrides = {}, options = { publish: "never" }) {
  const info = new Packager({ projectDir: root, ...options,
    config: { extends: "./scripts/ci-restricted-builder.mjs", ...overrides } });
  await info.validateConfig();
  // Same installed Electron framework initialization as Packager.build(),
  // without downloading/copying a platform runtime on this host.
  info._framework = await createElectronFrameworkSupport(info.config, info);
  const packager = new LinuxPackager(info);
  return { packager, arch: 1, electronPlatformName: "linux", appOutDir: path.join(root, ".omb-scratch/no-such-package") };
}

describe("shipping purchase packaging guard", () => {
  it("keeps the real shipping config bound to the rejecting guard", () => {
    expect(parse(read("electron-builder.yml")).beforePack).toBe("./scripts/before-pack-purchase.mjs");
    if (selectQualification() === "restricted") expect(() => beforePackPurchase()).toThrow("access_unavailable");
    else expect(() => beforePackPurchase()).not.toThrow();
  });

  it("executes the actual shipping hook against missing, partial, bad and synthetic authority", async () => {
    const good = configured();
    const synthetic = { ...good, onlineKeys: [publicKey("synthetic-online")] };
    const reserved = { ...good, onlineKeys: [{ ...good.onlineKeys[0], x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo" }] };
    const bad = { ...good, leaseKeys: [{ ...good.leaseKeys[0], d: "private-material-must-be-rejected" }] };
    const candidates = [emptyProduction, { ...good, onlineKeys: [] }, bad, synthetic, reserved, { ...good, origin: "http://localhost" }, good];
    // Only temporary copies are configured. The hook and validator run unchanged.
    for (const [index, authority] of candidates.entries()) {
      const temporary = mkdtempSync(path.join(tmpdir(), "spdbot-pack-guard-"));
      try {
        mkdirSync(path.join(temporary, "electron")); mkdirSync(path.join(temporary, "scripts"));
        const declaration = /export const PURCHASE_AUTHORITY = Object\.freeze\(\{[\s\S]*?\}\);/;
        const original = read("electron/purchase-authority.mjs");
        expect(original).toMatch(declaration);
        // Remains a negative guard test after reviewed production pins are filled.
        const source = original.replace(declaration,
          `export const PURCHASE_AUTHORITY = Object.freeze(${JSON.stringify(authority)});`);
        writeFileSync(path.join(temporary, "electron/purchase-authority.mjs"), source);
        writeFileSync(path.join(temporary, "scripts/before-pack-purchase.mjs"), read("scripts/before-pack-purchase.mjs"));
        const hook = (await import(pathToFileURL(path.join(temporary, "scripts/before-pack-purchase.mjs")).href)).default;
        if (index === candidates.length - 1) expect(() => hook()).not.toThrow();
        else expect(() => hook()).toThrow("access_unavailable");
      } finally { rmSync(temporary, { recursive: true, force: true }); }
    }
  });
});

// After activation the restricted builder must refuse the configured source.
// Its positive qualification tests apply only to the unconfigured build.
describe.skipIf(selectQualification() !== "restricted")("restricted CI builder boundary", () => {
  it("loads and invokes the real electron-builder configuration with only a separate identity", async () => {
    await prepareRestrictedInputs();
    const context = await builderContext();
    await context.packager.config.beforePack(context);
    expect(context.packager.config.publish).toBeNull();
    expect(context.packager.config.directories.output).toBe(restricted.output);
    expect(context.packager.appInfo.name).toBe(restricted.name);
    expect(context.packager.appInfo.sanitizedProductName).toBe(restricted.product);
    const shipping = parse(read("electron-builder.yml"));
    expect(context.packager.config.extraResources).toEqual(shipping.extraResources);
    expect(context.packager.config.files[0].filter).toEqual(shipping.files);
  });

  it.each(["always", "onTag", "onTagOrDraft", undefined])("rejects publishing policy %s before packing", async publish => {
    const context = await builderContext({}, publish === undefined ? {} : { publish });
    await expect(context.packager.config.beforePack(context)).rejects.toThrow("cannot publish");
  });

  it("rejects CLI overrides before building or touching artifacts", () => {
    const result = spawnSync(process.execPath, ["scripts/package-ci-restricted.mjs", "--publish", "always"], { cwd: root, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Restricted packaging accepts no CLI overrides");
  });

  it("rejects prepackaged input rather than qualifying an arbitrary resource tree", async () => {
    const context = await builderContext({}, { publish: "never", prepackaged: path.join(root, ".omb-scratch/unqualified-input") });
    await expect(context.packager.config.beforePack(context)).rejects.toThrow("actual runtime resources");
  });

  it.each([
    { productName: "SPDBot" }, { appId: "de.spdlabs.spdbot" }, { directories: { output: "release" } },
    { artifactName: "SPDBot-${version}.${ext}" }, { publish: [{ provider: "github", owner: "thisistoni", repo: "spdbot" }] },
    { asar: false }, { files: ["package.json"] }, { extraResources: [{ from: "dist", to: "ui" }] },
    { extraMetadata: { name: "spdbot" } }, { linux: { executableName: "spdbot" } },
  ])("rejects shipping identity, update-feed or resource overrides: %j", async overrides => {
    const context = await builderContext(overrides);
    await expect(context.packager.config.beforePack(context)).rejects.toThrow();
  });

  it("fails afterPack on missing real resources instead of accepting a partial package", async () => {
    const context = await builderContext();
    await expect(context.packager.config.afterPack(context)).rejects.toThrow(/ENOENT/);
  });

  it("keeps the real main client and backend closed without fixture authority or runtime bypasses", async () => {
    let sideEffects = 0;
    const unexpected = async () => { sideEffects++; throw new Error("must not run"); };
    const client = new PurchaseClient({ store: { read: unexpected }, fetch: unexpected, openExternal: unexpected });
    await client.start(); await client.connect();
    expect((await client.state()).allowed).toBe(false);
    expect((await client.state()).connected).toBe(false);
    expect(sideEffects).toBe(0);
    const gate = new PurchaseGate();
    await expect(gate.assert()).rejects.toMatchObject({ status: 402, code: "purchase_access_required" });
    await expect(gate.receive({ type: "spdbot:purchase-init", allowed: true })).rejects.toThrow();
    expect(await gate.check()).toBe(false);
  });

  it("isolates installer paths and AppArmor identity using the unchanged repair implementation", () => {
    for (const file of ["linux-after-install.sh", "linux-after-remove.sh", "linux-spdbot-browser.apparmor"]) {
      const source = read(`.omb-scratch/ci-restricted-inputs/${file}`);
      expect(source).not.toContain("/opt/SPDBot/");
      expect(source).not.toMatch(/\bspdbot-browser\b/);
      expect(source).toContain(restricted.name);
    }
  });
});

describe("qualification selection and workflow", () => {
  it("selects restricted only for empty production pins and restores distribution for configured trust", () => {
    expect(selectQualification(emptyProduction)).toBe("restricted");
    const good = configured();
    expect(selectQualification(good)).toBe("distribution");
    for (const authority of [{ ...good, onlineKeys: [] }, { ...good, leaseKeys: [publicKey("fixture-lease")] },
      { ...good, origin: "http://localhost" }, { ...emptyProduction, origin: "http://localhost" }]) {
      expect(() => selectQualification(authority)).toThrow();
    }
  });

  it("keeps both qualifications required, distinct, and outside release uploads", () => {
    const workflow = parse(read(".github/workflows/ci.yml"));
    expect(workflow.jobs.gate.needs).toContain("package-linux");
    const steps = workflow.jobs["package-linux"].steps;
    const distributionBuild = steps.find(step => step.run === "pnpm package:linux:offline");
    const restrictedBuild = steps.find(step => step.run === "pnpm package:linux:ci-restricted");
    for (const [step, mode] of [[distributionBuild, "distribution"], [restrictedBuild, "restricted"],
      [steps.find(step => step.run === "pnpm smoke:linux-package"), "distribution"],
      [steps.find(step => step.run === "pnpm smoke:linux:ci-restricted"), "restricted"]]) {
      expect(step.if).toBe(`steps.qualification.outputs.mode == '${mode}'`);
      expect(step["continue-on-error"]).toBeUndefined();
    }
    const release = parse(read(".github/workflows/release.yml"));
    for (const job of Object.values(release.jobs)) for (const step of job.steps ?? []) {
      assert.ok(!String(step.run ?? "").includes("ci-restricted"));
      if (step.uses?.startsWith("actions/upload-artifact@")) {
        expect(step.with.path).not.toContain(".omb-scratch");
      }
    }
    const scripts = JSON.parse(read("package.json")).scripts;
    for (const name of ["package:mac", "package:win", "package:linux", "package:linux:offline"]) {
      expect(scripts[name]).not.toContain("ci-restricted");
      expect(scripts[name]).toContain("electron-builder");
    }
    expect(steps.filter(step => step.uses?.startsWith("actions/upload-artifact@")).map(step => step.with.path).join("\n")).not.toContain(restricted.output);
  });
});
