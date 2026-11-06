import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { restricted } from "./linux-package-identity.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = fileURLToPath(import.meta.url);
if (process.platform !== "linux") throw new Error("Restricted native smoke requires Linux");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

if (process.argv[2] !== "--child") {
  if (process.argv.length !== 2) throw new Error("Restricted smoke accepts no overrides");
  const output = path.join(root, restricted.output);
  const images = readdirSync(output).filter(file => file.endsWith(".AppImage"));
  assert.equal(images.length, 1);
  const unpacked = path.join(output, "linux-unpacked", restricted.name);
  const image = path.join(output, images[0]);
  for (const [executable, mode] of [[unpacked, "close"], [image, "close"],
    [`/opt/${restricted.product}/${restricted.name}`, "close"], [image, "signal"], [unpacked, "restart"]]) {
    const run = spawnSync("dbus-run-session", ["--", "xvfb-run", "-a", process.execPath, script, "--child", executable, mode], {
      cwd: root, stdio: "inherit", timeout: 180_000,
    });
    if (run.error) throw run.error;
    assert.equal(run.status, 0, `restricted ${mode} smoke failed`);
  }
} else {
  const executable = path.resolve(process.argv[3]);
  const mode = process.argv[4];
  const sandbox = mkdtempSync(path.join(tmpdir(), "omb-linux-smoke-restricted-"));
  const home = path.join(sandbox, "home"), config = path.join(sandbox, "config"), runtime = path.join(sandbox, "runtime");
  for (const directory of [home, config, runtime]) mkdirSync(directory, { mode: 0o700 });
  const marker = path.join(sandbox, "unexpected-cua-invocation");
  const sentinel = path.join(sandbox, "cua-driver");
  writeFileSync(sentinel, `#!/bin/sh\nprintf invoked >> '${marker}'\nexit 1\n`, { mode: 0o755 });
  chmodSync(runtime, 0o700);
  // An existing opt-in must not start CUA when purchase access is unavailable.
  for (const name of [restricted.name, restricted.product, "SPDBot", "spdbot"]) {
    const directory = path.join(config, name);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(directory, "cua-local-control.json"), JSON.stringify({ schemaVersion: 2, linuxLocalControlEnabled: true }));
  }
  const env = { ...process.env, HOME: home, USERPROFILE: home, OMB_DATA_DIR: path.join(home, ".spdbot"),
    XDG_CONFIG_HOME: config, XDG_DATA_HOME: path.join(sandbox, "data"), XDG_CACHE_HOME: path.join(sandbox, "cache"),
    XDG_RUNTIME_DIR: runtime, XDG_SESSION_TYPE: "x11", CUA_DRIVER_PATH: sentinel,
    OMB_COMPOSIO_BROKER_URL: "http://127.0.0.1:1", OMB_SMOKE_TEST: "1", OMB_SMOKE_KEEP_OPEN: "1",
    OMB_SMOKE_CUA: "0", OMB_SMOKE_BUNDLED_CUA: "0" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  let child, ws, output = "", renderer, endpoint;
  const alive = () => child && child.exitCode === null && child.signalCode === null;
  async function until(probe, label, timeout = 45_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      assert.ok(!output.includes("[smoke] renderer-failed"), `Packaged renderer failed waiting for ${label}\n${output}`);
      const result = await probe();
      if (result) return result;
      assert.ok(alive(), `Electron exited waiting for ${label}\n${output}`);
      await delay(100);
    }
    throw new Error(`Timeout: ${label}\n${output}`);
  }
  async function launch() {
    output = ""; renderer = null; endpoint = null;
    child = spawn(executable, ["--password-store=basic", "--remote-debugging-port=0"], { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    child.once("error", error => { output += error.stack; });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", data => {
      output += data;
      endpoint = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
      const result = output.match(/\[smoke\] renderer-ready (.+)/)?.[1];
      if (result) renderer = JSON.parse(result);
    });
    await until(() => renderer && endpoint, "actual packaged renderer");
    assert.equal(renderer.health.app, "spdbot"); assert.equal(renderer.health.static, true);
    assert.ok(renderer.title.includes("SPDBot"));
    assert.equal(renderer.capabilities.host.platform, "linux");
    assert.equal(renderer.capabilities.localComputer.available, false);
    assert.equal(renderer.hardwareAccelerationEnabled, false);
    assert.equal(renderer.displayMediaRequests, 0);
    ws = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
    let serial = 0;
    const pending = new Map();
    ws.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      pending.get(message.id)?.(message); pending.delete(message.id);
    });
    const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++serial;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20_000);
      pending.set(id, message => {
        clearTimeout(timeout);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const { targetInfos } = await command("Target.getTargets");
    const target = targetInfos.find(info => info.type === "page" && info.url === renderer.location);
    assert.ok(target, "actual app renderer target required");
    const { sessionId } = await command("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const evaluate = expression => command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    const result = await evaluate(`(async () => {
      const state = await window.ogb.purchase.state();
      const enable = await window.ogb.localControl.enable();
      const retry = await window.ogb.localControl.retry();
      const reads = await Promise.all(["/api/config", "/api/bots"].map(async route => (await fetch(route)).status));
      const writes = await Promise.all(["/api/bots", "/api/routines", "/api/internal/mcp"].map(async route => {
        const r = await fetch(route, { method: "POST", headers: { "content-type": "application/json", "x-spdbot-access": "active" }, body: "{}" });
        return { status: r.status, body: await r.json() };
      }));
      return { state, enable, retry, reads, writes, capabilities: await window.ogb.getCapabilities() };
    })()`);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    const value = result.result.value;
    assert.equal(value.state.allowed, false); assert.equal(value.state.connected, false);
    for (const status of [value.enable, value.retry]) {
      assert.equal(status.enabled, false); assert.equal(status.reasonCode, "purchase-access-required");
    }
    assert.deepEqual(value.reads, [200, 200]);
    for (const response of value.writes) {
      assert.equal(response.status, 402); assert.equal(response.body.code, "purchase_access_required");
    }
    assert.equal(value.capabilities.localComputer.available, false);
    assert.equal(existsSync(marker), false, "restricted app invoked CUA");
    return evaluate;
  }
  async function waitForExit() {
    const deadline = Date.now() + 15_000;
    while (alive() && Date.now() < deadline) await delay(50);
    assert.equal(alive(), false, `packaged app did not shut down\n${output}`);
    let health;
    const serverDeadline = Date.now() + 10_000;
    do {
      health = await fetch(new URL("/api/health", renderer.location), { signal: AbortSignal.timeout(3000) }).catch(() => null);
      if (!health?.ok) break;
      await delay(100);
    } while (Date.now() < serverDeadline);
    assert.equal(health?.ok ?? false, false, "backend survived Electron shutdown");
  }
  try {
    let evaluate = await launch();
    if (mode === "restart") {
      child.kill("SIGKILL"); await waitForExit(); ws.close();
      evaluate = await launch(); // same disposable profile: stale lease recovery
    }
    if (mode === "signal") child.kill("SIGTERM");
    else await evaluate("window.close()").catch(() => {});
    await waitForExit();
    assert.equal(child.exitCode, 0, `unclean ${mode} shutdown\n${output}`);
    assert.equal(existsSync(marker), false);
    console.log(`[restricted-package] OK ${path.basename(executable)} ${mode}: renderer, denied IPC/backend execution, shutdown`);
  } finally {
    ws?.close();
    if (alive()) { child.kill("SIGTERM"); await delay(1000); }
    if (alive()) process.kill(-child.pid, "SIGKILL");
    if (process.env.OMB_KEEP_SMOKE_DIR === "1") console.log(`[restricted-package] kept ${sandbox}\n${output}`);
    else rmSync(sandbox, { recursive: true, force: true });
  }
}
