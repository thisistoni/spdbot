import { createPrivateKey, sign } from "node:crypto";
import { createServer, ServerResponse } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { describe, expect, it } from "vitest";
import { PurchaseGate, safePurchaseRequest } from "./purchase-access.ts";
import { purchaseProvider } from "./purchase-provider.ts";
import { guardPurchaseRoutines, installPurchaseRuntime } from "./purchase-runtime.ts";
import { guardPurchaseBackground } from "./purchase-background.ts";
import { RoutineManager } from "./routines.ts";
import { makeFakeDriver } from "./testing/fake-driver.ts";
import { applyDecision, emptySecurity, type PurchaseSecurity } from "../electron/purchase-verifier.mjs";
import { possessionBytes } from "../electron/purchase-wire.mjs";
// @ts-expect-error Test-only JavaScript authority is deliberately outside shipping TypeScript entries.
import { authority, claims, corpus, freshClock, signToken, trust } from "../electron/testing/purchase/fake-authority.mjs";

const fixture = async () => {
  const clock = freshClock();
  const gate = new PurchaseGate({ authority, trust, clockOptions: clock.options });
  const binding = { principal: corpus.context.principal, sid: corpus.context.sid, device_id: corpus.context.device_id, jkt: corpus.context.jkt, session_expires: corpus.now + 2592000 };
  const access_status = await signToken({ ...claims(corpus.decisions.restored_status), lease_seq: 42, entitlement_revision: 3 }, "status");
  const { security } = await applyDecision(emptySecurity(binding), { access_status, offline_lease: corpus.lease_cases[0].jwt }, authority, corpus.now);
  const bundle = (s = security) => ({ security: s, clock: { greatest: Math.floor(clock.time.wall), trusted: corpus.now } });
  const init = (s = security) => {
    const nonce = gate.challenge().nonce;
    return { type: "spdbot:purchase-init", nonce, ...bundle(s), public_jwk: corpus.keys.device,
      signature: sign(null, possessionBytes(nonce, s.lease!), createPrivateKey({ key: corpus.keys.online, format: "jwk" })).toString("base64url") };
  };
  return { clock, gate, security, bundle, init };
};

