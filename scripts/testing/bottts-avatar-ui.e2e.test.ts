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
    // Advanced mode also has a text-only profile button beside the avatar.
    const profileSelector = '[data-chathead-identity] button[aria-label="Profil von Pepper öffnen"]:has(img)';
    const clickSelector = async (selector: string) => {
      expect(await evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`), selector).toBe(1);
      return evaluate(`document.querySelector(${JSON.stringify(selector)}).click(); true`);
    };
    const api = fixtureApi(info!.url);
    const bot = async () => (await api("GET", "/api/bots")).bots.find((row: { id: string }) => row.id === info.botId);
    const screenshot = (name: string) => ui("screenshot", "--out", join(evidenceDir, `bottts-avatar-${name}.png`));
    const upload = async (selector: string, name: string) => {
      expect(await evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)).toBe(1);
      // Four visible quadrants make retained zoom/focus inspectable in the screenshots.
      await evaluate(`(() => { const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');['#e63946','#457b9d','#f4a261',${JSON.stringify(name === "simple.png" ? "#2a9d8f" : "#8338ec")}].forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect((i%2)*64,Math.floor(i/2)*64,64,64);});const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],${JSON.stringify(name)},{type:'image/png'}));const input=document.querySelector(${JSON.stringify(selector)});input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    };
    const setZoom = async (selector: string, value: number) => {
      expect(await evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)).toBe(1);
      await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true; })()`);
      await expect.poll(async () => (await bot()).avatarZoom, { timeout: 10_000 }).toBe(value);
    };
    mkdirSync(evidenceDir, { recursive: true });
    await api("PATCH", "/api/config", { language: "de" });
    await evaluate("localStorage.setItem('omb-advanced-mode','0'); location.reload(); true");
    await expect.poll(() => exists(profileSelector), { timeout: 30_000 }).toBe(true);
    const peer = (await api("POST", "/api/bots")).bot;
    await api("PATCH", `/api/bots/${peer.id}`, { name: "Avatar QA peer" });
    const peerSelector = `[data-sidebar-bot-row="${peer.id}"] img`;
    const smallSelector = `[data-sidebar-bot-row="${info!.botId}"] img`;
    await expect.poll(() => exists(peerSelector), { timeout: 10_000 }).toBe(true);
    const peerFace = await evaluate(`document.querySelector(${JSON.stringify(peerSelector)}).src`);
    const originalColor = (await bot()).color;
    const defaultFace = await evaluate("document.querySelector('[data-chathead-identity] img').src");
    await clickSelector(profileSelector);
    await click("Avatar bearbeiten");
    await expect.poll(() => exists("[data-bottts-editor]"), { timeout: 10_000 }).toBe(true);
    expect(await evaluate("document.querySelectorAll('[data-bottts-part=eyes]').length")).toBe(14);
    expect(await evaluate("document.querySelectorAll('[data-bottts-part=mouth]').length")).toBe(9);
    await screenshot("simple-before-de");
    const sizes = await evaluate(`({small:document.querySelector(${JSON.stringify(smallSelector)}).getBoundingClientRect().width,large:document.querySelector('[data-panel-avatar] img').getBoundingClientRect().width})`);
    expect(sizes.small).toBeGreaterThan(0);
    expect(sizes.large).toBeGreaterThan(sizes.small);
    expect(await evaluate(`document.querySelector(${JSON.stringify(smallSelector)}).src`)).toBe(defaultFace);
    expect(peerFace).not.toBe(defaultFace);
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
    await evaluate("document.querySelector('[data-bottts-editor] select').scrollIntoView({block:'nearest'}); true");
    await screenshot("simple-controls-de");
    // Repeated choices, Escape, reopen, then a real page reload.
    await ui("press", "--keys", "Escape");
    expect(await exists("[data-panel-avatar-editor]")).toBe(false);
    expect(await exists("[data-panel-avatar]")).toBe(true);
    await click("Avatar bearbeiten");
    expect(await evaluate("document.querySelector('[data-bottts-value=hearts]').getAttribute('aria-pressed')")).toBe("true");
    await evaluate("location.reload(); true");
    await expect.poll(() => evaluate("document.querySelector('[data-chathead-identity] img')?.src"), { timeout: 30_000 }).toBe(changedFace);
    await clickSelector(profileSelector);
    await click("Avatar bearbeiten");
    await click("Hochladen");
    // A real File passes through the existing upload handler and attachment API.
    await upload('[data-panel-avatar-editor] input[type=file]', "simple.png");
    await expect.poll(async () => (await bot()).avatarUrl, { timeout: 15_000 }).toMatch(/^\/api\/attachments\/.*\.png$/);
    const uploaded = (await bot()).avatarUrl;
    await setZoom('[data-panel-avatar-editor] input[type=range]', 1.5);
    await api("PATCH", `/api/bots/${info!.botId}`, { avatarFocusX: 0.3, avatarFocusY: 0.7 });
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
    await expect.poll(() => exists(profileSelector), { timeout: 30_000 }).toBe(true);
    await clickSelector(profileSelector);
    const identity = '[data-bot-settings-section="identity"]';
    const identityToggle = `${identity} > button[aria-expanded]`;
    const openIdentity = async () => {
      await expect.poll(() => evaluate(`document.querySelectorAll(${JSON.stringify(identityToggle)}).length`), { timeout: 10_000 }).toBe(1);
      if (await evaluate(`document.querySelector(${JSON.stringify(identityToggle)}).getAttribute('aria-expanded')`) !== "true") await clickSelector(identityToggle);
    };
    await openIdentity();
    await expect.poll(() => evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Bottts')"), { timeout: 10_000 }).toBe(true);
    await click("Bottts");
    await click("Sensoraugen");
    await expect.poll(async () => (await bot()).botttsAvatar, { timeout: 10_000 }).toEqual({ eyes: "sensor" });
    expect(await bot()).toMatchObject({ avatarUrl: uploaded, avatarZoom: 1.5 });
    await screenshot("advanced-de");
    await evaluate("document.querySelector('[data-bottts-editor] select').scrollIntoView({block:'nearest'}); true");
    await screenshot("advanced-controls-de");
    await clickSelector('[data-bottts-value="smile01"]');
    await click("Farbe #448ef4 verwenden");
    await clickSelector('[data-bottts-radius="0"]');
    await evaluate("(() => { const select=document.querySelector('[data-bottts-editor] select');select.value='dots';select.dispatchEvent(new Event('change',{bubbles:true}));return true; })()");
    const advancedAppearance = { eyes: "sensor", mouth: "smile01", backgroundColor: "#448ef4", radius: 0, texture: true, textureVariant: "dots" };
    await expect.poll(async () => (await bot()).botttsAvatar, { timeout: 10_000 }).toEqual(advancedAppearance);
    const advancedFace = await evaluate("document.querySelector('[data-chathead-identity] img').src");
    await ui("press", "--keys", "Escape");
    await expect.poll(() => exists(identity), { timeout: 10_000 }).toBe(false);
    await clickSelector(profileSelector);
    await openIdentity();
    expect(await evaluate("document.querySelector('[data-bottts-value=sensor]').getAttribute('aria-pressed')")).toBe("true");
    await evaluate("location.reload(); true");
    await expect.poll(() => evaluate("document.querySelector('[data-chathead-identity] img')?.src"), { timeout: 30_000 }).toBe(advancedFace);
    await clickSelector(profileSelector);
    await openIdentity();
    expect(await bot()).toMatchObject({ avatarUrl: uploaded, avatarZoom: 1.5, avatarFocusX: 0.3, avatarFocusY: 0.7 });
    await click("Bild hochladen");
    await upload(`${identity} input[type=file]`, "advanced.png");
    await expect.poll(async () => (await bot()).avatarUrl, { timeout: 15_000 }).not.toBe(uploaded);
    const advancedUpload = (await bot()).avatarUrl;
    expect(advancedUpload).toMatch(/^\/api\/attachments\/.*\.png$/);
    await setZoom(`${identity} input[type=range]`, 1.8);
    await api("PATCH", `/api/bots/${info!.botId}`, { avatarFocusX: 0.7, avatarFocusY: 0.2 });
    await expect.poll(() => evaluate(`document.querySelector('${identity} input[type=range]')?.value`), { timeout: 10_000 }).toBe("1.8");
    expect((await bot()).botttsAvatar).toEqual(advancedAppearance);
    await screenshot("advanced-upload-de");
    await click("Bottts");
    await click("Zurücksetzen");
    await expect.poll(async () => (await bot()).botttsAvatar, { timeout: 10_000 }).toBeNull();
    expect(await bot()).toMatchObject({ avatarUrl: advancedUpload, avatarZoom: 1.8, avatarFocusX: 0.7, avatarFocusY: 0.2, color: originalColor });
    expect(await evaluate("document.querySelector('[data-chathead-identity] img').src")).toBe(defaultFace);
    expect(await evaluate(`document.querySelector(${JSON.stringify(peerSelector)}).src`)).toBe(peerFace);
    const unchangedPeer = (await api("GET", "/api/bots")).bots.find((row: { id: string }) => row.id === peer.id);
    expect(unchangedPeer.color).toBe(peer.color);
    expect(unchangedPeer.botttsAvatar).toEqual(peer.botttsAvatar);
    // The image crop and Bottts shape both offer "Kreis". Select the crop group explicitly.
    await clickSelector(`${identity} .grid-cols-4 > button:nth-child(2)`);
    await expect.poll(() => evaluate(`document.querySelector('${identity} input[type=range]')?.value`), { timeout: 10_000 }).toBe("1.8");
    await screenshot("advanced-crop-retained-de");
    writeFileSync(join(evidenceDir, "bottts-avatar-checks.json"), JSON.stringify({
      runtime: "Real app renderer in headless Chromium on Linux; isolated fake-engine server, real profile and attachment API; no native Windows package", sizes, checks: ["14 eyes, 9 mouths", "small/large avatars and distinct stable faces for multiple bots", "both editors: color, shape and texture changes", "both editors: persistence, real reload, Escape and reopen", "both editors: real quadrant image upload and crop retained through edits/reset", "original seeded face restored and bot colors unchanged"],
    }, null, 2));
  }, 780_000);
});
