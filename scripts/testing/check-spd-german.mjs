// QA only: production React entry + isolated fake-engine workspace. No real credentials.
// The startup HTML is rendered in Chromium, NOT a native Electron window.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startupScreenHtml } from "../../electron/startup-screen.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const german = JSON.parse(await readFile(join(root, "src/locales/de.json"), "utf8"));
const sections = ["general", "appearance", "companion", "engines", "connections", "decisionModel", "skills", "desktopWorkspaces", "computer", "logins", "usage", "backups", "people", "activity", "workspaces", "experimental"];
const tabs = ["identity", "soul", "skills", "memory", "routines", "access", "model", "permissions", "voice"];

export function fixtureUrl(value) {
  const url = new URL(value);
  assert.equal(url.protocol, "http:", "Only the disposable HTTP fixture is allowed");
  assert.equal(url.hostname, "127.0.0.1", "Browser checks must stay on loopback");
  assert.equal(url.pathname, "/__spd-theme.html");
  assert.equal(url.username + url.password + url.search + url.hash, "", "No credentials or pairing codes are accepted");
  return url;
}

// Exact app-owned labels, never a broad English-word denylist over model names or user text.
export function assertGerman(actual, expected, label) {
  assert.equal(actual.replace(/\s+/g, " ").trim(), expected, `${label} must be German`);
}

