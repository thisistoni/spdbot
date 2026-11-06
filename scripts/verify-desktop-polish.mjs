// Native Windows/Electron geometry and keyboard smoke, with an isolated profile.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const flag = "--spd-polish-fixture";
if (!process.versions.electron) {
  const { mountPreview } = await import("./testing/preview-fixture.ts");
  const { Resvg } = await import("@resvg/resvg-js");
  const customPng = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#345678"/><circle cx="32" cy="32" r="18" fill="#fedcba"/></svg>').render().asPng();
  const preview = await mountPreview({ info: { url: "http://127.0.0.1:1" } }, {
    entry: "/scripts/testing/desktop-polish-preview.tsx", route: "/__desktop-polish.html", title: "SPDBot polish fixture", logLevel: "error",
    extraRoutes: [{ path: "/api/attachments/fixture-custom.png", handler: (_request, response) => { response.setHeader("content-type", "image/png"); response.end(customPng); } }],
  });
  const output = mkdtempSync(join(tmpdir(), "spdbot-polish-"));
  const env = { ...process.env, HOME: output, USERPROFILE: output, APPDATA: join(output, "roaming"), LOCALAPPDATA: join(output, "local") };
  delete env.ELECTRON_RUN_AS_NODE;
  console.log(`Desktop polish evidence: ${output}`);
  try {
    const child = spawn(createRequire(import.meta.url)("electron"), [fileURLToPath(import.meta.url), flag, output, preview.previewUrl, ...process.argv.slice(2)], { env, stdio: "inherit" });
    const watchdog = setTimeout(() => child.kill(), process.argv.includes("--show-fixture") ? 300_000 : 90_000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
    clearTimeout(watchdog);
    assert.equal(code, 0, "Electron fixture failed");
    const receipt = JSON.parse(readFileSync(join(output, "receipt.json"), "utf8"));
    assert.equal(receipt.passed, true);
  } finally { await preview.close(); }
} else {
  const { app, BrowserWindow, nativeImage, session } = await import("electron");
  const at = process.argv.indexOf(flag);
  assert.ok(at > 0);
  const [output, url] = process.argv.slice(at + 1);
  const before = process.argv.includes("--record-before");
  const inspect = process.argv.includes("--show-fixture");
  app.setPath("userData", join(output, "profile"));
  app.setPath("sessionData", join(output, "profile"));
  app.commandLine.appendSwitch("disable-background-networking");
  app.on("window-all-closed", () => { if (inspect) app.quit(); });
  void app.whenReady().then(async () => {
  const origin = new URL(url).origin;
  session.defaultSession.webRequest.onBeforeRequest((request, callback) => callback({ cancel: ![origin, "devtools://devtools"].includes(new URL(request.url).origin) && !/^(data|blob):/.test(request.url) }));
  const window = new BrowserWindow({ width: 1100, height: 800, show: inspect, title: "SPDBot polish fixture", icon: fileURLToPath(new URL("../electron/resources/app-icon.png", import.meta.url)), webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const evidence = { platform: process.platform, electron: process.versions.electron, before, cases: [], passed: false };
  const evaluate = (code) => window.webContents.executeJavaScript(code);
  const settle = async (selector) => {
    const end = Date.now() + 20_000;
    while (Date.now() < end) {
      if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) {
        await evaluate("document.fonts.ready");
        await new Promise(resolve => setTimeout(resolve, 450));
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Fixture did not mount ${selector}`);
  };
  try {
    for (const locale of ["de", "en"]) for (const width of [1100, 840, 390]) for (const zoom of [1, 1.5, 2]) {
      window.setContentSize(width, 800);
      window.webContents.setZoomFactor(zoom);
      await window.loadURL(`${url}?locale=${locale}`);
      await settle("[data-tour-card] button");
      const geometry = await evaluate(`(() => {
        const card = document.querySelector('[role=dialog]'), buttons = [...card.querySelectorAll('button')];
        const box = el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
        const progress = card.querySelector('.tabular-nums'), range=document.createRange();range.selectNodeContents(progress);
        return { viewport: {width:innerWidth,height:innerHeight}, card:box(card), focused: document.activeElement?.textContent, progress:{rect:box(progress),lines:range.getClientRects().length},
          buttons:buttons.map(el=>{const range=document.createRange();range.selectNodeContents(el);return {text:el.textContent,rect:box(el),lines:range.getClientRects().length};}) };
      })()`);
      evidence.cases.push({ locale, width, zoom, ...geometry });
      if (zoom === 1 || width === 390) writeFileSync(join(output, `tour-${locale}-${width}-${zoom}.png`), (await window.webContents.capturePage()).toPNG());
      if (!before) {
        assert.ok(geometry.card.x >= -1 && geometry.card.right <= geometry.viewport.width + 1, "Card fits viewport");
        for (const button of geometry.buttons) {
          if (geometry.viewport.width >= 260) assert.equal(button.lines, 1, `${locale}/${width}/${zoom}: ${button.text} stays on one line`);
          assert.ok(button.rect.x >= geometry.card.x && button.rect.right <= geometry.card.right, "Action stays inside card");
        }
        assert.equal(geometry.progress.lines, 1, "Progress stays on one line");
        const actions = [...geometry.buttons.map(button => button.rect), geometry.progress.rect];
        for (let a = 0; a < actions.length; a++) for (let b = a + 1; b < actions.length; b++) {
          const x = actions[a], y = actions[b];
          assert.ok(x.right <= y.x + 1 || y.right <= x.x + 1 || x.bottom <= y.y + 1 || y.bottom <= x.y + 1, "Actions do not overlap");
        }
        assert.equal(geometry.focused, geometry.buttons[0].text, "Next receives autofocus");
        window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
        window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
        assert.equal(await evaluate("document.activeElement.textContent"), geometry.buttons[1].text, "Tab reaches skip");
        window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Return" });
        window.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
        window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
        await new Promise(resolve => setTimeout(resolve, 40));
        assert.equal(await evaluate("document.body.dataset.action"), "skip", "Keyboard skip works");
        window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
        window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
        await new Promise(resolve => setTimeout(resolve, 40));
        assert.equal(await evaluate("document.body.dataset.action"), "escape", "Escape dismisses");
      }
    }
    if (!before) {
      window.setContentSize(760, 520); window.webContents.setZoomFactor(1);
      await window.loadURL(`${url}?view=brand`); await settle("main img");
      const images = await evaluate("[...document.querySelectorAll('img')].map(el=>({src:el.getAttribute('src'),loaded:el.complete&&el.naturalWidth>0}))");
      assert.equal(images.length, 4); assert.ok(images.every(image => image.loaded), "Brand and avatars load");
      assert.equal(images[1].src, images[2].src, "Bottts seed stays stable at both sizes");
      assert.equal(images[3].src, "/api/attachments/fixture-custom.png", "Custom avatar remains intact");
      for (const relative of ["../build/icon.ico", "../electron/resources/app-icon.png"]) assert.ok(!nativeImage.createFromPath(fileURLToPath(new URL(relative, import.meta.url))).isEmpty(), relative);
      writeFileSync(join(output, "brand-and-avatars.png"), (await window.webContents.capturePage()).toPNG());
      await window.loadURL(`${url}?view=bot&locale=de`); await settle("input");
      const customBefore = await evaluate("document.querySelector('img').outerHTML");
      await evaluate("document.querySelectorAll('[role=radio]')[1].click()");
      await new Promise(resolve => setTimeout(resolve, 40));
      assert.equal(await evaluate("document.querySelector('img').outerHTML"), customBefore, "Welcome bot color edits preserve its custom image and framing");
      assert.ok(customBefore.includes("fixture-custom.png") && customBefore.includes("scale(1.5)"), "Welcome uses the saved image and zoom");
      writeFileSync(join(output, "welcome-custom-bot-de.png"), (await window.webContents.capturePage()).toPNG());
      await window.loadURL(`${url}?view=appearance&locale=de`); await settle("select");
      const labels = await evaluate("[...document.querySelectorAll('select')].map(el=>[...el.options].map(option=>option.textContent))");
      assert.deepEqual(labels, [["Theme-Standard", "System", "Inter", "Poppins", "Serifenschrift"], ["Standard", "Breit", "Volle Breite"], ["Zeilen", "Symbolleiste"]]);
      writeFileSync(join(output, "appearance-de.png"), (await window.webContents.capturePage()).toPNG());
    }
    evidence.passed = true;
    writeFileSync(join(output, "receipt.json"), JSON.stringify(evidence, null, 2));
    console.log(`PASS ${evidence.cases.length} native Electron tour cases${before ? " (baseline recorded)" : "; keyboard, branding and custom avatars"}`);
    if (!inspect) { window.destroy(); app.quit(); }
  } catch (error) { console.error(error); writeFileSync(join(output, "receipt.json"), JSON.stringify({ ...evidence, error: String(error) }, null, 2)); app.exit(1); }
  });
}
