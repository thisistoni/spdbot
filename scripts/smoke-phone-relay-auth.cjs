// pnpm build:server && pnpm build:companion
// pnpm exec electron scripts/smoke-phone-relay-auth.cjs
// Real Electron children and pairing registry, disposable home, fake engine.
const { app, utilityProcess } = require("electron");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, isAbsolute, join, resolve } = require("node:path");
const { execFileSync } = require("node:child_process");
const { createServer } = require("node:net");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { sourcePurchaseHome } = require("../server/testing/source-purchase-fixture.ts");
const { buildPurchaseServerFixture, attachPurchaseFixtureParent } = require("./testing/purchase-server-fixture.mjs");

const root = resolve(__dirname, "..");
const home = sourcePurchaseHome(join(tmpdir(), "omb-phone-auth-smoke-"));
const nodeDirectory = dirname(execFileSync("node", ["-p", "process.execPath"], { encoding: "utf8", windowsHide: true }).trim());
app.setPath("userData", join(home, "electron"));
const children = [];
let logs = "";
let purchaseError;
const owner = randomBytes(32).toString("base64url");
const relay = randomBytes(32).toString("base64url");
const control = randomBytes(32).toString("base64url");
const controlHeaders = { "x-openmausbot-control-token": control };
async function freePort() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((done) => listener.close(done));
  return port;
}
async function until(check) {
  const deadline = Date.now() + 40_000;
  do {
    if (purchaseError) throw purchaseError;
    const result = await check();
    if (result) return result;
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error("Fixture timed out");
}
async function api(port, path, method = "GET", body, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}
function fork(entry, env) {
  const child = utilityProcess.fork(isAbsolute(entry) ? entry : join(root, entry), [], {
    cwd: root, env, stdio: "pipe",
  });
  children.push(child);
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });
  return child;
}
app.whenReady().then(async () => {
  const ports = new Set();
  while (ports.size < 4) ports.add(await freePort());
  const [harnessPort, webhookPort, phonePort, controlPort] = [...ports];
  writeFileSync(join(home, "config.json"), JSON.stringify({ instances: {
    claude: { driver: "claudeAgent", config: { cli: join(root, "server/testing/fake-claude-cli.ts") } },
  } }));
  const env = {
    HOME: home, USERPROFILE: home, OMB_DATA_DIR: home, PATH: nodeDirectory, OMB_TEST_SEALED_PATH: "1",
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    OMB_PORT: String(harnessPort), OMB_WEBHOOK_PORT: String(webhookPort),
    OMB_COMPANION_PORT: String(phonePort), OMB_CONTROL_PORT: String(controlPort),
    FAKE_CLAUDE_MODE: "happy",
  };
  // The ordinary compiled artifact stays restricted even with the authentic
  // desktop owner capability. Only the separate TEMP bundle below has test pins.
  const restricted = fork("dist-server/index.js", { ...env, OMB_DESKTOP_PARENT: "1" });
  await until(() => api(harnessPort, "/api/health").catch(() => null));
  restricted.postMessage({ type: "openmausbot:desktop-mutation-token", token: owner, companionToken: relay });
  const denied = await until(async () => {
    const response = await api(harnessPort, "/api/bots", "POST", {}, { "x-openmausbot-desktop-owner": owner });
    return response.status !== 403 && response;
  });
  assert.equal(denied.status, 402, JSON.stringify(denied.body));
  assert.equal(denied.body.code, "purchase_access_required");
  const restrictedExited = once(restricted, "exit"); restricted.kill(); await restrictedExited;
  const fixtureEntry = await buildPurchaseServerFixture(home);
  const harness = fork(fixtureEntry, { ...env, OMB_DESKTOP_PARENT: "1" });
  const purchaseFailure = attachPurchaseFixtureParent(harness);
  // Surface a failed proof instead of leaving the smoke waiting for HTTP.
  void purchaseFailure.catch(error => { purchaseError = error; });
  await until(() => api(harnessPort, "/api/health").catch(() => null));
  assert.equal((await api(harnessPort, "/api/bots", "POST", {})).status, 403);
  harness.postMessage({ type: "openmausbot:desktop-mutation-token", token: owner, companionToken: relay });
  const sidecar = fork("scripts/testing/phone-sidecar-fixture.mjs", env);
  // The app hands over the control token at spawn, as Electron main does; the relay credential comes later.
  sidecar.once("spawn", () => sidecar.postMessage({ type: "openmausbot:companion-mutation-token", controlToken: control }));
  await until(() => api(controlPort, "/state", "GET", undefined, controlHeaders).catch(() => null));
  assert.equal((await api(controlPort, "/pairing", "POST")).status, 403, "control needs the app's token");
  const pairing = await api(controlPort, "/pairing", "POST", undefined, controlHeaders);
  assert.equal(pairing.status, 201);
  const paired = await api(phonePort, "/api/pair", "POST", { credential: pairing.body.token, deviceName: "Fixture phone" });
  assert.equal(paired.status, 201);
  const phoneHeaders = { authorization: `Bearer ${paired.body.token}` };
  const phone = (path, method = "GET", body, extra = {}) => api(phonePort, path, method, body, { ...phoneHeaders, ...extra });
  assert.equal((await phone("/api/bots", "POST", {})).status, 503, "bootstrap must fail closed");
  // Reproduce the old relay: marker/device alone cannot authorize a mutation.
  assert.equal((await api(harnessPort, "/api/bots", "POST", {}, {
    "x-openmausbot-companion": "1", "x-openmausbot-companion-device": paired.body.device.id,
  })).status, 403);
  sidecar.postMessage({ type: "openmausbot:companion-mutation-token", token: relay });
  await until(async () => (await phone("/api/bots")).status === 200);
  const created = await phone("/api/bots", "POST", { modelSelection: { instanceId: "claude", model: "claude-sonnet-5" } }, {
    "x-openmausbot-companion-auth": "forged", "x-openmausbot-desktop-owner": "forged",
    "x-openmausbot-companion-device": "forged-device",
  });
  assert.equal(created.status, 201);
  const id = created.body.bot.id;
  assert.equal((await phone(`/api/bots/${id}/read`, "POST", {})).status, 200);
  assert.equal((await phone(`/api/bots/${id}/messages`, "POST", { text: "Hello from the paired phone" })).status, 202);
  const bot = await until(async () => {
    const result = await phone("/api/bots");
    const current = result.body.bots.find((b) => b.id === id);
    return current && !current.busy && current.messages.some((m) => m.text?.includes("hello from fake claude")) && current;
  });
  assert.ok(bot.messages.some((m) => m.text?.includes("Hello from the paired phone")));
  // An app restart must not make an existing phone pair again. The registry
  // persists the phone identity while the private relay credential rotates.
  const sidecarExited = once(sidecar, "exit");
  sidecar.kill();
  await sidecarExited;
  const nextRelay = randomBytes(32).toString("base64url");
  harness.postMessage({ type: "openmausbot:desktop-mutation-token", token: owner, companionToken: nextRelay });
  const restarted = fork("scripts/testing/phone-sidecar-fixture.mjs", env);
  restarted.once("spawn", () => restarted.postMessage({ type: "openmausbot:companion-mutation-token", token: nextRelay, controlToken: control }));
  await until(() => phone("/api/bots").then((r) => r.status === 200).catch(() => false));
  assert.equal((await phone(`/api/bots/${id}/read`, "POST", {})).status, 200);
  assert.equal((await api(phonePort, `/api/bots/${id}/read`, "POST", {})).status, 401);
  assert.equal((await phone("/api/config", "PUT", {})).status, 403);
  assert.equal((await phone("/api/internal/anything", "POST", {})).status, 404);
  assert.equal((await api(controlPort, `/devices/${paired.body.device.id}`, "DELETE", undefined, controlHeaders)).status, 200);
  assert.equal((await phone(`/api/bots/${id}/read`, "POST", {})).status, 401);
  assert.ok((logs.match(/fixture: loopback companion bound/g) ?? []).length >= 2, "both compiled sidecar generations bound only loopback");
  console.log(JSON.stringify({ passed: true, realPairing: true, old403Reproduced: true,
    botCreated: true, readMarked: true, replyVerified: true, forgedHeadersIgnored: true,
    unpairedAndRevokedDenied: true, bootstrapFailsClosed: true, existingPairingAfterRestart: true, controlTokenRequired: true,
    shippingBundleRestricted: true, isolatedPublicTrustBundle: true, loopbackSidecar: true }));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  const evidence = join(tmpdir(), `omb-phone-auth-${Date.now()}.log`);
  writeFileSync(evidence, logs.replaceAll(owner, "[redacted]").replaceAll(relay, "[redacted]").replaceAll(control, "[redacted]"));
  console.log(`Fixture log: ${evidence}`);
  for (const child of children.reverse()) {
    if (!child.pid) continue;
    const exited = once(child, "exit");
    child.kill();
    await Promise.race([exited, delay(5000)]);
  }
  rmSync(home, { recursive: true, force: true });
  app.exit(process.exitCode || 0);
});
