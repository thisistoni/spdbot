// An isolated native Electron test entry, never included by electron-builder.
import { app, BrowserWindow, ipcMain, powerMonitor, safeStorage, utilityProcess } from "electron";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { PurchaseClient } from "../../electron/purchase-client.mjs";
import { createPurchaseDesktop, takePurchaseLaunchLinks } from "../../electron/purchase-desktop.mjs";
import localOrigin from "../../electron/local-origin.cjs";
import { authority, FakeAuthority, freshClock, trust } from "../../electron/testing/purchase/fake-authority.mjs";
import { hash, strictJSON } from "../../electron/purchase-wire.mjs";
import { validateSecurity, verifyToken } from "../../electron/purchase-verifier.mjs";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const profile = option("profile"), mode = option("mode"), assets = option("assets");
if (!profile || !assets || !path.isAbsolute(profile) || !path.basename(path.dirname(profile)).startsWith("spdbot-native-purchase-")) throw new Error("fresh native test profile required");
app.setName("SPDBot Purchase Test"); app.setPath("userData", profile); app.setPath("sessionData", profile); app.disableHardwareAcceleration();
if (!app.requestSingleInstanceLock()) { app.quit(); } else {
  let win, client, child, warmEvents = 0, callbackEvents = 0, consumeError = null, startupError = null;
  const f = freshClock(Date.now() / 1000), fake = new FakeAuthority(f);
  const storage = {
    isAsyncEncryptionAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
    getSelectedStorageBackend: () => safeStorage.getSelectedStorageBackend(),
    encryptStringAsync: text => safeStorage.encryptStringAsync(text),
    decryptStringAsync: async bytes => {
      try { const result = await safeStorage.decryptStringAsync(bytes); strictJSON(typeof result === "string" ? result : result.result); return result; }
      catch (error) { startupError = `decrypt:${error.message}`; throw error; }
    },
  };
  const controller = createPurchaseDesktop({ app, authority, safeStorage: storage, ipcMain, powerMonitor, guard: localOrigin.localOnly, window: () => win,
    shell: { openExternal: async url => { assert.equal(new URL(url).origin, authority.origin); } }, fetch: fake.fetch, launchLinks: takePurchaseLaunchLinks(process.argv, authority),
    createClient(options) {
      const read = options.store.read.bind(options.store);
      options.store.read = async () => {
        try {
          const saved = await read();
          if (saved?.security) {
            await validateSecurity(saved.security, authority, f.time.wall);
            if (saved.credentials) await verifyToken(saved.credentials.access, "online", authority, saved.security.binding, f.time.wall, { historical: true });
          }
          return saved;
        } catch (error) { startupError ??= error.message; throw error; }
      };
      client = new PurchaseClient({ ...options, authority, trust, clockOptions: f.options, fetch: mode === "offline" ? async () => { throw new Error("offline"); } : fake.fetch });
      const validateKey = client.validateKey.bind(client);
      client.validateKey = async key => { try { return await validateKey(key); } catch (error) { startupError = error.message; throw error; } };
      const consume = client.consume.bind(client);
      client.consume = async (...args) => { try { return await consume(...args); } catch (error) { consumeError = error.message; throw error; } };
      return client;
    } });
  app.on("second-instance", (_event, argv) => { warmEvents++; if (controller.fromArgs(argv)) callbackEvents++; });
  const wait = async predicate => {
    const deadline = Date.now() + 15000;
    while (!(await predicate())) { if (Date.now() > deadline) throw new Error("native condition timed out"); await new Promise(resolve => setTimeout(resolve, 25)); }
  };
  let server;
  app.whenReady().then(async () => {
    assert.equal(await safeStorage.isAsyncEncryptionAvailable(), true);
    const ui = await readFile(path.join(assets, "ui.js"));
    server = createServer((req, res) => {
      if (req.url === "/ui.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(ui); return; }
      res.writeHead(200, { "content-type": "text/html", "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'" });
      res.end('<!doctype html><html lang="de"><title>SPDBot Zugangstest</title><style>body{margin:24px;background:#101714;color:#d5fbe5;font:14px system-ui}#root>div{display:flex;align-items:center;gap:16px;border:1px solid #365c49;padding:18px;border-radius:14px}button{border:1px solid #497c60;background:#1a3525;color:inherit;padding:9px;border-radius:9px}span{margin-right:auto}</style><div id="root"></div><script src="/ui.js"></script></html>');
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`; localOrigin.setLocalOrigin(origin);
    win = new BrowserWindow({ title: "SPDBot Zugangstest", show: false, width: 950, height: 200,
      webPreferences: { preload: path.resolve("electron/preload.cjs"), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
    await win.loadURL(origin);
    await controller.start();
    child = utilityProcess.fork(path.join(assets, "child.mjs"), [], { stdio: "ignore" });
    controller.attach(child);
    const backend = () => new Promise(resolve => {
      const id = String(Math.random());
      const receive = message => { if (message?.type === "spdbot:test-status-result" && message.id === id) { child.off("message", receive); resolve(message.allowed); } };
      child.on("message", receive); child.postMessage({ type: "spdbot:test-status", id });
    });
    const renderer = script => win.webContents.executeJavaScript(script);
    const initial = await client.state();
    if (mode === "online") {
      assert.equal(initial.allowed, false);
      // Cold launch's callback had no pending verifier and could not grant.
      assert.equal(client.record.security, null);
      await renderer('window.ogb.purchase.connect()');
      const link = fake.callback(client);
      const childEnv = { ...process.env }; delete childEnv.ELECTRON_RUN_AS_NODE;
      const launch = () => spawn(process.execPath, [path.resolve("scripts/testing/purchase-native-main.mjs"), `--profile=${profile}`, `--mode=${mode}`, `--assets=${assets}`, link], {
        env: childEnv, windowsHide: true, stdio: "ignore" });
      const warm = launch(); await new Promise((resolve, reject) => { warm.on("error", reject); warm.on("exit", resolve); });
      await wait(async () => (await client.state()).allowed);
      await wait(async () => await backend());
      const duplicate = launch(); await new Promise((resolve, reject) => { duplicate.on("error", reject); duplicate.on("exit", resolve); });
      assert.equal(fake.requests.filter(r => r.options.body?.includes('"authorization_code"')).length, 1);
      const view = await renderer('window.ogb.purchase.state()');
      assert.equal(view.allowed, true); assert.equal(JSON.stringify(view).includes(client.record.key.d), false);
      const bytes = await readFile(path.join(profile, "purchase-access.bin"));
      assert.equal(bytes.includes(Buffer.from(client.record.key.d)), false); assert.equal(bytes.includes(Buffer.from(client.record.credentials.refresh)), false);
      await wait(async () => (await renderer('document.body.innerText')).includes("SPDBot verbunden"));
      await writeFile(path.join(assets, "native-active.png"), (await win.webContents.capturePage()).toPNG());
      const oldKey = client.record.key.x;
      await renderer('window.ogb.purchase.signOut()');
      await writeFile(path.join(profile, "purchase-access.bin.pending"), "interrupted-fixture-update");
      await client.start();
      assert.equal((await client.state()).connected, false);
      await wait(async () => (await renderer('document.body.innerText')).includes("Verbindung zurücksetzen"));
      await renderer('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      await writeFile(path.join(assets, "native-reset.png"), (await win.webContents.capturePage()).toPNG());
      await renderer('[...document.querySelectorAll("button")].find(button => button.textContent === "Verbindung zurücksetzen").click()');
      await wait(async () => client.enabled && (await client.state()).issue === null);
      assert.equal(client.record.security, null);
      await renderer('window.ogb.purchase.connect()');
      await client.receiveCallback(fake.callback(client));
      await wait(async () => await backend());
      assert.notEqual(client.record.key.x, oldKey);
      await writeFile(path.join(assets, "online.json"), JSON.stringify({ ok: true, coldRejected: true, warm: true, replayRejected: true, safeStorage: true,
        leaseHash: hash(client.record.security.lease), expires: (await client.state()).expiresAt, rendererRedacted: true, privateUtilityChannel: true, storageResetThroughUI: true, german: await renderer('document.body.innerText') }));
    } else {
      assert.equal(initial.allowed, true);
      await wait(async () => await backend());
      const previous = JSON.parse(await readFile(path.join(assets, "online.json"), "utf8"));
      assert.equal(hash(client.record.security.lease), previous.leaseHash); assert.equal(initial.expiresAt, previous.expires);
      f.advance(86400); powerMonitor.emit("resume"); await client.tick(); assert.equal((await client.state()).allowed, true);
      assert.equal((await client.state()).expiresAt, previous.expires);
      f.advance(172800); powerMonitor.emit("resume"); await client.tick(); assert.equal((await client.state()).allowed, false);
      await wait(async () => !(await backend()));
      await wait(async () => !(await renderer('document.body.innerText')).includes("SPDBot verbunden"));
      await writeFile(path.join(assets, "native-restricted.png"), (await win.webContents.capturePage()).toPNG());
      await renderer('window.ogb.purchase.signOut()'); assert.equal(client.record.key, null);
      await writeFile(path.join(assets, "offline.json"), JSON.stringify({ ok: true, restartOffline: true, unchangedExpiry: true, syntheticResume: true, exactExpiry: true, signOut: true }));
    }
    child.kill(); win.destroy(); server.close(); app.quit();
  }).catch(async error => {
    await writeFile(path.join(assets, `${mode}-error.txt`), String(error.stack) + JSON.stringify({ warmEvents, callbackEvents, consumeError, startupError, state: await client?.state(), requestCount: fake.requests.length, pending: !!client?.pending }));
    child?.kill(); win?.destroy(); server?.close(); app.exit(1);
  });
}
