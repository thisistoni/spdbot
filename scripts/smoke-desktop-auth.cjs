// Run after build:server with Electron. Real private IPC and Chromium headers;
// disposable profile, unchanged shipping bundle, no purchase fixture or provider.
const { app, BrowserWindow, session, utilityProcess } = require("electron");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { createServer } = require("node:net");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");

const root = resolve(__dirname, "..");
const home = mkdtempSync(join(tmpdir(), "spdbot-desktop-auth-"));
app.setPath("userData", join(home, "electron"));
app.setPath("home", home);
let child, win, exited, token, port, output = "";
const deadline = setTimeout(() => { console.error(`Desktop auth timed out: ${home}\n${output}`); child?.kill(); app.exit(1); }, 60_000);

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}

async function stop() {
  if (!child) return;
  child.kill();
  await Promise.race([exited, delay(5_000).then(() => { throw new Error("Utility server did not exit"); })]);
  child = null;
}

app.whenReady().then(async () => {
  const { installServerSessions } = await import("../electron/server-session.mjs");
  installServerSessions({ app, defaultSession: session.defaultSession, serverPort: () => port, ownerToken: () => token });
  mkdirSync(join(home, "data"));
  writeFileSync(join(home, "data", "config.json"), '{"instances":{}}');
  win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  for (let attempt = 0; attempt < 2; attempt++) {
    port = await freePort();
    let webhook = await freePort();
    while (webhook === port) webhook = await freePort();
    token = randomBytes(32).toString("base64url");
    const origin = `http://127.0.0.1:${port}`;
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ["SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "LANG", "TZ"].includes(key.toUpperCase())));
    Object.assign(env, { HOME: home, USERPROFILE: home, APPDATA: join(home, "roaming"), LOCALAPPDATA: join(home, "local"),
      XDG_CONFIG_HOME: join(home, ".config"), XDG_CACHE_HOME: join(home, ".cache"), XDG_DATA_HOME: join(home, ".local"),
      OMB_DATA_DIR: join(home, "data"), OMB_PORT: String(port), OMB_WEBHOOK_PORT: String(webhook), OMB_DESKTOP_PARENT: "1" });
    child = utilityProcess.fork(join(root, "dist-server", "index.js"), [], { env, stdio: "pipe" });
    const current = child;
    let exitCode, challenged = false;
    exited = new Promise(resolve => current.once("exit", code => { exitCode = code; resolve(); }));
    for (const stream of [current.stdout, current.stderr]) stream.on("data", bytes => { output += bytes; });
    current.on("message", message => { if (message?.type === "spdbot:purchase-challenge") challenged = true; });
    // Production sends this once, immediately at spawn, before server imports finish.
    current.once("spawn", () => current.postMessage({ type: "openmausbot:desktop-mutation-token", token }));
    const until = Date.now() + 25_000;
    let ready = false;
    while (Date.now() < until) {
      assert.equal(exitCode, undefined, `Server exited: ${output}`);
      ready = await fetch(`${origin}/api/health`).then(r => r.ok, () => false);
      if (ready) break;
      await delay(50);
    }
    assert.ok(ready, `Server health timed out: ${output}`);
    assert.ok(challenged, "The restricted backend must still request purchase possession");
    await win.loadURL(`${origin}/api/health`);
    const actual = await win.webContents.executeJavaScript(`(async () => {
      const ticket = await fetch('/api/auth/stream-ticket', {method:'POST'});
      const denied = await fetch('/api/bots', {method:'POST', headers:{'content-type':'application/json'}, body:'{}'});
      return { ticket: {status:ticket.status, body:await ticket.json()}, denied:{status:denied.status, body:await denied.json()} };
    })()`);
    assert.equal(actual.ticket.status, 200, JSON.stringify(actual));
    assert.equal(actual.ticket.body.ticket, null);
    assert.equal(actual.denied.status, 402, JSON.stringify(actual));
    assert.equal(actual.denied.body.code, "purchase_access_required");
    token = null;
    const unauthenticated = await win.webContents.executeJavaScript("fetch('/api/auth/stream-ticket', {method:'POST'}).then(r => r.status)");
    assert.equal(unauthenticated, 401, "A browser without the private desktop capability must remain unauthorized");
    console.log(`Desktop auth ${attempt ? "restart" : "cold start"}: owner 200, unpaired browser 401, purchase restriction 402`);
    await stop();
  }
}).then(async () => {
  writeFileSync(join(home, "server.log"), output);
  clearTimeout(deadline); win?.destroy(); app.exit(0);
}, async error => {
  console.error(error);
  writeFileSync(join(home, "server.log"), output);
  console.error(`Evidence: ${home}`);
  try { await stop(); } catch (stopError) { console.error(stopError); }
  clearTimeout(deadline); win?.destroy(); app.exit(1);
});
