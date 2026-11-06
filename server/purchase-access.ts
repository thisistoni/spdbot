import { createPublicKey, randomBytes, verify } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { PURCHASE_AUTHORITY, validateAuthority } from "../electron/purchase-authority.mjs";
import { PurchaseClock, type PurchaseClockState } from "../electron/purchase-clock.mjs";
import { deviceThumbprint, usableLease, validateSecurity, verifyToken, type PurchaseAuthority, type PurchaseSecurity } from "../electron/purchase-verifier.mjs";
import { exact, opaque, possessionBytes, publicJwk } from "../electron/purchase-wire.mjs";

type ParentPort = { on(event: "message", listener: (event: { data?: unknown }) => void): void; postMessage(value: unknown): void };
const error = () => Object.assign(new Error("SPDBot verbinden, um Aufgaben auszuführen."), { status: 402, code: "purchase_access_required" });

// Restricted mode is an explicit read allowlist: new GET side effects and new routes fail closed.
export function safePurchaseRequest(method: string, path: string): boolean {
  if (!path.startsWith("/api/")) return true;
  if (method === "POST" && ["/api/auth/logout", "/api/auth/stream-ticket", "/api/workspace-backup/export"].includes(path)) return true;
  if (method === "GET" && (path === "/api/search" || path === "/api/usage.csv" || path === "/api/workspace-backup/status" || /^\/api\/workspace-backup\/download\/[\w-]+$/.test(path))) return true;
  return method === "GET" && (/^\/api\/(?:health|brand|edition|config|auth\/session|bots|groups|sections|events|sync\/changes|instances|models|routines|routine-runs|activity|decisions|usage|workspaces|people)(?:\/[^/]*)?$/.test(path) ||
    /^\/api\/(?:bots|groups)\/[^/]+\/(?:tasks|messages)(?:\/[^/]+(?:\/messages)?)?$/.test(path) ||
    /^\/api\/threads\/[^/]+\/(?:messages(?:\/[^/]+\/(?:file|image))?|job|tree|export)$/.test(path));
}

export class PurchaseGate {
  private readonly authority: PurchaseAuthority;
  private readonly clockOptions?: { wall?: () => number; mono?: () => number };
  private readonly trust: (authority: PurchaseAuthority) => unknown;
  private clock: PurchaseClock;
  private security: PurchaseSecurity | null = null;
  private nonce = randomBytes(32).toString("base64url");
  private authenticated = false;
  private allowed = false;
  private locked = true;
  private serial: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(allowed: boolean) => void>();
  private readonly streams = new Set<ServerResponse | Socket>();
  private ready = false;
  private epoch = 0;
  private deadline = 0;

