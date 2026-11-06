import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ home: "", packaged: false, hosts: [], start: null, handlers: new Map() }));
vi.mock("electron", () => ({
  app: { get isPackaged() { return fixture.packaged; }, getPath: () => fixture.home, getAppPath: () => fixture.home },
  ipcMain: { handle: (name, handler) => fixture.handlers.set(name, handler) },
}));
vi.mock("@trycua/cua-driver/embedded", () => ({
  EmbeddedCuaDriverHost: class {
    constructor(binary, bundleId) { this.binary = binary; this.bundleId = bundleId; fixture.hosts.push(this); }
    start(options) { return fixture.start(options); }
    stop = vi.fn(async () => {});
    uniffiDestroy = vi.fn();
  },
}));
vi.mock("@trycua/cua-driver/electron", () => { throw new Error("macOS permissions loaded on Windows"); });
vi.mock("node:child_process", () => ({ execFile: vi.fn(() => { throw new Error("unowned launch"); }) }));
vi.mock("node:net", () => ({ default: { createConnection: vi.fn(() => { throw new Error("foreign pipe probed"); }) } }));

let cua;
let localOrigin;
const connection = { socketPath: "\\\\.\\pipe\\fixture-owned-cua" };
beforeEach(async () => {
  fixture.home = mkdtempSync(join(tmpdir(), "omb-cua-win-"));
  fixture.hosts = [];
  fixture.packaged = false;
  fixture.handlers.clear();
  fixture.start = vi.fn(async () => connection);
  vi.stubGlobal("process", new Proxy(process, {
    get(target, key) { return key === "platform" ? "win32" : key === "resourcesPath" ? fixture.home : Reflect.get(target, key); },
  }));
  vi.stubEnv("CUA_DRIVER_PATH", join(fixture.home, "cua-driver.exe"));
  vi.stubEnv("OPENMAUSBOT_CUA_EMBEDDED", "");
  vi.resetModules();
  cua = await import("./cua.mjs");
  localOrigin = (await import("./local-origin.cjs")).default;
  localOrigin.setLocalOrigin("http://127.0.0.1:19777");
});
afterEach(async () => {
  await cua?.stopCua();
  localOrigin.setLocalOrigin(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(fixture.home, { recursive: true, force: true });
});

describe("Windows owned CUA host", () => {
  const event = { senderFrame: { url: "http://127.0.0.1:19777/" } };
  it("fails closed without a purchase guard, including renderer retries", async () => {
    await expect(cua.startCua()).rejects.toMatchObject({ code: "purchase-access-required" });
    cua.registerCuaIpc({ executionAllowed: async () => false });
    for (const channel of ["cua:linux-enable", "cua:linux-retry"]) {
      expect(await fixture.handlers.get(channel)(event)).toMatchObject({ enabled: false, reasonCode: "purchase-access-required" });
    }
    expect(fixture.hosts).toHaveLength(0);
  });

  it("rechecks purchase access after asynchronous retry cleanup", async () => {
    let allowed = true, releaseStop;
    const executionAllowed = async () => allowed;
    await cua.startCua({ executionAllowed });
    fixture.hosts[0].stop.mockImplementationOnce(() => new Promise(resolve => { releaseStop = resolve; }));
    cua.registerCuaIpc({ executionAllowed });
    let retry;
    try {
      retry = fixture.handlers.get("cua:linux-retry")(event);
      await expect.poll(() => typeof releaseStop).toBe("function");
      allowed = false;
    } finally { releaseStop?.(); fixture.hosts[0].stop.mockResolvedValue(); }
    expect(await retry).toMatchObject({ enabled: false, reasonCode: "purchase-access-required" });
    expect(fixture.hosts).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(fixture.home, "cua-connection.json"), "utf8")).mode).toBe("unavailable");
  });

  it("stops a host whose startup completes after access is revoked without publishing it", async () => {
    let allowed = true, finish;
    const published = []; cua.setCuaStateListener(value => published.push(value));
    fixture.start.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const started = cua.startCua({ executionAllowed: async () => allowed });
    const rejected = expect(started).rejects.toMatchObject({ code: "purchase-access-required" });
    await expect.poll(() => fixture.hosts.length).toBe(1);
    allowed = false; finish(connection); await rejected;
    expect(fixture.hosts[0].stop).toHaveBeenCalledOnce();
    expect(published.some(value => value.mode === "embedded")).toBe(false);
  });

  it("uses embedded control even in dev, without a shared pipe or macOS permissions", async () => {
    await expect(cua.startCua({ executionAllowed: async () => true })).resolves.toMatchObject({
      mode: "embedded", ...connection,
      mcpArgs: ["mcp", "--embedded", "--socket", connection.socketPath],
      mcpEnv: { CUA_DRIVER_EMBEDDED: "1", CUA_DRIVER_RS_TELEMETRY_ENABLED: "0" },
    });
    expect(fixture.start.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
    expect(fixture.hosts[0].binary).toBe(process.env.CUA_DRIVER_PATH);
    await cua.stopCua();
    expect(fixture.hosts[0].stop).toHaveBeenCalledOnce();
    expect(fixture.hosts[0].uniffiDestroy).toHaveBeenCalledOnce();
  });

  it("reports a failed host instead of launching or attaching to an unowned daemon", async () => {
    fixture.start.mockRejectedValue(new Error("fixture start failed"));
    await expect(cua.startCua({ executionAllowed: async () => true })).resolves.toMatchObject({
      mode: "unavailable", reason: "embedded host failed: fixture start failed",
    });
    expect(fixture.hosts[0].stop).toHaveBeenCalledOnce();
    expect(fixture.hosts[0].uniffiDestroy).toHaveBeenCalledOnce();
  });

  it("cancels a stalled start when the desktop stops", async () => {
    fixture.start.mockImplementation(({ signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const started = cua.startCua({ executionAllowed: async () => true });
    const rejected = expect(started).rejects.toMatchObject({ name: "AbortError" });
    await expect.poll(() => fixture.hosts.length).toBe(1);
    await cua.stopCua();
    await rejected;
    expect(fixture.hosts[0].stop).toHaveBeenCalledOnce();
    expect(fixture.hosts[0].uniffiDestroy).toHaveBeenCalledOnce();
  });

  it("discards late startup without replacing or stopping the new host", async () => {
    let finish;
    fixture.start.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = cua.startCua({ executionAllowed: async () => true });
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect.poll(() => fixture.hosts.length).toBe(1);
    await cua.stopCua();
    await cua.startCua({ executionAllowed: async () => true });
    finish({ socketPath: "stale-pipe" });
    await rejected;
    expect(fixture.hosts[0].stop).toHaveBeenCalledOnce();
    expect(fixture.hosts[1].stop).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(join(fixture.home, "cua-connection.json"), "utf8")).socketPath).toBe(connection.socketPath);
  });

  it("resolves the staged development executable without installing a foreign driver", () => {
    vi.stubEnv("CUA_DRIVER_PATH", "");
    const stage = join(fixture.home, "dist-native", "cua-win32-x64");
    mkdirSync(stage, { recursive: true });
    writeFileSync(join(stage, "cua-driver.exe"), "inert fixture");
    expect(cua.resolveDriverBinary()).toBe(join(stage, "cua-driver.exe"));
  });

  it("uses the background daemon in packages but leaves the CLI proxy unchanged", () => {
    fixture.packaged = true;
    vi.stubEnv("CUA_DRIVER_PATH", "");
    const cli = join(fixture.home, "cua-driver.exe");
    const background = join(fixture.home, "cua-driver-background.exe");
    writeFileSync(cli, "inert CLI fixture");
    writeFileSync(background, "inert GUI fixture");
    expect(cua.resolveDriverBinary()).toBe(cli);
    expect(cua.resolveEmbeddedDriverBinary(cli)).toBe(background);
  });

  it("fails visibly when a package is incomplete rather than flashing a console", () => {
    fixture.packaged = true;
    vi.stubEnv("CUA_DRIVER_PATH", "");
    expect(() => cua.resolveEmbeddedDriverBinary(join(fixture.home, "cua-driver.exe"))).toThrow("background CUA driver is missing");
  });

  it("preserves custom and development executables", () => {
    const binary = process.env.CUA_DRIVER_PATH;
    expect(cua.resolveEmbeddedDriverBinary(binary)).toBe(binary);
    fixture.packaged = true;
    expect(cua.resolveEmbeddedDriverBinary(binary)).toBe(binary);
    vi.stubEnv("CUA_DRIVER_PATH", "");
    const external = join(fixture.home, "external", "cua-driver.exe");
    expect(cua.resolveEmbeddedDriverBinary(external)).toBe(external);
  });
});