describe("independent backend purchase authority", () => {
  it("attaches once to its private parent without reissuing an accepted challenge", async () => {
    const f = await fixture();
    const listeners: Array<(event: { data?: unknown }) => void> = [];
    const messages: unknown[] = [];
    const port = {
      on(_event: "message", listener: (event: { data?: unknown }) => void) { listeners.push(listener); },
      postMessage(value: unknown) { messages.push(value); },
    };
    f.gate.attach(undefined);
    f.gate.attach(port);
    expect(messages).toEqual([f.gate.challenge()]);
    await f.gate.receive(f.init());
    f.gate.attach(port);
    expect(listeners).toHaveLength(1);
    expect(messages).toHaveLength(1);
    expect(await f.gate.check()).toBe(true);
    expect(() => f.gate.attach({ ...port })).toThrow("already has a private parent");
    expect(await f.gate.check()).toBe(true);
  });
  it("rejects standalone and copied leases without nonce/key possession; startup is one-use", async () => {
    expect(await new PurchaseGate().check()).toBe(false);
    const f = await fixture();
    await expect(f.gate.assert()).rejects.toMatchObject({ status: 402 });
    await expect(f.gate.receive({ ...f.init(), signature: "A".repeat(86) })).rejects.toThrow();
    await expect(f.gate.receive({ ...f.init(), public_jwk: { ...corpus.keys.device, d: corpus.keys.online.d } })).rejects.toThrow();
    const init = f.init(); await f.gate.receive(init); expect(await f.gate.check()).toBe(true);
    await expect(f.gate.receive(init)).rejects.toThrow(); expect(await f.gate.check()).toBe(false);
  });
  it("checks signature, environment, key, principal and watermarks again on private updates", async () => {
    for (const index of [1, 3, 5, 6, 7, 8, 17, 18, 19]) {
      const f = await fixture(); await f.gate.receive(f.init());
      await expect(f.gate.receive({ type: "spdbot:purchase-update", ...f.bundle({ ...f.security, lease: corpus.lease_cases[index].jwt }) })).rejects.toThrow();
      expect(await f.gate.check()).toBe(false);
    }
  });
  it("honors denial after restart and restores only a newer matching pair", async () => {
    const f = await fixture(); await f.gate.receive(f.init());
    const denied = (await applyDecision(f.security, { access_status: corpus.decisions.denial }, authority, corpus.now)).security;
    await f.gate.receive({ type: "spdbot:purchase-update", ...f.bundle(denied) }); expect(await f.gate.check()).toBe(false);
    const newGate = new PurchaseGate({ authority, trust, clockOptions: f.clock.options });
    const nonce = newGate.challenge().nonce;
    await newGate.receive({ ...f.init(denied), nonce, signature: sign(null, possessionBytes(nonce, denied.lease!), createPrivateKey({ key: corpus.keys.online, format: "jwk" })).toString("base64url") });
    expect(await newGate.check()).toBe(false);
    const observed = (await applyDecision(denied, { access_status: corpus.decisions.restored_status }, authority, corpus.now)).security;
    await newGate.receive({ type: "spdbot:purchase-update", ...f.bundle(observed) }); expect(await newGate.check()).toBe(false);
    const restored = (await applyDecision(observed, { access_status: corpus.decisions.restored_status, offline_lease: corpus.decisions.restored_lease }, authority, corpus.now)).security;
    await newGate.receive({ type: "spdbot:purchase-update", ...f.bundle(restored) }); expect(await newGate.check()).toBe(true);
    await expect(newGate.receive({ type: "spdbot:purchase-update", ...f.bundle(f.security) })).rejects.toThrow();
  });
  it("preserves installed lease after active-only observation and refuses clock rollback/expiry", async () => {
    const f = await fixture(); await f.gate.receive(f.init());
    const observed = (await applyDecision(f.security, { access_status: corpus.decisions.restored_status }, authority, corpus.now)).security;
    await f.gate.receive({ type: "spdbot:purchase-update", ...f.bundle(observed) }); expect(await f.gate.check()).toBe(true);
    f.clock.advance(259200); expect(f.gate.allowedNow()).toBe(false); expect(await f.gate.check()).toBe(false);
    f.clock.time.wall -= 259200; expect(await f.gate.check()).toBe(false);
  });
  it("persists a newer denial even when the authority time moves backward slightly", async () => {
    const f = await fixture(); await f.gate.receive(f.init());
    const access_status = await signToken({ ...claims(corpus.decisions.denial), iat: corpus.now - 1, exp: corpus.now + 299 }, "status");
    const denied = (await applyDecision(f.security, { access_status }, authority, corpus.now)).security;
    await f.gate.receive({ type: "spdbot:purchase-update", ...f.bundle(denied) });
    expect(await f.gate.check()).toBe(false);
    expect(denied.denial_seq).toBe(43);
    const restarted = await fixture();
    await restarted.gate.receive(restarted.init(denied));
    expect(await restarted.gate.check()).toBe(false);
  });
  for (const cause of ["expiry", "denial"]) it(`closes an open SSE/WS on ${cause} and refuses further frames`, async () => {
    const f = await fixture(); await f.gate.receive(f.init());
    const ws = new WebSocketServer({ noServer: true }); let sideEffects = 0;
    ws.on("connection", socket => socket.on("message", () => { sideEffects++; }));
    const server = createServer(async (req, res) => {
      if (!(await f.gate.admit(req, res, "/api/events", "GET"))) return;
      res.writeHead(200, { "content-type": "text/event-stream" }); res.write("data: ready\n\n");
    });
    server.on("upgrade", (req, socket, head) => {
      void f.gate.admit(req, new ServerResponse(req), "/api/browser/ws", "GET").then(allowed => {
        if (allowed) ws.handleUpgrade(req, socket, head, peer => ws.emit("connection", peer, req));
      });
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("address");
    const url = `http://127.0.0.1:${address.port}`;
    const stream = await fetch(url); const reader = stream.body!.getReader(); await reader.read();
    const socket = new WebSocket(url.replace("http:", "ws:")); await once(socket, "open");
    try {
      socket.send("before"); await new Promise(resolve => setTimeout(resolve, 20)); expect(sideEffects).toBe(1);
      const closed = once(socket, "close");
      if (cause === "expiry") { f.clock.advance(259200); socket.send("after"); }
      else {
        const denied = (await applyDecision(f.security, { access_status: corpus.decisions.denial }, authority, corpus.now)).security;
        await f.gate.receive({ type: "spdbot:purchase-update", ...f.bundle(denied) });
      }
      await closed; expect(sideEffects).toBe(1);
      await expect(reader.read()).rejects.toThrow();
    } finally { socket.terminate(); await reader.cancel().catch(() => {}); ws.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  for (const cause of ["expiry", "rollback"]) it(`dispatches nothing when ${cause} occurs during lease verification`, async () => {
    const f = await fixture(); await f.gate.receive(f.init()); const fake = makeFakeDriver();
    const instance = await fake.driver.create({ instanceId: "fixture", displayName: "Fixture", enabled: true, environment: {}, config: {} });
    let calls = 0;
    instance.adapter.sendTurn = async () => { calls++; return { turnId: "must-not-start" }; };
    const guarded = purchaseProvider(instance, f.gate);
    const attempt = guarded.adapter.sendTurn({} as never);
    if (cause === "expiry") f.clock.advance(259200); else f.clock.time.wall -= 3600;
    await expect(attempt).rejects.toMatchObject({ status: 402 });
    expect(calls).toBe(0); await guarded.dispose();
  });
  it("stops a provider dispatch crossing expiry and guards background calls and steering", async () => {
    const f = await fixture(); await f.gate.receive(f.init()); const fake = makeFakeDriver();
    const instance = await fake.driver.create({ instanceId: "fixture", displayName: "Fixture", enabled: true, environment: {}, config: {} });
    let stopped = 0; instance.adapter.stopAll = async () => { stopped++; };
    instance.adapter.sendTurn = async () => { f.clock.advance(259200); return { turnId: "test" }; };
    const guarded = purchaseProvider(instance, f.gate);
    await expect(guarded.adapter.sendTurn({} as never)).rejects.toMatchObject({ status: 402 });
    expect(stopped).toBeGreaterThan(0);
    await expect(guarded.adapter.sendTurn({} as never)).rejects.toMatchObject({ status: 402 });
    await guarded.dispose();
  });
  for (const cause of ["expiry", "denial"]) it(`blocks routines while restricted, stops a running routine on ${cause} and keeps its definition`, async () => {
    const f = await fixture(); const dir = mkdtempSync(join(tmpdir(), "spd-purchase-routine-"));
    let dispatched = 0;
    const manager = new RoutineManager({ file: join(dir, "routines.json"), now: () => f.clock.time.wall * 1000, botState: () => "ready", createTask: () => ({ threadId: "fixture-thread" }),
      startTurn: async () => { dispatched++; } });
    guardPurchaseRoutines(manager, f.gate);
    installPurchaseRuntime({ routines: () => manager, restrict: () => {} }, f.gate);
    try {
      const routine = manager.create({ name: "fixture", prompt: "fixture", botId: "fixture", schedule: { type: "once", at: f.clock.time.wall * 1000 + 100000 }, runOn: "maus", target: "bot", durationMinutes: 10 } as never);
      expect(() => manager.runNow(routine.id)).toThrow(); expect(dispatched).toBe(0);
      await f.gate.receive(f.init()); const run = manager.runNow(routine.id); await manager.tick();
      expect(dispatched).toBeGreaterThan(0);
      if (cause === "expiry") { f.clock.advance(259200); await f.gate.check(); }
      else {
        const denied: PurchaseSecurity = (await applyDecision(f.security, { access_status: corpus.decisions.denial }, authority, corpus.now)).security;
        await f.gate.receive({ type: "spdbot:purchase-update", ...f.bundle(denied) });
      }
      expect(manager.listRuns().find(r => r.id === run!.id)?.status).toBe("cancelled");
      expect(manager.listRoutines()).toHaveLength(1); expect(() => manager.runNow(routine.id)).toThrow();
    } finally { manager.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it("uses an explicit read allowlist for HTTP/WS/MCP/CLI paths", () => {
    for (const [method, path] of [["POST", "/api/bots"], ["POST", "/api/bots/id/send"], ["POST", "/api/internal/mcp"], ["POST", "/api/routines/id/run"], ["GET", "/api/browser/live"], ["GET", "/api/computer/ws"], ["PUT", "/api/config"]]) expect(safePurchaseRequest(method, path)).toBe(false);
    for (const path of ["/api/bots", "/api/bots/id/tasks", "/api/bots/id/messages", "/api/groups/id/messages", "/api/health", "/api/config"]) expect(safePurchaseRequest("GET", path)).toBe(true);
  });
  it("defers background startup and resumes it only after verified access", async () => {
    const f = await fixture(); let starts = 0, stops = 0;
    const service = { start() { starts++; }, stop() { stops++; } };
    guardPurchaseBackground(service, f.gate); service.start(); expect(starts).toBe(0);
    await f.gate.receive(f.init()); expect(starts).toBe(1);
    const denied = (await applyDecision(f.security, { access_status: corpus.decisions.denial }, authority, corpus.now)).security;
    await f.gate.receive({ type: "spdbot:purchase-update", ...f.bundle(denied) }); expect(stops).toBe(1);
    const restored = (await applyDecision(denied, { access_status: corpus.decisions.restored_status, offline_lease: corpus.decisions.restored_lease }, authority, corpus.now)).security;
    await f.gate.receive({ type: "spdbot:purchase-update", ...f.bundle(restored) }); expect(starts).toBe(2);
    service.stop(); f.gate.clear(); expect(stops).toBeGreaterThan(1);
  });
});