  constructor({ authority = PURCHASE_AUTHORITY, clockOptions, trust = validateAuthority }: { authority?: PurchaseAuthority; clockOptions?: { wall?: () => number; mono?: () => number }; trust?: (authority: PurchaseAuthority) => unknown } = {}) {
    this.authority = authority; this.clockOptions = clockOptions; this.trust = trust;
    this.clock = new PurchaseClock(null, clockOptions);
    try { this.trust(this.authority); this.ready = true; } catch { /* No trusted authority: restricted. */ }
  }
  challenge() { return { type: "spdbot:purchase-challenge", nonce: this.nonce }; }
  onChange(listener: (allowed: boolean) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private change(allowed: boolean) {
    const previous = this.allowed;
    this.allowed = allowed;
    if (!allowed) for (const stream of this.streams) stream.destroy();
    if (previous !== allowed) for (const listener of this.listeners) listener(allowed);
  }
  clear() { this.epoch++; this.locked = true; this.authenticated = false; this.security = null; this.nonce = randomBytes(32).toString("base64url"); this.change(false); }
  receive(raw: unknown): Promise<void> {
    const epoch = this.epoch;
    const operation = this.serial.then(async () => {
      if (!raw || typeof raw !== "object") throw error();
      const m = raw as Record<string, unknown>;
      if (m.type === "spdbot:purchase-clear") { this.clear(); return; }
      if (m.type === "spdbot:purchase-lock") { this.epoch++; this.locked = true; this.change(false); return; }
      exact(m, ["type", "security", "clock", "nonce", "signature", "public_jwk"]);
      if (!this.ready || !m.security || !m.clock) throw error();
      const nextClock = new PurchaseClock(m.clock as PurchaseClockState, this.clockOptions);
      // Parent cannot reset the child's already observed effective time or signed baseline.
      const before = this.clock.snapshot();
      if (this.security && ((m.clock as PurchaseClockState).greatest < before.greatest - 1 || (m.clock as PurchaseClockState).trusted < before.trusted)) throw error();
      const next = await validateSecurity(m.security, this.authority, nextClock.now());
      if (this.security && (next.binding.principal !== this.security.binding.principal || next.binding.device_id !== this.security.binding.device_id ||
          next.binding.sid !== this.security.binding.sid || next.binding.jkt !== this.security.binding.jkt ||
          next.highest_installed_lease_seq < this.security.highest_installed_lease_seq || next.denial_seq < this.security.denial_seq ||
          next.highest_decision_seq < this.security.highest_decision_seq || next.highest_entitlement_revision < this.security.highest_entitlement_revision)) throw error();
      if (!this.authenticated) {
        if (m.type !== "spdbot:purchase-init" || m.nonce !== this.nonce || !opaque(m.nonce) || typeof m.signature !== "string" || !/^[A-Za-z0-9_-]{86}$/.test(m.signature) ||
            Buffer.from(m.signature, "base64url").toString("base64url") !== m.signature) throw error();
        const key = publicJwk(m.public_jwk);
        if (!next.lease || await deviceThumbprint(key) !== next.binding.jkt || !verify(null, possessionBytes(this.nonce, next.lease),
          createPublicKey({ key, format: "jwk" }), Buffer.from(m.signature, "base64url"))) throw error();
      } else if (m.type !== "spdbot:purchase-update") throw error();
      // Verify the signed baseline independently; unsigned clock fields cannot advance trusted time.
      const observation = await verifyToken(next.observedStatus, "status", this.authority, next.binding, nextClock.now(), { historical: true });
      const baseline = await verifyToken(next.trustedStatus, "status", this.authority, next.binding, nextClock.now(), { historical: true });
      if (this.security && next.observedStatus !== this.security.observedStatus) await verifyToken(next.observedStatus, "status", this.authority, next.binding, nextClock.now());
      if ((m.clock as PurchaseClockState).trusted !== baseline.iat || observation.iat > baseline.iat) throw error();
      if (epoch !== this.epoch) throw error();
      this.authenticated = true; this.locked = false; this.nonce = ""; this.security = next; this.clock = nextClock;
      await this.check();
    });
    this.serial = operation.catch(() => { this.locked = true; this.change(false); });
    return operation;
  }
  async check(): Promise<boolean> {
    const epoch = this.epoch;
    const security = this.security;
    const now = this.clock.now();
    if (!this.ready || this.locked || !this.authenticated || this.clock.rollback) { this.change(false); return false; }
    try {
      const lease = await usableLease(security, this.authority, now);
      if (epoch !== this.epoch || security !== this.security || this.locked) return false;
      const currentTime = this.clock.now();
      this.deadline = Math.min(lease.exp, security!.binding.session_expires);
      if (this.clock.rollback || currentTime >= this.deadline) { this.change(false); return false; }
      this.change(true); return true;
    }
    catch { this.change(false); return false; }
  }
  async assert(): Promise<void> { if (!(await this.check())) throw error(); }
  allowedNow(): boolean {
    const now = this.clock.now();
    if (!this.allowed || this.locked || this.clock.rollback || now >= this.deadline) { this.change(false); return false; }
    return true;
  }
  assertNow(): void { if (!this.allowedNow()) throw error(); }
  async admit(req: IncomingMessage, res: ServerResponse, path: string, method: string): Promise<boolean> {
    const allowed = await this.check();
    if (!allowed && !safePurchaseRequest(method, path)) {
      res.writeHead(402, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "SPDBot verbinden, um Aufgaben auszuführen.", code: "purchase_access_required" }));
      return false;
    }
    if (allowed && (path === "/api/events" || req.headers.upgrade)) {
      const stream = req.headers.upgrade ? req.socket : res;
      this.streams.add(stream); stream.once("close", () => this.streams.delete(stream));
      if (req.headers.upgrade) {
        const emit = req.socket.emit;
        req.socket.emit = new Proxy(emit, { apply: (target, receiver, args) => {
          if (args[0] === "data" && !this.allowedNow()) { req.socket.destroy(); return false; }
          return Reflect.apply(target, receiver, args);
        } });
      } else {
        res.write = new Proxy(res.write, { apply: (target, receiver, args) => {
          if (!this.allowedNow()) { res.destroy(); return false; }
          return Reflect.apply(target, receiver, args);
        } });
      }
    }
    return true;
  }
  attach(port: ParentPort | undefined) {
    if (!port) return;
    port.on("message", event => {
      const m = event.data as { type?: unknown } | undefined;
      if (typeof m?.type !== "string" || !m.type.startsWith("spdbot:purchase-")) return;
      void this.receive(m).then(() => {
        if (m.type === "spdbot:purchase-clear") port.postMessage(this.challenge());
      }, () => { /* Never log signed tokens or private channel payloads. */ });
    });
    port.postMessage(this.challenge());
  }
}

// Every standalone backend/CLI starts restricted; only a private Electron parent can supply possession.
export const purchaseAccess = new PurchaseGate();
purchaseAccess.attach((process as NodeJS.Process & { parentPort?: ParentPort }).parentPort);
const timer = setInterval(() => { void purchaseAccess.check(); }, 250);
timer.unref();