async function guardedContext(browser, target, evidence, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "de-DE", serviceWorkers: "block", ...options });
  const allow = (address) => ["http:", "https:", "ws:", "wss:"].includes(address.protocol)
    && address.hostname === target.hostname && address.port === target.port;
  await context.route("**/*", (route) => {
    const request = route.request();
    const address = new URL(request.url());
    if (["data:", "blob:"].includes(address.protocol)) return route.continue();
    if (!allow(address)) {
      evidence.blockedExternal.push({ origin: address.origin, path: address.pathname });
      return route.abort("blockedbyclient");
    }
    // Inspection cannot accidentally create a bot, sign in, pair, or provision services.
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
      (/^\/api\/(auth|cloud|billing|checkout)(\/|$)/.test(address.pathname) || (address.pathname === "/api/bots" && request.method() === "POST"))) {
      evidence.blockedMutations.push({ method: request.method(), path: address.pathname });
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  await context.routeWebSocket("**/*", (socket) => {
    const address = new URL(socket.url());
    if (allow(address)) socket.connectToServer();
    else {
      evidence.blockedExternal.push({ origin: address.origin, path: address.pathname });
      socket.close();
    }
  });
  context.on("page", (page) => page.on("pageerror", (error) => evidence.pageErrors.push(error.message)));
  await context.addInitScript(() => {
    try {
    localStorage.setItem("omb-language", "de");
    localStorage.setItem("omb-email-gate", "skipped");
    localStorage.setItem("omb-analytics-opt-out", "1");
    localStorage.setItem("omb-advanced-mode", "0");
    } catch { /* The startup HTML uses an opaque about:blank origin. */ }
  });
  return context;
}

async function desktopFixture(context) {
  await context.addInitScript(() => {
    const unsubscribe = () => () => {};
    window.__unexpectedDesktopWrites = [];
    const forbidden = async () => { window.__unexpectedDesktopWrites.push("write"); throw new Error("Read-only QA desktop bridge"); };
    window.ogb = {
      platform: "win32",
      applySkin: async () => true,
      getCapabilities: async () => ({
        host: { platform: "win32", label: "Windows fixture", session: "unknown", packaged: false },
        windowChrome: "native", screenPreview: { available: false, interaction: "none" },
        dictation: { available: false, engine: "none", onDevice: false },
        localComputer: { available: false, support: "unsupported", enabled: false, status: "unavailable" },
      }),
      onOpenAppSettings: unsubscribe,
      workspaces: { state: async () => ({ local: true, name: "This computer" }), menu: forbidden },
      environments: {
        state: async () => ({ localOrigin: location.origin, remote: false, packaged: false, activeId: "local", environments: [] }),
        onOpenSettings: unsubscribe, addFromLink: forbidden, create: forbidden, switch: forbidden, forget: forbidden, pickDir: forbidden,
      },
      companion: { state: async () => ({ enabled: false, keepAwake: false, port: 8910, devices: [], pairing: null, lan: null, endpoints: [] }), start: forbidden, stop: forbidden, pairing: forbidden },
      remoteClient: { active: false, state: async () => ({ active: false }), disconnect: forbidden },
    };
  });
}

export async function checkGerman({ browser, url, botId, output, evidence }) {
  const target = fixtureUrl(url);
  const capture = async (name, page) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150); // Allow local fixture responses and React effects to paint before evidence capture.
    await page.screenshot({ path: join(output, `${name}.png`), fullPage: true, animations: "disabled" });
    const inventory = await page.evaluate(() => {
      const shown = (element) => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      return {
        title: document.title, language: document.documentElement.lang,
        renderedText: document.body.innerText,
        controls: [...document.querySelectorAll("button, input, select, textarea, a, label, [role], [title], [aria-label]")]
          .filter(shown).map(element => ({
            tag: element.tagName.toLowerCase(), role: element.getAttribute("role"),
            text: element.innerText?.trim() || "", ariaLabel: element.getAttribute("aria-label"),
            title: element.getAttribute("title"), placeholder: element.getAttribute("placeholder"),
            // Deliberately omit all input values, even though this is a synthetic workspace.
          })),
      };
    });
    await writeFile(join(output, `${name}.json`), JSON.stringify(inventory, null, 2) + "\n");
    await writeFile(join(output, `${name}.txt`), inventory.renderedText + "\n");
    evidence.pages.push({ name, screenshot: `${name}.png`, inventory: `${name}.json`, text: `${name}.txt` });
    assert.doesNotMatch(JSON.stringify(inventory), /(?:open)?mausbot/i, `${name}: visible old product branding`);
  };
  const pass = (message) => { evidence.checks.push(message); console.log(`PASS ${message}`); };
  const context = await guardedContext(browser, target, evidence);
  await desktopFixture(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  try {
    await page.goto(target.href);
    await page.locator(`[data-sidebar-bot-row="${botId}"]`).click();
    await page.getByText("Dein Überblick", { exact: true }).waitFor();
    const switcher = page.locator('[data-tour="server-switcher"]').first();
    await switcher.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-tour="server-switcher"]')?.getAttribute("title") === "Dieser Computer");
    assertGerman(await switcher.getAttribute("title"), "Dieser Computer", "This computer switcher");
    await capture("chat-sidebar-de", page);
    pass("Actual German synthetic chat and sidebar; This computer is Dieser Computer");

    await page.locator('[data-tour="bot-pill"]').click();
    await page.getByRole("button", { name: "Avatar bearbeiten", exact: true }).click();
    const avatar = page.getByRole("dialog", { name: "Avatar bearbeiten", exact: true });
    for (const [id, expected] of [["bot", "Bot"], ["generate", "Generieren"], ["upload", "Hochladen"]]) {
      assertGerman(await avatar.locator(`[data-avatar-tab="${id}"]`).innerText(), expected, `Avatar ${id} tab`);
    }
    assertGerman(await avatar.locator("[data-avatar-reset]").innerText(), "Zurücksetzen", "Avatar reset");
    await avatar.locator('[data-avatar-tab="upload"]').click();
    await avatar.getByText("Ziehe ein Bild hierher oder wähle eines aus", { exact: true }).waitFor();
    await avatar.getByText("Form", { exact: true }).waitFor();
    await capture("avatar-editor-upload-de", page);
    await avatar.press("Escape");
    await avatar.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Einstellungen schließen", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__unexpectedDesktopWrites), []);
    pass("Existing avatar editor has German tabs, upload and crop labels; closed without uploading or changing the avatar");

    await page.getByRole("button", { name: "Du", exact: true }).click();
    await page.getByRole("menuitem", { name: "Einstellungen", exact: true }).click();
    const dialog = page.locator('[role="dialog"][aria-labelledby="app-settings-title"]');
    await dialog.locator('[data-settings-block="general"]').waitFor();
    for (const [id, expected] of [["appearance", "Darstellung"], ["ai", "KI"], ["computers", "Computer"]]) {
      assertGerman(await dialog.locator(`[data-settings-page="${id}"]`).innerText(), expected, `Simple ${id} navigation`);
    }
    const simple = await dialog.locator("[data-settings-page]").evaluateAll(elements => elements.map(element => element.dataset.settingsPage));
    for (const id of simple) {
      await dialog.locator(`[data-settings-page="${id}"]`).click();
      await capture(`settings-simple-${id}-de`, page);
      const blocks = await dialog.locator("[data-settings-block]").evaluateAll(elements => elements.map(element => element.dataset.settingsBlock));
      for (const block of blocks) {
        await dialog.locator(`[data-settings-block="${block}"]`).scrollIntoViewIfNeeded();
        await capture(`settings-simple-${id}-${block}-de`, page);
      }
    }
    pass("Every visible Simple settings page and stacked section captured; Appearance/AI/Computers have exact German labels");

    await dialog.locator('[data-settings-page="general"]').click();
    await dialog.getByRole("switch", { name: "Erweiterter Modus", exact: true }).click();
    await dialog.locator('[data-settings-section="general"]').waitFor();
    assertGerman(await dialog.locator('[data-settings-section="appearance"]').innerText(), "Darstellung", "Advanced Appearance");
    assertGerman(await dialog.locator("#settings-group-ai").innerText(), "KI", "Advanced AI");
    assertGerman(await dialog.locator("#settings-group-computers").textContent(), "Computer", "Advanced Computers");
    const advanced = await dialog.locator("[data-settings-section]").evaluateAll(elements => elements.map(element => element.dataset.settingsSection));
    for (const id of advanced) {
      assert.ok(sections.includes(id), `Unexpected settings section ${id}: add explicit QA coverage`);
      const nav = dialog.locator(`[data-settings-section="${id}"]`);
      assertGerman(await nav.innerText(), german[`settings.section.${id}`], `Advanced ${id} navigation`);
      await nav.click();
      await capture(`settings-advanced-${id}-de`, page);
      // Full-page screenshots do not reveal a dialog's inner scroll area. Capture its lower pages too.
      const scroller = dialog.locator(":scope > div:last-child > div:last-child");
      for (let part = 1; ; part++) {
        const moved = await scroller.evaluate(element => {
          const before = element.scrollTop;
          element.scrollTop += Math.max(1, element.clientHeight - 80);
          return element.scrollTop > before;
        });
        if (!moved) break;
        assert.ok(part < 40, `${id}: unexpected endless settings scroll`);
        await capture(`settings-advanced-${id}-de-${part}`, page);
      }
    }
    pass("All visible Advanced settings sections inspected, including scrolled content; provider/model names preserved");
    await dialog.getByRole("button", { name: "Einstellungen schließen", exact: true }).click();
    await dialog.waitFor({ state: "detached" });

    const botIds = async () => page.evaluate(async () => {
      const response = await fetch("/api/bots?messages=0");
      if (!response.ok) throw new Error(`Could not inspect synthetic bots: ${response.status}`);
      return (await response.json()).bots.map(bot => bot.id).sort();
    });
    const before = await botIds();
    await page.getByRole("button", { name: "Neu oder teilen", exact: true }).click();
    await page.getByRole("button", { name: /^Neuer Bot/ }).click();
    const newBot = page.getByRole("dialog", { name: "Neuer Bot", exact: true });
    // The draft contains nested avatar option fieldsets; wait for its outer readiness container.
    await newBot.locator("fieldset:not(fieldset fieldset)").waitFor();
    const navigation = newBot.getByRole("navigation", { name: "Bot-Einstellungen", exact: true });
    assert.equal(await navigation.getByRole("button").count(), tabs.length);
    for (const [index, id] of tabs.entries()) {
      const tab = navigation.getByRole("button").nth(index);
      assertGerman(await tab.innerText(), german[`botSettings.sections.${id}`], `New bot ${id} tab`);
      await tab.click();
      await capture(`new-bot-${id}-de`, page);
    }
    await newBot.getByRole("button", { name: "Abbrechen", exact: true }).click();
    await newBot.waitFor({ state: "detached" });
    assert.deepEqual(await botIds(), before, "Opening every tab must not create a bot");
    assert.deepEqual(await page.evaluate(() => window.__unexpectedDesktopWrites), []);
    pass("All nine New bot tabs captured, then cancelled; no bot created and no privileged desktop action invoked");
  } catch (error) {
    await capture("app-failure", page).catch(() => {});
    throw error;
  } finally { await context.close(); }

  const pairContext = await guardedContext(browser, target, evidence);
  await pairContext.route("**/api/auth/session", route => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  const pair = await pairContext.newPage();
  try {
    // Read the descriptor requested by the real page, so identity namespace changes
    // cannot leave this fixture probing an obsolete endpoint of its own.
    const descriptor = pair.waitForResponse(response => {
      const url = new URL(response.url());
      return url.origin === target.origin && /^\/\.well-known\/[a-z0-9-]+\/environment$/.test(url.pathname);
    });
    await pair.goto(target.href);
    await pair.getByLabel("Kopplungscode", { exact: true }).waitFor();
    const described = await descriptor;
    assert.equal(described.ok(), true, "The actual PairPage descriptor request must succeed");
    const environment = await described.json();
    const heading = `Mit ${environment.label} verbinden`;
    await pair.getByRole("heading", { name: heading, exact: true }).waitFor();
    assertGerman(await pair.locator("h1").innerText(), heading, "Unauthenticated PairPage heading (dynamic server name preserved)");
    assertGerman(await pair.locator('label[for="pair-label"]').innerText(), "Dieses Gerät", "PairPage device label");
    assertGerman(await pair.getByRole("button", { name: "Verbinden", exact: true }).innerText(), "Verbinden", "PairPage submit label");
    await capture("pair-page-unauthenticated-de", pair);
    pass("Actual main entry selects German PairPage after a fixture 401, in a separate context; no pairing submitted");
  } catch (error) { await capture("pair-failure", pair).catch(() => {}); throw error; }
  finally { await pairContext.close(); }

  const startupContext = await guardedContext(browser, target, evidence, { viewport: { width: 440, height: 300 } });
  const startup = await startupContext.newPage();
  try {
    await startup.setContent(startupScreenHtml(join(root, "electron/resources/app-icon.png")));
    assertGerman(await startup.getByRole("status").innerText(), "Dein Arbeitsbereich wird geöffnet…", "Opening workspace startup status");
    assert.equal(await startup.locator("html").getAttribute("lang"), "de");
    assert.equal(await startup.title(), "SPDBot");
    assert.doesNotMatch(await startup.locator("body").innerText(), /Opening workspace/i);
    await startup.getByRole("button", { name: "Schließen", exact: true }).waitFor();
    await capture("startup-html-chromium-440x300-de", startup);
    pass("Production startupScreenHtml at 440×300 has German status and close label; Chromium-only, not native Electron");
  } finally { await startupContext.close(); }
  assert.deepEqual(evidence.pageErrors, [], "Renderer must not crash");
  assert.deepEqual(evidence.blockedMutations, [], "No forbidden account/bot-creation mutation attempted");
  assert.deepEqual(evidence.blockedExternal, [], "Unexpected external requests were blocked");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = fixtureUrl(process.argv[2]);
  const botId = process.argv[3];
  assert.match(botId || "", /^[a-zA-Z0-9_-]+$/, "The launcher must supply the synthetic bot id");
  const output = process.env.OMB_SPD_EVIDENCE || ".omb-scratch/spd-german-evidence";
  await mkdir(output, { recursive: true });
  const evidence = { runtime: "Google Chrome/Chromium on Linux; synthetic read-only Windows desktop bridge; startup HTML is NOT native Electron", checks: [], pages: [], pageErrors: [], blockedExternal: [], blockedMutations: [] };
  let browser;
  try {
    const { chromium } = await import(process.env.OMB_VERIFY_PLAYWRIGHT || "playwright");
    browser = await chromium.launch({ executablePath: process.env.OMB_VERIFY_BROWSER_CHROME || undefined, headless: true, chromiumSandbox: true });
    evidence.browser = await browser.version();
    await checkGerman({ browser, url, botId, output, evidence });
  } catch (error) {
    evidence.failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await writeFile(join(output, "checks.json"), JSON.stringify(evidence, null, 2) + "\n");
    await browser?.close();
  }
}
