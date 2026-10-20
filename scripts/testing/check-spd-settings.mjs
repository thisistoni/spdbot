// Real renderer checks against the disposable verify-spd-theme.ts server.
// Desktop bridges below are fixtures; this does not verify a native installer or a live remote connection.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function checkSettings({ context, url, screenshot, check }) {
  const target = new URL(url);
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.pathname, "/__spd-theme.html");
  const settingsContext = await context.browser().newContext({
    viewport: { width: 1440, height: 1000 }, locale: "de-DE", storageState: await context.storageState(),
  });
  const errors = [], external = [];
  await settingsContext.route("**/*", (route) => {
    const address = new URL(route.request().url());
    if (["http:", "https:"].includes(address.protocol) && address.origin !== target.origin) {
      external.push(address.href);
      return route.abort();
    }
    return route.continue();
  });
  await settingsContext.addInitScript(() => {
    localStorage.setItem("omb-email-gate", "skipped");
    localStorage.setItem("omb-analytics-opt-out", "1");
    localStorage.setItem("omb-advanced-mode", "0");
    const settingsListeners = new Set();
    window.__openSettings = (section) => { for (const listener of settingsListeners) listener(section); };
    window.__pairCalls = [];
    const unsubscribe = () => () => {};
    let localCompanion = { enabled: false, keepAwake: false, port: 8910, devices: [], pairing: null, lan: "192.168.1.34", endpoints: [] };
    window.__hostedCalls = 0;
    const forbiddenHostedCall = async () => { window.__hostedCalls++; throw new Error("Unsupported hosted account bridge was called"); };
    window.ogb = {
      platform: "win32",
      applySkin: async () => true,
      getCapabilities: async () => ({
        host: { platform: "win32", label: "Windows fixture", session: "unknown", packaged: false },
        windowChrome: "native",
        screenPreview: { available: false, interaction: "none" },
        dictation: { available: false, engine: "none", onDevice: false },
        localComputer: { available: false, support: "unsupported", enabled: false, status: "unavailable" },
      }),
      onOpenAppSettings: (listener) => { settingsListeners.add(listener); return () => settingsListeners.delete(listener); },
      cloudAccount: { state: async () => ({ status: "signed-out" }), onState: unsubscribe, files: { state: forbiddenHostedCall, onState: forbiddenHostedCall } },
      organization: { state: async () => ({ status: "signed-out" }), onState: unsubscribe },
      cloudPlan: { state: async () => ({ status: "none" }) },
      environments: {
        state: async () => ({ localOrigin: location.origin, remote: false, packaged: false, activeId: "local", environments: [] }),
        onOpenSettings: unsubscribe,
        addFromLink: async (link) => {
          window.__pairCalls.push(link);
          throw new Error("Error invoking remote method 'environments:add-from-link': Error: Testverbindung abgebrochen");
        },
      },
      companionAccount: { state: forbiddenHostedCall, prepare: forbiddenHostedCall },
      companion: {
        state: async () => localCompanion,
        start: async () => (localCompanion = { ...localCompanion, enabled: true }),
        stop: async () => (localCompanion = { ...localCompanion, enabled: false }),
        pairing: async (open) => (localCompanion = { ...localCompanion, pairing: open ? { code: "123456", token: `omb_pair_${"a".repeat(43)}`, expiresAt: Date.now() + 120000 } : null }),
      },
      remoteClient: {
        active: false,
        state: async () => ({ active: window.ogb.remoteClient.active, serverName: "Testserver", endpoint: "computer.tailnet.ts.net" }),
        disconnect: async () => { window.ogb.remoteClient.active = false; },
      },
    };
  });
  const page = await settingsContext.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const dialog = page.locator('[role="dialog"][aria-labelledby="app-settings-title"]');
  const noUpstreamAccounts = async () => {
    assert.equal(await dialog.locator('[data-settings-section="cloudAccount"], [data-settings-section="organization"], [data-cloud-plan], [data-cloud-offer]').count(), 0);
    assert.doesNotMatch(await dialog.innerText(), /MausBot Cloud|MAUSBOT CLOUD/);
  };
  try {
    // Exercise production desktop deep-link routing, not a hand-built Settings render.
    target.searchParams.set("desktop-settings", "cloud-settings");
    await page.goto(target.href);
    await dialog.locator('[data-settings-block="general"]').waitFor();
    await noUpstreamAccounts();
    assert.equal(await dialog.locator('[data-settings-page="account"]').count(), 0);
    await screenshot("settings-general-no-upstream-account-de.png", page);
    check("German Simple settings hide upstream accounts even with desktop bridges; old Cloud link opens General");

    await dialog.getByRole("switch", { name: "Erweiterter Modus", exact: true }).click();
    await dialog.locator('[data-settings-section="general"][aria-current="page"]').waitFor();
    await page.evaluate(() => window.__openSettings("organization"));
    await noUpstreamAccounts();
    assert.equal(await dialog.locator('[data-settings-section="general"]').getAttribute("aria-current"), "page");
    await screenshot("settings-advanced-no-upstream-account-de.png", page);
    check("Advanced settings and old Organization requests keep unsupported account services hidden");

    for (const section of ["appearance", "engines", "connections", "desktopWorkspaces"]) {
      await dialog.locator(`[data-settings-section="${section}"]`).click();
      await page.evaluate(() => document.fonts.ready);
      await screenshot(`settings-${section}-de.png`, page);
    }
    await dialog.locator('[data-settings-section="desktopWorkspaces"]').click();
    const ownerCommand = dialog.getByText('pnpm pair --label "SPDBot Desktop"', { exact: true });
    await ownerCommand.locator("xpath=..").locator("summary").click();
    await ownerCommand.waitFor({ state: "visible" });
    assert.match(await ownerCommand.locator("xpath=..").innerText(), /SPDBot-Projektordner auf dem Server/);
    await screenshot("settings-server-source-command-de.png", page);

    await dialog.locator('[data-settings-section="companion"]').click();
    const clientCommand = dialog.getByText("pnpm pair --client", { exact: true });
    await clientCommand.scrollIntoViewIfNeeded();
    const form = clientCommand.locator("xpath=ancestor::form");
    assert.match(await form.innerText(), /SPDBot-Projektordner auf dem Server/);
    assert.doesNotMatch(await form.innerText(), /npx openmausbot|OpenMausBot|Self-hosted server|Connection type/);
    await screenshot("settings-pairing-de.png", page);
    await dialog.getByRole("button", { name: "Lokalen Kopplungscode erstellen", exact: true }).click();
    await dialog.getByText("123456", { exact: true }).waitFor();
    assert.equal(await dialog.locator('[aria-label="Device pairing QR code"]').count(), 0);
    await screenshot("settings-local-pairing-de.png", page);
    await dialog.getByRole("button", { name: "Kopplungscode schließen", exact: true }).click();
    await dialog.getByText("123456", { exact: true }).waitFor({ state: "hidden" });
    check("Local desktop pairing retains its temporary code without hosted account provisioning or native-mobile QR");
    await form.getByRole("textbox", { name: "Kopplungslink des Servers", exact: true }).fill("not-a-link");
    await form.getByRole("button", { name: "Mit Server verbinden", exact: true }).click();
    await form.getByRole("alert").waitFor();
    assert.deepEqual(await page.evaluate(() => window.__pairCalls), []);
    const link = "https://bots.example.test/pair#code=ABCD-EFGH-JKLM";
    await form.getByRole("textbox", { name: "Kopplungslink des Servers", exact: true }).fill(link);
    await form.getByRole("button", { name: "Mit Server verbinden", exact: true }).click();
    await form.getByText("Testverbindung abgebrochen", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__pairCalls), [link]);
    assert.equal(await form.getByRole("textbox", { name: "Kopplungslink des Servers", exact: true }).inputValue(), link);
    assert.equal(await form.getByRole("button", { name: "Mit Server verbinden", exact: true }).isEnabled(), true);
    check("Pairing uses real source-install commands; malformed links never submit and cancelled fixture connections remain retryable");

    await dialog.locator('[data-settings-section="general"]').click();
    await page.evaluate(() => { window.ogb.remoteClient.active = true; });
    await dialog.locator('[data-settings-section="companion"]').click();
    const disconnect = dialog.getByRole("button", { name: "Trennen und diesen Computer nutzen", exact: true });
    await disconnect.waitFor();
    await screenshot("settings-active-client-de.png", page);
    await disconnect.click();
    await clientCommand.waitFor();
    assert.equal(await page.evaluate(() => window.ogb.remoteClient.active), false);
    check("An existing direct desktop client keeps its disconnect action and can return to local use");

    await page.setViewportSize({ width: 390, height: 844 });
    await clientCommand.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await screenshot("settings-pairing-390px-de.png", page);
    await dialog.getByRole("button", { name: "Einstellungen schließen", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await page.evaluate(() => window.__openSettings("cloud-settings"));
    await dialog.waitFor();
    await noUpstreamAccounts();
    check("390px pairing has no document overflow; closing and reopening an old account request stays on supported settings");

    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    assert.equal(await page.evaluate(() => window.__hostedCalls), 0);
    check("Settings fixture completed without page errors or external service requests");
  } catch (error) {
    await screenshot("settings-failure.png", page).catch(() => {});
    throw error;
  } finally {
    await settingsContext.close();
  }
}


if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = new URL(process.argv[2]);
  assert.equal(url.hostname, "127.0.0.1");
  const output = process.env.OMB_SPD_EVIDENCE || ".omb-scratch/spd-settings-evidence";
  await mkdir(output, { recursive: true });
  const { chromium } = await import(process.env.OMB_VERIFY_PLAYWRIGHT || "playwright");
  const browser = await chromium.launch({
    executablePath: process.env.OMB_VERIFY_BROWSER_CHROME || undefined,
    headless: true, chromiumSandbox: true,
  });
  const evidence = { runtime: "Chromium on Linux; synthetic Windows desktop bridge", checks: [], screenshots: [], browser: await browser.version() };
  try {
    const context = await browser.newContext();
    await checkSettings({ context, url,
      screenshot: async (name, page) => {
        await page.screenshot({ path: join(output, name), fullPage: true, animations: "disabled" });
        evidence.screenshots.push(name);
      },
      check: (name) => { evidence.checks.push(name); console.log(`PASS ${name}`); },
    });
  } catch (error) {
    evidence.failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await writeFile(join(output, "checks.json"), JSON.stringify(evidence, null, 2) + "\n");
    await browser.close();
  }
}
