// Real App + both production editors + real profile API, with disposable data.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { resolveAgentBrowserBinary } from "../../server/browser-engine.ts";
import { waitForExit } from "../../server/testing/cleanup.ts";
import { runControlOmb } from "../control-omb.ts";
import { fixtureApi } from "./preview-fixture.ts";
import { UI_TOOLS_DIR } from "./control-omb-ui.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const enabled = process.env.OMB_UI_E2E === "1" || Boolean(resolveAgentBrowserBinary({ dataDir: UI_TOOLS_DIR, env: process.env }));
const evidenceDir = join(ROOT, ".omb-scratch", "verify-evidence");
if (!enabled) console.log("skipping Bottts avatar UI: set OMB_UI_E2E=1 to run the pinned Chromium fixture");

describe("Bottts customization in the real German renderer", () => {
  let child: ChildProcess | undefined;
  afterAll(async () => { await waitForExit(child, { signal: "SIGINT", graceMs: 30_000 }); });
  (enabled ? it : it.skip)("edits both cards, persists across reload, and retains a custom image through reset", async () => {
    let stdout = "";
    let stderr = "";
    let info: { ui: string; url: string; botId: string };
    child = spawn(process.execPath, ["--experimental-strip-types", join(ROOT, "scripts/control-omb.ts"), "ui", "launch"], {
      cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout!.on("data", (chunk: Buffer) => { stdout += String(chunk); });
    child.stderr!.on("data", (chunk: Buffer) => { stderr += String(chunk); });
    await expect.poll(() => {
      if (child!.exitCode !== null || child!.signalCode !== null) throw new Error(`Avatar UI launcher exited: ${stderr}`);
      try { info = JSON.parse(stdout); return Boolean(info.ui); } catch { return false; }
    }, { timeout: 600_000, interval: 250 }).toBe(true);
    const ui = (verb: string, ...args: string[]) => runControlOmb(["ui", verb, "--ui", info.ui, ...args]) as Promise<Record<string, any>>;
    const evaluate = async (js: string) => (await ui("eval", "--js", js)).result;
    const click = (name: string) => ui("click", "--name", name);
    const exists = (selector: string) => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    const clickSelector = (selector: string) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click(); true`);
    const api = fixtureApi(info!.url);
    const bot = async () => (await api("GET", "/api/bots")).bots.find((row: { id: string }) => row.id === info.botId);
    const screenshot = (name: string) => ui("screenshot", "--out", join(evidenceDir, `bottts-avatar-${name}.png`));
    mkdirSync(evidenceDir, { recursive: true });
    await api("PATCH", "/api/config", { language: "de" });
    await evaluate("localStorage.setItem('omb-advanced-mode','0'); location.reload(); true");
    await expect.poll(() => exists('[data-chathead-identity] button'), { timeout: 30_000 }).toBe(true);
    const defaultFace = await evaluate("document.querySelector('[data-chathead-identity] img').src");
    await click("Profil von Pepper öffnen");
    await click("Avatar bearbeiten");
    await expect.poll(() => exists("[data-bottts-editor]"), { timeout: 10_000 }).toBe(true);
    expect(await evaluate("document.querySelectorAll('[data-bottts-part=eyes]').length")).toBe(14);
    expect(await evaluate("document.querySelectorAll('[data-bottts-part=mouth]').length")).toBe(9);
    await screenshot("simple-before-de");
    await click("Herzaugen");
    await click("Lächeln 2");
    await click("Farbe #448ef4 verwenden");
    await clickSelector('[data-bottts-radius="50"]');
    await evaluate("(() => { const select=document.querySelector('[data-bottts-editor] select');select.value='circuits';select.dispatchEvent(new Event('change',{bubbles:true}));return true; })()");
    const appearance = { eyes: "hearts", mouth: "smile02", backgroundColor: "#448ef4", radius: 50, texture: true, textureVariant: "circuits" };
    await expect.poll(async () => (await bot()).botttsAvatar, { timeout: 10_000 }).toEqual(appearance);
    expect(await evaluate("document.querySelector('[data-panel-avatar] img').src")).not.toBe(defaultFace);
    const changedFace = await evaluate("document.querySelector('[data-panel-avatar] img').src");
    expect(await evaluate("getComputedStyle(document.querySelector('[data-panel-avatar] img').parentElement).borderRadius")).toBe("50%");
    await screenshot("simple-custom-de");
    // Repeated choices, Escape, reopen, then a real page reload.
    await ui("press", "--keys", "Escape");
    expect(await exists("[data-panel-avatar-editor]")).toBe(false);
    expect(await exists("[data-panel-avatar]")).toBe(true);
    await click("Avatar bearbeiten");
    expect(await evaluate("document.querySelector('[data-bottts-value=hearts]').getAttribute('aria-pressed')")).toBe("true");
    await evaluate("location.reload(); true");
    await expect.poll(() => evaluate("document.querySelector('[data-chathead-identity] img')?.src"), { timeout: 30_000 }).toBe(changedFace);
    await click("Profil von Pepper öffnen");
    await click("Avatar bearbeiten");
    await click("Hochladen");
    // A real File passes through the existing upload handler and attachment API.
    await evaluate(`(() => { const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],'fixture.png',{type:'image/png'}));const input=document.querySelector('[data-panel-avatar-editor] input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    await expect.poll(async () => (await bot()).avatarUrl, { timeout: 15_000 }).toMatch(/^\/api\/attachments\/.*\.png$/);
    const uploaded = (await bot()).avatarUrl;
    await api("PATCH", `/api/bots/${info!.botId}`, { avatarZoom: 1.5, avatarFocusX: 0.3, avatarFocusY: 0.7 });
    await expect.poll(() => evaluate("document.querySelector('[data-panel-avatar-editor] input[type=range]')?.value"), { timeout: 10_000 }).toBe("1.5");
    await click("Bot");
    await click("Fröhliche Augen");
    await expect.poll(async () => (await bot()).avatarCrop, { timeout: 10_000 }).toBe("mascot");
    expect(await bot()).toMatchObject({ avatarUrl: uploaded, avatarZoom: 1.5, avatarFocusX: 0.3, avatarFocusY: 0.7, botttsAvatar: { ...appearance, eyes: "happy" } });
    await click("Zurücksetzen");
    await expect.poll(async () => (await bot()).botttsAvatar, { timeout: 10_000 }).toBeNull();
    expect(await bot()).toMatchObject({ avatarUrl: uploaded, avatarZoom: 1.5, avatarFocusX: 0.3, avatarFocusY: 0.7 });
    expect(await evaluate("document.querySelector('[data-panel-avatar] img').src")).toBe(defaultFace);
    await click("Hochladen");
    await click("Kreis");
    await expect.poll(async () => (await bot()).avatarCrop, { timeout: 10_000 }).toBe("circle");
    expect(await evaluate("document.querySelector('[data-panel-avatar-editor] input[type=range]').value")).toBe("1.5");
    await screenshot("custom-image-retained-de");
    // Same real App, advanced profile surface. No fake desktop bridge.
    await evaluate("localStorage.setItem('omb-advanced-mode','1'); location.reload(); true");
    await expect.poll(() => exists('[data-chathead-identity] button'), { timeout: 30_000 }).toBe(true);
    await click("Profil von Pepper öffnen");
    await clickSelector('[data-bot-settings-section="identity"] button');
    await expect.poll(() => evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Bottts')"), { timeout: 10_000 }).toBe(true);
    await click("Bottts");
    await click("Sensoraugen");
    await expect.poll(async () => (await bot()).botttsAvatar, { timeout: 10_000 }).toEqual({ eyes: "sensor" });
    expect(await bot()).toMatchObject({ avatarUrl: uploaded, avatarZoom: 1.5 });
    await screenshot("advanced-de");
    writeFileSync(join(evidenceDir, "bottts-avatar-checks.json"), JSON.stringify({
      runtime: "Real app renderer in headless Chromium on Linux; isolated fake-engine server, real profile and attachment API; no native Windows package", checks: ["14 eyes, 9 mouths", "color, shape and texture changes", "debounced persistence and real reload", "Escape and reopen", "real image upload retained through edits/reset", "original seeded face restored", "advanced editor uses the same saved options"],
    }, null, 2));
  }, 780_000);
});
