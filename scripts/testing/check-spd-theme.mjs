// Use only the disposable URL printed by verify-spd-theme.ts.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";

const url = new URL(process.argv[2]);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/__spd-theme.html");
const { SKIN_CHROME } = createRequire(import.meta.url)("../../electron/skin-overlay.cjs");
const { chromium } = await import(process.env.OMB_VERIFY_PLAYWRIGHT || "playwright");
const output = process.env.OMB_SPD_EVIDENCE || "/tmp/omb-spd-theme-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.OMB_VERIFY_BROWSER_CHROME || undefined, headless: true,
});
const evidence = { checks: [], screenshots: [], pageErrors: [], externalRequests: [] };
const check = (name) => { evidence.checks.push(name); console.log(`PASS ${name}`); };
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "de-DE" });
  // Windows renderer bridge only: this never calls native window APIs.
  await context.addInitScript(() => {
    localStorage.setItem("omb-email-gate", "skipped");
    localStorage.setItem("omb-analytics-opt-out", "1");
    if (!localStorage.getItem("spd-verification-initialized")) {
      localStorage.setItem("omb-advanced-mode", "0");
      localStorage.setItem("omb-chat-width", "wide");
      localStorage.setItem("spd-verification-initialized", "1");
    }
    window.__skinCalls = [];
    window.__captionCalls = [];
    let maximized = false;
    const listeners = new Set();
    window.ogb = {
      platform: "win32",
      getCapabilities: async () => ({
        host: { platform: "win32", label: "Windows", session: "unknown", packaged: false },
        windowChrome: "win-caption",
        screenPreview: { available: false, interaction: "none" },
        dictation: { available: false, engine: "none", onDevice: false },
        localComputer: { available: false, support: "unsupported", enabled: false, status: "unavailable" },
      }),
      applySkin: async (skin) => { window.__skinCalls.push(skin); return true; },
      windowControls: {
        state: async () => ({ maximized }),
        onMaximizedChanged: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        minimize: async () => { window.__captionCalls.push("minimize"); },
        toggleMaximize: async () => {
          maximized = !maximized;
          window.__captionCalls.push("maximize");
          for (const listener of listeners) listener(maximized);
        },
        close: async () => { window.__captionCalls.push("close"); },
      },
    };
  });
  const observe = (target) => {
    target.on("pageerror", (error) => evidence.pageErrors.push(error.message));
    target.on("request", (request) => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== url.origin) {
        evidence.externalRequests.push(request.url());
      }
    });
  };
  const screenshot = async (name, target = page) => {
    await target.screenshot({ path: join(output, name), fullPage: true, animations: "disabled" });
    evidence.screenshots.push(name);
  };
  page = await context.newPage();
  observe(page);
  await page.goto(url.href);
  await page.getByRole("button", { name: "Du", exact: true }).waitFor();
  // The skipped email gate marks this as a prior install with no chosen skin.
  assert.equal(await page.locator("html").getAttribute("data-skin"), "midnight");
  check("Prior install without a saved skin still defaults to Midnight");

  const openAppearance = async () => {
    await page.getByRole("button", { name: "Du", exact: true }).click();
    await page.getByRole("menuitem", { name: "Einstellungen", exact: true }).click();
    await page.locator('[data-settings-page="appearance"]').click();
    await page.getByRole("button", { name: /^SPD / }).waitFor();
  };
  const choose = async (name, id) => {
    const option = page.getByRole("button", { name: new RegExp(`^${name} `) });
    await option.click();
    assert.equal(await option.getAttribute("aria-pressed"), "true");
    assert.deepEqual(await page.evaluate(() => ({
      active: document.documentElement.dataset.skin,
      saved: localStorage.getItem("omb-skin"),
      desktop: window.__skinCalls.at(-1),
    })), { active: id, saved: id, desktop: id });
  };
  await openAppearance();
  await choose("SPD", "spd");
  const description = page.getByText("Dunkle Pflaume, sanftes Lavendel. SPD Studio.", { exact: true });
  await description.waitFor();
  const font = page.locator('select:has(option[value="serif"])');
  await font.selectOption("serif");
  const customFont = await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily);
  for (const id of Object.keys(SKIN_CHROME)) {
    await choose(id === "spd" ? "SPD" : id[0].toUpperCase() + id.slice(1), id);
    assert.equal(await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily), customFont);
    const color = await page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
    const hex = SKIN_CHROME[id].color;
    assert.equal(color, `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(", ")})`);
  }
  check("All ten themes selectable; CSS backgrounds and desktop notifications match; custom font preserved");

  await page.reload();
  await page.getByRole("button", { name: "Du", exact: true }).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-skin"), "spd");
  assert.equal(await page.locator("html").getAttribute("data-font"), "serif");
  assert.equal(await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily), customFont);
  assert.deepEqual(await page.evaluate(() => [localStorage.getItem("omb-chat-width"), localStorage.getItem("omb-advanced-mode"), window.__skinCalls.at(-1)]), ["wide", "0", "spd"]);
  check("Reload restores SPD and the custom font while preserving chat width and interface mode");

  await openAppearance();
  await font.selectOption("skin");
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('500 14px "Outfit"')), true);
  assert.match(await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily), /^Outfit/);
  assert.equal(await page.evaluate(() => [...document.fonts].find((face) => face.family === "Outfit")?.status), "loaded");
  await page.getByRole("button", { name: /^SPD / }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await page.waitForFunction(() => getComputedStyle(document.activeElement).outlineColor === "rgb(213, 173, 255)");
  const focus = await page.getByRole("button", { name: /^SPD / }).evaluate((el) => ({
    color: getComputedStyle(el).outlineColor, width: getComputedStyle(el).outlineWidth,
    token: getComputedStyle(el).getPropertyValue("--color-focus"), visible: el.matches(":focus-visible"), focused: document.activeElement === el,
  }));
  assert.equal(focus.width, "2px");
  assert.equal(focus.color, "rgb(213, 173, 255)");
  assert.equal(focus.focused, true);
  assert.equal(focus.visible, true);
  evidence.focus = focus;
  await screenshot("appearance-desktop.png");
  check("Bundled Outfit loads; skin default restores it; SPD option has keyboard focus outline");

  await page.getByRole("button", { name: "Einstellungen schließen", exact: true }).click();
  await page.getByText("Dein Überblick", { exact: true }).waitFor();
  await page.locator(".shiki").waitFor();
  assert.equal(await page.locator(".shiki").first().evaluate((el) => getComputedStyle(el).colorScheme), "dark");
  await screenshot("chat-desktop.png");
  await page.getByRole("button", { name: "Du", exact: true }).click();
  await page.getByRole("menuitem", { name: "Einstellungen", exact: true }).waitFor();
  await screenshot("menu-desktop.png");
  await page.keyboard.press("Escape");

  const minimize = page.locator('button[aria-label="Minimize"]');
  await minimize.hover();
  const caption = await minimize.evaluate((el) => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
  assert.equal(caption.background, "rgb(33, 22, 47)");
  assert.equal(caption.color, "rgb(244, 240, 250)");
  await screenshot("windows-caption-hover.png");
  await minimize.click();
  await page.locator('button[aria-label="Maximize"]').click();
  await page.locator('button[aria-label="Restore"]').click();
  await page.locator('button[aria-label="Close"]').click();
  assert.deepEqual(await page.evaluate(() => window.__captionCalls), ["minimize", "maximize", "maximize", "close"]);
  evidence.windowsRenderer = { caption, nativeWindowsTested: false };
  check("Windows caption hover uses SPD colors; minimize, maximize/restore and close reach the mocked bridge");

  await openAppearance();
  const colorBubbles = page.getByRole("switch", { name: "Meine Nachrichten in der Farbe des Bots einfärben", exact: true });
  assert.equal(await colorBubbles.getAttribute("aria-checked"), "true");
  await colorBubbles.click();
  await choose("Meadow", "meadow");
  await choose("SPD", "spd");
  assert.equal(await colorBubbles.getAttribute("aria-checked"), "false");
  await page.getByRole("button", { name: "Einstellungen schließen", exact: true }).click();
  assert.equal(await page.locator(".user-bubble-colored").count(), 0);
  assert.equal(await page.locator(".bg-bubble-user").first().evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(33, 22, 47)");
  await screenshot("chat-theme-bubbles.png");
  check("Optional bot-colored messages stay enabled until changed explicitly; neutral bubbles use SPD plum and survive theme switching");

  await page.reload();
  await page.getByText("Dein Überblick", { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.match(await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily), /^Outfit/);
  assert.equal(await page.evaluate(() => localStorage.getItem("omb-color-user-bubbles")), "0");
  check("Reload also restores SPD with its default Outfit font");

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: "de-DE", isMobile: true, hasTouch: true,
    storageState: await context.storageState(),
  });
  const mobile = await mobileContext.newPage();
  observe(mobile);
  await mobile.goto(url.href);
  await mobile.getByText("Dein Überblick", { exact: true }).waitFor();
  await mobile.evaluate(() => document.fonts.ready);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await screenshot("chat-mobile.png", mobile);
  await mobile.getByRole("button", { name: "Open bot list", exact: true }).click();
  await mobile.getByRole("button", { name: "Du", exact: true }).click();
  await mobile.getByRole("menuitem", { name: "Einstellungen", exact: true }).click();
  await mobile.getByRole("combobox", { name: "Einstellungen", exact: true }).selectOption("appearance");
  await mobile.getByRole("button", { name: /^SPD / }).scrollIntoViewIfNeeded();
  assert.equal(await mobile.getByRole("button", { name: /^SPD / }).getAttribute("aria-pressed"), "true");
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await screenshot("appearance-mobile.png", mobile);
  check("390px touch layout: chat and selected SPD picker visible without horizontal overflow");
  assert.deepEqual(evidence.pageErrors, []);
  assert.deepEqual(evidence.externalRequests, []);
  check("No page errors or external requests, including fonts");
  evidence.browser = await browser.version();
  await writeFile(join(output, "checks.json"), JSON.stringify(evidence, null, 2) + "\n");
} catch (error) {
  await page?.screenshot({ path: join(output, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
