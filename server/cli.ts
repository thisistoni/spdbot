// `spdbot` on the command line: run the server anywhere and pair devices to it.
//
//   spdbot setup [--data-dir ~/.spdbot]
//   spdbot start [serve options]
//   spdbot serve [--port 8899] [--data-dir ~/.spdbot] [--label "cab mini"]
//                     [--public-url https://host] [--tailscale | --tunnel | --domain HOST] [--no-pair]
//   spdbot pair  [--label "My MacBook"] [--client] [--public-url https://host]
//   spdbot sessions [revoke <id>]
//   spdbot status
//   spdbot login [--email you@example.com]
//   spdbot logout
//   spdbot run | send | wait | doctor | team apply | export | …
//
// This module only exports: spdbot.ts runs main(), so bundling this file into other entries never runs it twice.
import { discoverCliPort, probeLocalProduct } from "./cli-discovery.ts";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { phonePairingLink } from "../shared/pairing-link.ts";
import { parseAllowList } from "./account-signin.ts";
import { appendAdminAction, flushAdminActivity, sharedSignIn } from "./admin-activity.ts";
import { bindDecisionRetention, decisionRetentionDays } from "./decision-log.ts";
import { hostedWorkspaceConfigured } from "./enterprise.ts";
import { resolveLoopbackTrust } from "./request-auth.ts";
import { restartPolicy } from "./restart.ts";
import { writeFileAtomic } from "./atomic.ts";
import { ensureCaddy, normalizeDomainOption, startCaddy, type RunningCaddy } from "./caddy.ts";
import { runServiceCommand } from "./service-cli.ts";
import { runSentinelCli } from "./sentinel/cli.ts";
import { runFleetCommand, type FleetInput } from "./fleet-cli.ts";
import { startFleetAgent } from "./fleet-agent.ts";
import { fleetLayout } from "./fleet.ts";
import { explainTailscaleFailure, tailscaleServe, tailscaleServeOff, tailscaleStatus, type TailscaleStatus } from "./tailscale.ts";
import { defaultSetupIo, SetupCancelled, type SetupIo } from "./cli-prompts.ts";
import { HEADLESS_VERB_NAMES, USAGE } from "./cli-usage.ts";
import { normalizePhoneOrigin, phonePairingInstructions, runPhoneSetup } from "./cli-phone-setup.ts";
import { browserSignInLines, pairingBlock } from "./cli-pairing.ts";
import type { AppConfig } from "./config.ts";
import {
  cleanupTunnelOrigin,
  createTunnelAccount,
  createTunnelOrigin,
  describeTunnelAccount,
  describeTunnelState,
  ensureCloudflared,
  FLEET_CREDENTIAL_ENV,
  fleetAccess,
  fleetCredential,
  guardianEntry,
  startTunnel,
  tunnelAccess,
  type CompanionOriginEndpoint,
  type ManagedTunnelAccess,
  type RunningTunnel,
  type TunnelAccount,
  type TunnelRecovery,
} from "./tunnel.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

export interface CliOptions {
  command: "setup" | "start" | "serve" | "pair" | "sessions" | "status" | "login" | "logout" | "access" | "service" | "browser" | "fleet" | "help";
  port: number;
  dataDir: string;
  label?: string;
  publicUrl?: string;
  /** `serve --domain host`: HTTPS on your own domain through a managed Caddy. */
  domain?: string;
  tailscale: boolean;
  tunnel: boolean;
  client: boolean;
  pair: boolean;
  revoke?: string;
  /** `access list|add|remove` */
  accessAction?: "list" | "add" | "remove";
  chatOnly?: boolean;
  /** `service install|uninstall` */
  serviceAction?: "install" | "uninstall";
  sentinel?: boolean;
  email?: string;
  /** `browser install [--with-deps]` */
  browserAction?: "install" | "status";
  /** `fleet init|create|list|users|suspend|resume|delete|upgrade|agent` */
  fleetAction?: FleetInput["action"] | "agent";
  operator?: string;
  socket?: string;
  group?: string;
  slug?: string;
  admins?: string[];
  members?: string[];
  brandFile?: string;
  anthropicKeyFile?: string;
  cap?: number;
  licenseKey?: string;
  memory?: string;
  dryRun?: boolean;
  yes?: boolean;
  keepData?: boolean;
  fleetUserAction?: "add" | "remove";
  withDeps?: boolean;
  json: boolean;
  /** Explicitly ignore saved remote access for this launch. */
  local?: boolean;
  open?: boolean;
  guided?: boolean;
  phone?: "ios" | "android";
}

const COMMANDS = ["setup", "start", "serve", "pair", "sessions", "status", "login", "logout", "access", "service", "browser", "fleet", "help", "--help", "-h"];

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliOptions | { error: string } {
  const implicitStart = !argv.length || (argv[0]!.startsWith("--") && argv[0] !== "--help");
  const [command = "start", ...rest] = implicitStart ? ["start", ...argv] : argv;
  if (!COMMANDS.includes(command)) {
    return { error: `unknown command "${command}"` };
  }
  const options: CliOptions = {
    command: command === "--help" || command === "-h" ? "help" : (command as CliOptions["command"]),
    port: Number(env.OMB_PORT || 8899),
    dataDir: env.OMB_DATA_DIR || join(homedir(), ".spdbot"),
    tailscale: false,
    tunnel: false,
    client: false,
    pair: true,
    withDeps: false,
    json: false,
    chatOnly: false,
  };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const value = () => {
      const v = rest[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`${arg} needs a value`);
      i += 1;
      return v;
    };
    try {
      if (arg === "--port") options.port = Number(value());
      else if (arg === "--data-dir") options.dataDir = resolve(value());
      else if (arg === "--label") options.label = value();
      else if (arg === "--public-url") options.publicUrl = value().replace(/\/+$/, "");
      else if (arg === "--tailscale") options.tailscale = true;
      else if (arg === "--domain") {
        const domain = normalizeDomainOption(value());
        if (typeof domain !== "string") return domain;
        options.domain = domain;
      }
      else if (arg === "--tunnel") options.tunnel = true;
      else if (arg === "--client") options.client = true;
      // Which phone will scan, for runs nobody types into; only Android needs a different QR.
      else if (arg === "--phone") {
        const kind = value().toLowerCase();
        if (kind !== "ios" && kind !== "android") return { error: "--phone takes ios or android" };
        options.phone = kind;
      }
      else if (arg === "--no-pair") options.pair = false;
      else if (arg === "--no-open") options.open = false;
      else if (arg === "--local") options.local = true;
      else if (arg === "--json") options.json = true;
      else if (arg === "--email") options.email = value();
      else if (options.command === "sessions" && arg === "revoke") options.revoke = value();
      else if (options.command === "access" && !options.accessAction && (arg === "list" || arg === "add" || arg === "remove")) {
        options.accessAction = arg;
        if (arg !== "list") options.email = value();
      } else if (options.command === "access" && arg === "--chat-only") options.chatOnly = true;
      else if (options.command === "service" && !options.serviceAction && (arg === "install" || arg === "uninstall")) options.serviceAction = arg;
      else if (options.command === "service" && arg === "--sentinel") options.sentinel = true;
      else if (options.command === "browser" && (arg === "install" || arg === "status")) options.browserAction = arg;
      else if (options.command === "browser" && arg === "--with-deps") options.withDeps = true;
      else if (options.command === "fleet" && !options.fleetAction && ["init", "create", "list", "users", "suspend", "resume", "delete", "upgrade", "agent"].includes(arg)) options.fleetAction = arg as FleetInput["action"] | "agent";
      else if (options.command === "fleet" && options.fleetAction && !["init", "list", "upgrade", "agent"].includes(options.fleetAction) && !options.slug && !arg.startsWith("--")) options.slug = arg;
      else if (options.command === "fleet" && arg === "--operator") options.operator = value();
      else if (options.command === "fleet" && arg === "--socket") options.socket = value();
      else if (options.command === "fleet" && arg === "--group") options.group = value();
      else if (options.command === "fleet" && options.fleetAction === "users" && options.slug && !options.fleetUserAction && (arg === "add" || arg === "remove")) { options.fleetUserAction = arg; options.email = value(); }
      else if (options.command === "fleet" && arg === "--admin") options.admins = [...(options.admins ?? []), value()];
      else if (options.command === "fleet" && arg === "--member") options.members = [...(options.members ?? []), value()];
      else if (options.command === "fleet" && arg === "--brand") options.brandFile = resolve(value());
      else if (options.command === "fleet" && arg === "--anthropic-key-file") options.anthropicKeyFile = resolve(value());
      else if (options.command === "fleet" && arg === "--cap") options.cap = Number(value());
      else if (options.command === "fleet" && arg === "--license-key") options.licenseKey = value();
      else if (options.command === "fleet" && arg === "--memory") options.memory = value();
      else if (options.command === "fleet" && arg === "--dry-run") options.dryRun = true;
      else if (options.command === "fleet" && arg === "--yes") options.yes = true;
      else if (options.command === "fleet" && arg === "--keep-data") options.keepData = true;
      else if (options.command === "fleet" && arg === "--chat-only") options.chatOnly = true;
      else return { error: `unknown argument "${arg}"` };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65_535) return { error: "--port must be 1-65535" };
  if (options.publicUrl && !/^https?:\/\//.test(options.publicUrl)) return { error: "--public-url must start with http:// or https://" };
  if (options.tailscale && options.tunnel) return { error: "choose one of --tailscale (your tailnet) and --tunnel (a public address)" };
  if (options.command === "access" && !options.accessAction) return { error: "access needs one of: list, add EMAIL [--chat-only], remove EMAIL" };
  if (options.command === "service" && !options.serviceAction) return { error: "service needs one of: install [the same options as serve], uninstall" };
  if (options.domain && (options.tailscale || options.tunnel || options.publicUrl)) return { error: "--domain already gives the server its address; drop --tailscale, --tunnel and --public-url" };
  if (options.local && (options.tailscale || options.tunnel || options.publicUrl)) return { error: "--local cannot be combined with a remote-access option" };
  if (options.command === "browser" && !options.browserAction) return { error: "browser needs an action: install or status" };
  if (options.command === "fleet") {
    if (!options.fleetAction) return { error: "fleet needs one of: init --domain HOST [--operator USER], create NAME --admin EMAIL, list, users NAME add|remove EMAIL, suspend NAME, resume NAME, delete NAME --yes, upgrade, agent" };
    if (["create", "users", "suspend", "resume", "delete"].includes(options.fleetAction) && !options.slug) return { error: `fleet ${options.fleetAction} needs a workspace name` };
    if (options.fleetAction === "users" && !options.fleetUserAction) return { error: "fleet users needs: NAME add|remove EMAIL [--chat-only]" };
    if (options.cap !== undefined && (!Number.isFinite(options.cap) || options.cap < 0)) return { error: "--cap must be a dollar amount of 0 or more" };
  }
  return options;
}

export interface CliIo {
  log(line: string): void;
  error(line: string): void;
  ask(question: string): Promise<string>;
}

export function defaultIo(): CliIo {
  return {
    log: (line) => console.log(line),
    error: (line) => console.error(line),
    ask: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
  };
}

export function serverVersion(here = HERE): string {
  try {
    const parsed: unknown = JSON.parse(readFileSync(resolve(here, "..", "package.json"), "utf8"));
    const version = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "version") : undefined;
    return typeof version === "string" && version ? version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** On a service-trust server: the secret `serve` handed the server it started, which opens its pairing route. */
let serveOwnerToken: string | undefined;

async function api(port: number, path: string, init: { method?: string; body?: string } = {}): Promise<{ status: number; body: any }> {
  // x-openmausbot-cli names the tool in the activity log; on loopback it grants nothing.
  const headers: Record<string, string> = { "content-type": "application/json", "x-openmausbot-cli": "1", ...(serveOwnerToken ? { "x-openmausbot-cli-owner": serveOwnerToken } : {}) };
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: init.method, body: init.body, headers, signal: AbortSignal.timeout(3000) });
  const body: unknown = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export const SERVICE_TRUST_HELP = "Dieser Server behandelt Befehle auf diesem Computer nicht als Eigentümerzugriff (OMB_LOOPBACK_TRUST=service oder gehosteter Arbeitsbereich). Deshalb können sie keine Geräte koppeln oder Sitzungen auflisten. Melde dich als Admin an und verwende Einstellungen → Fernzugriff, erlaube die Anmeldung per E-Mail (pnpm spdbot access add du@example.com) oder starte den Server bewusst mit OMB_LOOPBACK_TRUST=owner neu.";

function refusedAsService(status: number, body: any): boolean {
  return status === 403 && typeof body?.error === "string" && /shared server|Sign in through the workspace portal/.test(body.error);
}

const serverUp = (port: number, pid?: number) => probeLocalProduct(api, port, pid);

/** Never attach to another workspace just because it listens on the requested port. */
export async function isWorkspaceRunning(options: CliOptions): Promise<boolean> {
  try {
    const { status, body } = await api(options.port, "/api/health");
    if (status !== 200 || body?.app !== "spdbot") return false;
    const expected = readFileSync(join(options.dataDir, "environment-id"), "utf8").trim();
    const descriptor = await api(options.port, "/.well-known/spdbot/environment");
    return /^[0-9a-f-]{36}$/i.test(expected) && descriptor.status === 200 && descriptor.body?.environmentId === expected;
  } catch { return false; }
}

/** No shell commands, credentials or remote URLs go to the OS URL opener. */
export async function openDashboard(port: number, env = process.env): Promise<boolean> {
  if (env.SSH_CONNECTION || env.SSH_TTY || (process.platform === "linux" && !env.DISPLAY && !env.WAYLAND_DISPLAY)) return false;
  const url = `http://127.0.0.1:${port}`;
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32.exe" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  return new Promise((done) => {
    const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
    const timer = setTimeout(() => { child.kill(); done(false); }, 3000);
    child.once("error", () => { clearTimeout(timer); done(false); });
    child.once("exit", (code) => { clearTimeout(timer); done(code === 0); });
  });
}

/** Its public descriptor must identify this exact server; never sends a pairing code or credential. */
export async function verifyPhoneEndpoint(port: number, origin: string): Promise<boolean> {
  if (!normalizePhoneOrigin(origin)) return false;
  try {
    const local = await api(port, "/.well-known/spdbot/environment");
    const remote = await fetch(`${origin}/.well-known/spdbot/environment`, { signal: AbortSignal.timeout(5000), redirect: "error" });
    if (local.status !== 200 || !remote.ok) return false;
    const descriptor = await remote.json() as { environmentId?: unknown };
    return typeof local.body?.environmentId === "string" && local.body.environmentId.length > 0
      && descriptor.environmentId === local.body.environmentId;
  } catch { return false; }
}

export function applyStartupPreferences(options: CliOptions, saved: AppConfig["cliStartup"]): CliOptions {
  if (options.local) return { ...options, tunnel: false, tailscale: false, publicUrl: undefined, phone: undefined };
  if (!saved || options.tunnel || options.tailscale || options.publicUrl) return options;
  if (saved.access === "public-url" && (!saved.publicUrl || !normalizePhoneOrigin(saved.publicUrl))) {
    throw new Error("Die gespeicherte Telefonadresse ist kein gültiger HTTPS-Ursprung. Korrigiere sie mit pnpm spdbot setup oder starte mit pnpm spdbot --local nur auf diesem Computer.");
  }
  return {
    ...options,
    tunnel: saved.access === "tunnel", tailscale: saved.access === "tailscale",
    publicUrl: saved.access === "public-url" ? saved.publicUrl : undefined,
    phone: saved.access === "local" ? undefined : saved.phone,
  };
}

function startupPreferences(options: CliOptions): NonNullable<AppConfig["cliStartup"]> {
  const access = options.local ? "local" : options.tunnel ? "tunnel" : options.tailscale ? "tailscale" : options.publicUrl ? "public-url" : "local";
  const publicUrl = access === "public-url" ? normalizePhoneOrigin(options.publicUrl!) : null;
  if (access === "public-url" && !publicUrl) throw new Error("Verwende für gespeicherten Telefonzugriff einen HTTPS-Ursprung ohne Passwort, Pfad oder Suchparameter. Die Adresse wurde nicht gespeichert.");
  return {
    access,
    ...(publicUrl ? { publicUrl } : {}),
    ...(!options.local && options.phone ? { phone: options.phone } : {}),
  };
}

async function showPhonePairing(options: CliOptions, origin: string | undefined, log: (line: string) => void): Promise<boolean> {
  const ready = !!origin && await verifyPhoneEndpoint(options.port, origin);
  if (!ready) {
    log("Der Telefonzugriff ist noch nicht erreichbar. SPDBot ist auf diesem Computer bereit; es wurde kein Kopplungscode für das Telefon erstellt.");
    log("Prüfe die HTTPS-Verbindung und rufe dann pnpm spdbot pair erneut mit demselben --data-dir und --port auf.");
    return false;
  }
  for (const line of phonePairingInstructions(options.phone ?? "ios", { origin: origin!, ready })) log(line);
  log(await mintPairing(options.port, { client: true, label: options.label ?? (options.phone === "android" ? "Android" : "iPhone / iPad"), publicUrl: origin, phone: options.phone }));
  log("Warte auf deine Verbindung vom Telefon. Halte dieses Terminal und den Code privat.");
  return true;
}

async function mintPairing(port: number, options: { label?: string; client?: boolean; publicUrl?: string; phone?: "ios" | "android"; guided?: boolean }): Promise<string> {
  const request: { label?: string; scopes?: string[] } = {};
  if (options.label) request.label = options.label;
  if (options.client) request.scopes = ["client"];
  const { status, body } = await api(port, "/api/auth/pairing", { method: "POST", body: JSON.stringify(request) });
  if (refusedAsService(status, body)) throw new Error(SERVICE_TRUST_HELP);
  if (status !== 200) throw new Error(`Der Server hat das Erstellen eines Kopplungscodes abgelehnt: ${typeof body?.error === "string" ? body.error : status}`);
  const url = options.publicUrl ? `${options.publicUrl}/pair#code=${body.code}` : typeof body.url === "string" ? body.url : null;
  const invite = (options.publicUrl && typeof body.credential === "string"
    ? phonePairingLink({ address: options.publicUrl, token: body.credential, name: typeof body.serverName === "string" ? body.serverName : undefined })
    : null) ?? (typeof body.inviteUrl === "string" ? body.inviteUrl : null);
  const localUrl = options.phone ? null : `http://127.0.0.1:${port}/pair#code=${body.code}`;
  if (options.guided && localUrl) return browserSignInLines(localUrl, body.code, body.expiresAt);
  return pairingBlock({ code: body.code, url, inviteUrl: invite, localUrl, expiresAt: body.expiresAt, hint: typeof body.hint === "string" ? body.hint : null, phone: options.phone });
}

export async function runPair(options: CliOptions): Promise<number> {
  if (!(await serverUp(options.port))) {
    console.error(`Kein SPDBot-Server unter http://127.0.0.1:${options.port}; starte einen mit pnpm spdbot serve oder gib --port an.`);
    return 1;
  }
  if (process.stdin.isTTY && process.stdout.isTTY && !options.label && !options.client) {
    const advertised = await api(options.port, "/api/auth/pairing");
    let launch = options;
    let origin = options.publicUrl ?? (typeof advertised.body?.publicUrl === "string" ? advertised.body.publicUrl : undefined);
    if (!origin) {
      const { readCliStartup } = await import("./cli-setup.ts");
      launch = applyStartupPreferences(options, readCliStartup(options.dataDir));
      origin = launch.publicUrl;
      if (launch.tunnel) origin = describeTunnelAccount(createTunnelAccount({ dataDir: options.dataDir, version: serverVersion() }).credentials.read()).address ?? undefined;
      if (launch.tailscale) {
        const status = await tailscaleStatus();
        if (!("failure" in status) && status.status.dnsName) origin = `https://${status.status.dnsName}`;
      }
    }
    if (!origin || !normalizePhoneOrigin(origin)) {
      console.log("Dein Arbeitsbereich läuft nur auf diesem Computer. Ein Telefon kann dessen localhost-Adresse nicht verwenden.");
      console.log("Stoppe den Server, rufe pnpm spdbot setup auf und wähle den Telefonzugriff. Starte SPDBot anschließend erneut.");
      return 1;
    }
    const ui = defaultSetupIo();
    try {
      const selected = await ui.choose("Welches Telefon möchtest du verbinden?", ["iPhone / iPad – Safari", "Android – Browser", "Abbrechen"], 0);
      if (selected === 2) return 0;
      launch = { ...launch, phone: selected === 0 ? "ios" : "android" };
      return await showPhonePairing(launch, origin, ui.log) ? 0 : 1;
    } catch (error) {
      if (!(error instanceof SetupCancelled)) throw error;
      console.log("Kopplung abgebrochen. Vorhandene Geräte sind unverändert.");
      return 130;
    }
  }
  console.log(await mintPairing(options.port, { label: options.label, client: options.client, publicUrl: options.publicUrl, phone: options.phone }));
  if (options.client) console.log("(client-Rechte: nur Chat und Freigaben; keine Einstellungsänderungen oder Kopplung weiterer Geräte)");
  return 0;
}

export function formatSessions(sessions: Array<{ id: string; label: string; scopes: string[]; lastSeenAt: number; expiresAt: number }>, now = Date.now()): string {
  const age = (ms: number) => {
    const m = Math.max(0, Math.floor((now - ms) / 60_000));
    return m < 1 ? "gerade eben" : m < 60 ? `vor ${m} Min.` : m < 1440 ? `vor ${Math.round(m / 60)} Std.` : `vor ${Math.round(m / 1440)} Tagen`;
  };
  const rows = sessions.map((s) => [s.id, s.label || "(unbenannt)", s.scopes.includes("admin") ? "admin" : "client", age(s.lastSeenAt), new Date(s.expiresAt).toISOString().slice(0, 10)]);
  const head = ["ID", "Gerät", "Rechte", "Zuletzt gesehen", "Läuft ab"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i])).join("  ");
  return [line(head), ...rows.map(line), "", "Sitzung widerrufen: pnpm spdbot sessions revoke <id>"].join("\n");
}

export async function runSessions(options: CliOptions): Promise<number> {
  if (!(await serverUp(options.port))) {
    console.error(`Kein SPDBot-Server unter http://127.0.0.1:${options.port}`);
    return 1;
  }
  if (options.revoke) {
    const { status, body } = await api(options.port, `/api/auth/sessions/${encodeURIComponent(options.revoke)}`, { method: "DELETE" });
    if (refusedAsService(status, body)) {
      console.error(SERVICE_TRUST_HELP);
      return 1;
    }
    if (status !== 200) {
      console.error(`Widerruf fehlgeschlagen: ${typeof body?.error === "string" ? body.error : status}`);
      return 1;
    }
    console.log(`${options.revoke} widerrufen: Das Gerät ist abgemeldet und sein Stream geschlossen.`);
    return 0;
  }
  const { status, body } = await api(options.port, "/api/auth/sessions");
  if (refusedAsService(status, body)) {
    console.error(SERVICE_TRUST_HELP);
    return 1;
  }
  if (status !== 200) {
    console.error(`Sitzungen konnten nicht aufgelistet werden: ${typeof body?.error === "string" ? body.error : status}`);
    return 1;
  }
  const sessions: Array<{ id: string; label: string; scopes: string[]; lastSeenAt: number; expiresAt: number }> = Array.isArray(body?.sessions) ? body.sessions : [];
  if (options.json) {
    console.log(JSON.stringify(sessions, null, 2));
    return 0;
  }
  if (!sessions.length) {
    console.log("Noch keine gekoppelten Geräte. Rufe pnpm spdbot pair auf.");
    return 0;
  }
  console.log(formatSessions(sessions));
  return 0;
}

export async function runStatus(options: CliOptions, io: CliIo = defaultIo()): Promise<number> {
  let code = 0;
  try {
    const res = await fetch(`http://127.0.0.1:${options.port}/.well-known/spdbot/environment`);
    const body: any = await res.json();
    io.log(options.json ? JSON.stringify(body, null, 2) : `${body.label} · SPDBot ${body.version} auf ${body.platform} · ID ${body.environmentId}`);
  } catch {
    io.error(`Kein SPDBot-Server unter http://127.0.0.1:${options.port}`);
    code = 1;
  }
  if (!options.json) {
    const account = describeTunnelAccount(createTunnelAccount({ dataDir: options.dataDir, version: serverVersion() }).credentials.read());
    if (fleetCredential()) io.log(`Öffentliche Adresse: von der Flotte verwaltet (${FLEET_CREDENTIAL_ENV} ist gesetzt; die Adresse wird beim Start von serve --tunnel abgerufen)`);
    else if (account.address) io.log(`Öffentliche Adresse: ${account.address} (beim Tunnel-Dienst angemeldet als ${account.email ?? "?"})`);
  }
  return code;
}

/** Edits the sign-in allow-list in config.json, server live or stopped (read per request); OMB_SIGNIN_EMAILS wins when set. */
export async function runAccess(options: CliOptions, io: CliIo = defaultIo()): Promise<number> {
  const file = join(options.dataDir, "config.json");
  let raw: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      raw = Object.fromEntries(Object.entries(parsed));
    } catch (error) {
      io.error(`${file} konnte nicht gelesen werden (${message(error)}). Repariere die Datei, bevor du die Anmeldeberechtigungen änderst.`);
      return 1;
    }
  }
  const current = typeof raw.signIn === "object" && raw.signIn !== null ? Object(raw.signIn) : {};
  const list = (value: unknown) => parseAllowList(Array.isArray(value) ? value.map(String).join(",") : "");
  const admins = list(Reflect.get(current, "admins"));
  const members = list(Reflect.get(current, "members"));
  const overridden = process.env.OMB_SIGNIN_EMAILS !== undefined || process.env.OMB_SIGNIN_MEMBER_EMAILS !== undefined;
  const write = async (next: { admins: string[]; members: string[] }) => {
    mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });
    writeFileAtomic(file, `${JSON.stringify({ ...raw, signIn: next }, null, 2)}\n`, { mode: 0o600 });
    if (!sharedSignIn({ admins, members }) && !sharedSignIn(next) && !hostedWorkspaceConfigured()) return;
    const decisions = raw.decisions && typeof raw.decisions === "object" ? (raw.decisions as { retentionDays?: unknown }).retentionDays : undefined;
    bindDecisionRetention(() => decisionRetentionDays(typeof decisions === "number" ? decisions : undefined));
    const changed = (["admins", "members"] as const).filter((key) => next[key].join(",") !== (key === "admins" ? admins : members).join(","));
    appendAdminAction(options.dataDir, {
      category: "people", action: "people.update", target: { kind: "settings" }, actor: { kind: "cli" },
      changed: changed.map((key) => `signIn.${key}`),
      before: Object.fromEntries(changed.map((key) => [`signIn.${key}`, key === "admins" ? admins : members])),
      after: Object.fromEntries(changed.map((key) => [`signIn.${key}`, next[key]])),
    });
    await flushAdminActivity(options.dataDir);
  };
  if (options.accessAction === "list") {
    if (!admins.length && !members.length) {
      io.log("Noch niemand kann sich per E-Mail anmelden; nur Kopplungscodes sind verfügbar. Person hinzufügen: pnpm spdbot access add du@example.com");
      return 0;
    }
    for (const entry of admins) io.log(`${entry.padEnd(40)} Vollzugriff`);
    for (const entry of members) io.log(`${entry.padEnd(40)} Chat und Freigaben`);
    if (overridden) io.log("(SPDBOT_SIGNIN_EMAILS / SPDBOT_SIGNIN_MEMBER_EMAILS sind in der Umgebung gesetzt und haben während des Serverbetriebs Vorrang vor dieser Liste)");
    return 0;
  }
  const entry = (options.email ?? "").trim().toLowerCase();
  if (!entry || (!entry.startsWith("@") && !entry.includes("@")) || /\s/.test(entry)) {
    io.error("Gib eine E-Mail-Adresse an oder @domain für alle mit dieser Domain.");
    return 2;
  }
  const without = (items: string[]) => items.filter((item) => item !== entry);
  if (options.accessAction === "remove") {
    if (!admins.includes(entry) && !members.includes(entry)) {
      io.error(`${entry} steht nicht auf der Liste.`);
      return 1;
    }
    await write({ admins: without(admins), members: without(members) });
    io.log(`${entry} kann sich nicht mehr anmelden (bestehende Sitzungen bleiben bis zu ihrem Ablauf oder dem Widerruf mit pnpm spdbot sessions revoke bestehen).`);
    return 0;
  }
  await write(options.chatOnly ? { admins: without(admins), members: [...without(members), entry] } : { admins: [...without(admins), entry], members: without(members) });
  io.log(`${entry} kann sich unter /pair mit einem per E-Mail gesendeten Code anmelden (${options.chatOnly ? "Chat und Freigaben" : "Vollzugriff"}).`);
  if (overridden) io.log("Hinweis: SPDBOT_SIGNIN_EMAILS / SPDBOT_SIGNIN_MEMBER_EMAILS sind in der Umgebung gesetzt und haben während des Serverbetriebs Vorrang vor dieser Liste.");
  return 0;
}

export async function runLogin(options: CliOptions, io: CliIo = defaultIo()): Promise<number> {
  const account = createTunnelAccount({ dataDir: options.dataDir, version: serverVersion() });
  if (fleetCredential()) io.log(`Hinweis: ${FLEET_CREDENTIAL_ENV} ist gesetzt. serve --tunnel verwendet deshalb diesen Zugangsnachweis statt dieses Kontos.`);
  if (account.credentials.status === "unavailable") {
    io.error(`${account.credentials.file} existiert, konnte aber nicht gelesen werden. Repariere oder entferne die Datei und versuche es erneut.`);
    return 1;
  }
  if (!account.controlPlane) {
    io.error(`${Object.hasOwn(process.env, "SPDBOT_CONTROL_PLANE_URL") ? "SPDBOT_CONTROL_PLANE_URL" : "OMB_CONTROL_PLANE_URL"} ist gesetzt, aber keine gültige Control-Plane-Adresse.`);
    return 1;
  }
  const existing = describeTunnelAccount(account.credentials.read());
  if (existing.address) io.log(`Bereits als ${existing.email ?? "?"} angemeldet (${existing.address}); eine erneute Anmeldung aktualisiert den Zugang.`);
  const email = (options.email ?? (await io.ask("E-Mail für den konfigurierten Tunnel-Dienst: "))).trim();
  if (!email) {
    io.error("Eine E-Mail-Adresse ist erforderlich (--email).");
    return 1;
  }
  try {
    await account.service.requestCode(email);
  } catch (error) {
    io.error(`Anmeldecode konnte nicht gesendet werden: ${message(error)}`);
    return 1;
  }
  const code = (await io.ask(`Gib den 8-stelligen Code ein, der an ${email} gesendet wurde: `)).trim();
  let state;
  try {
    state = await account.service.verifyCode(email, code);
  } catch (error) {
    io.error(`Anmeldung fehlgeschlagen: ${message(error)}`);
    return 1;
  }
  const signedIn = describeTunnelAccount(account.credentials.read());
  if (!signedIn.address) {
    io.error(`Angemeldet, aber es wurde keine öffentliche Adresse vergeben${state.message ? `: ${state.message}` : ""}`);
    return 1;
  }
  io.log(`Angemeldet als ${signedIn.email ?? email}.`);
  io.log(`Öffentliche Adresse dieses Computers: ${signedIn.address}`);
  io.log("Diese Adresse stammt vom konfigurierten Tunnel-Dienst.");
  return 0;
}

export async function runLogout(options: CliOptions, io: CliIo = defaultIo()): Promise<number> {
  const account = createTunnelAccount({ dataDir: options.dataDir, version: serverVersion() });
  const before = describeTunnelAccount(account.credentials.read());
  if (!before.email) {
    io.log("Dieser Computer ist nicht angemeldet.");
    return 0;
  }
  let state;
  try {
    state = await account.service.signOut();
  } catch (error) {
    io.error(`Abmeldung fehlgeschlagen: ${message(error)}`);
    return 1;
  }
  const after = describeTunnelAccount(account.credentials.read());
  if (after.email) {
    io.error(`Weiterhin angemeldet${state.message ? `: ${state.message}` : ""}`);
    return 1;
  }
  io.log(`${before.email} abgemeldet${before.address ? `; ${before.address} wird freigegeben` : ""}.`);
  return 0;
}

export async function runBrowser(options: CliOptions, io: CliIo = defaultIo()): Promise<number> {
  const { browserEngineStatus, describeBrowserEngine, ensureChrome, installAgentBrowserBinary, resolveAgentBrowserBinary } = await import("./browser-engine.ts");
  const status = browserEngineStatus({ dataDir: options.dataDir });
  if (options.browserAction === "status") {
    io.log(describeBrowserEngine(status, status.kind === "ready" ? new (await import("./browser/chrome/launcher.ts")).ChromeLauncher({ dataDir: options.dataDir }).describe() : undefined));
    if (status.kind !== "ready" && status.installable) io.log("Installieren mit: pnpm spdbot browser install");
    return status.kind === "ready" ? 0 : 1;
  }
  let binary = resolveAgentBrowserBinary({ dataDir: options.dataDir });
  if (binary) {
    io.log(`agent-browser ist bereits vorhanden: ${binary}`);
  } else {
    if (status.kind !== "ready" && !status.installable) {
      io.error(status.reason);
      return 1;
    }
    try {
      binary = await installAgentBrowserBinary({ dataDir: options.dataDir, log: io.log });
    } catch (error) {
      io.error(`agent-browser konnte nicht installiert werden: ${message(error)}`);
      return 1;
    }
    io.log(`Installiert: ${binary}`);
  }
  try {
    await ensureChrome(binary, { withDeps: options.withDeps === true, log: io.log });
  } catch (error) {
    io.error(`Chrome ist nicht bereit: ${message(error)}`);
    if (process.platform === "linux" && !options.withDeps) io.error("Installiere unter Linux die Chrome-Systembibliotheken mit sudo pnpm spdbot browser install --with-deps. Rufe danach pnpm spdbot browser install mit dem Benutzer auf, der serve ausführt.");
    return 1;
  }
  io.log("Browser für diesen Benutzer und dieses Datenverzeichnis installiert. Führe serve mit demselben Benutzer aus und aktiviere den Browser unter Einstellungen → Computer sowie für jeden gewünschten Bot.");
  if (process.platform === "linux" && options.withDeps) io.log("Wenn serve mit einem anderen Benutzer läuft, führe pnpm spdbot browser install auch in dessen Login-Shell aus.");
  return 0;
}

export function serverEntry(here = HERE): { command: string; args: string[]; staticDir: string | null; skillsDir: string | null } {
  const bundled = join(here, "index.js");
  const root = resolve(here, "..");
  if (existsSync(bundled)) {
    const staticDir = [join(root, "dist"), join(here, "..", "ui")].find((d) => existsSync(join(d, "index.html"))) ?? null;
    const skillsDir = existsSync(join(root, "skills")) ? join(root, "skills") : null;
    return { command: process.execPath, args: [bundled], staticDir, skillsDir };
  }
  const source = join(here, "index.ts");
  const staticDir = existsSync(join(root, "dist", "index.html")) ? join(root, "dist") : null;
  return { command: process.execPath, args: ["--experimental-strip-types", source], staticDir, skillsDir: existsSync(join(root, "skills")) ? join(root, "skills") : null };
}

interface TunnelPlan {
  access: ManagedTunnelAccess;
  binary: string;
  guardian: string;
  origin: CompanionOriginEndpoint;
  account: TunnelAccount | null;
}

/** Fails closed: never a silent fallback to a local-only server. */
async function planTunnel(options: CliOptions, log: (line: string) => void, recovery: TunnelRecovery): Promise<TunnelPlan | { error: string }> {
  let access: ManagedTunnelAccess | null = null;
  let account: TunnelAccount | null = null;
  const fail = (error: string) => {
    account?.service.dispose();
    return { error };
  };
  const credential = fleetCredential();
  if (credential) {
    log(`tunnel: using the installation credential from ${FLEET_CREDENTIAL_ENV}`);
    try {
      access = await fleetAccess({ credential, version: serverVersion() });
    } catch (error) {
      return { error: `--tunnel: ${message(error)}` };
    }
  } else {
    account = createTunnelAccount({ dataDir: options.dataDir, version: serverVersion(), recovery, log: (line) => log(`tunnel: ${line}`) });
    if (account.credentials.status === "unavailable") return fail(`${account.credentials.file} exists but could not be read; fix or remove it`);
    if (!describeTunnelAccount(account.credentials.read()).email) {
      return fail("Für diesen Tunnel ist auf diesem Computer kein Dienstkonto eingerichtet. Verwende für eigenen Fernzugriff --domain oder --tailscale.");
    }
    try {
      const state = await account.service.retry();
      const saved = tunnelAccess(account.credentials.read()) !== null;
      if (state.status === "signed-out") log(`tunnel: Die Anmeldung auf diesem Computer ist abgelaufen${saved ? "; die gespeicherte Adresse wird vorerst weiter bereitgestellt" : ""}. Prüfe den konfigurierten Tunnel-Dienst.`);
      else if (state.message) log(`tunnel: ${state.message}${saved ? " Serving the saved address for now." : ""}`);
    } catch (error) {
      log(`tunnel: control plane not reachable right now (${message(error)}); using the saved address`);
    }
    access = tunnelAccess(account.credentials.read());
    if (!access) return fail("Für diesen Computer ist keine öffentliche Adresse verfügbar. Prüfe den konfigurierten Tunnel-Dienst.");
  }
  let binary: string;
  try {
    binary = await ensureCloudflared({ dataDir: options.dataDir, log });
  } catch (error) {
    return fail(`--tunnel: ${message(error)}`);
  }
  const guardian = guardianEntry();
  if (!guardian) return fail("--tunnel: the connector guardian is missing from this install");
  return { access, binary, guardian, origin: createTunnelOrigin(), account };
}

export async function runServe(options: CliOptions, log: (line: string) => void = console.log): Promise<number> {
  const { browserEngineStatus, describeBrowserEngine } = await import("./browser-engine.ts");
  if (await serverUp(options.port)) {
    console.error(`Unter http://127.0.0.1:${options.port} antwortet bereits ein Dienst. Verwende pnpm spdbot pair für ihn oder --port für einen zweiten Server.`);
    return 1;
  }
  let publicUrl = options.publicUrl;
  let tailscale: TailscaleStatus | null = null;
  if (options.tailscale) {
    const probe = await tailscaleStatus();
    if ("failure" in probe) {
      console.error(`--tailscale: ${explainTailscaleFailure(probe.failure)}`);
      return 1;
    }
    tailscale = probe.status;
  }
  let plan: TunnelPlan | null = null;
  const serving: { tunnel: RunningTunnel | null } = { tunnel: null };
  if (options.tunnel) {
    const planned = await planTunnel(options, log, { running: () => serving.tunnel });
    if ("error" in planned) {
      console.error(planned.error);
      return 1;
    }
    plan = planned;
    if (publicUrl && publicUrl !== plan.access.endpoint) log(`Hinweis: --public-url wird bei --tunnel ignoriert; die Adresse lautet ${plan.access.endpoint}.`);
    publicUrl = plan.access.endpoint;
  }
  let caddyBinary: string | null = null;
  if (options.domain) {
    try {
      caddyBinary = await ensureCaddy({ dataDir: options.dataDir, log });
    } catch (error) {
      console.error(`--domain: ${message(error)}`);
      return 1;
    }
    publicUrl = `https://${options.domain}`;
  }
  const entry = serverEntry();
  if (!entry.staticDir) log("Hinweis: Neben dem Server wurde keine gebaute Oberfläche gefunden. Die API läuft, aber Browser erhalten keine Seite (bauen mit pnpm exec vite build).");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OMB_DATA_DIR: options.dataDir,
    OMB_PORT: String(options.port),
    OMB_WEBHOOK_PORT: process.env.OMB_WEBHOOK_PORT || String(options.port + 1),
  };
  if (options.local) delete env.OMB_PUBLIC_URL;
  // The per-launch secret goes over stdin, not the environment that every engine the server starts inherits.
  const serviceTrust = resolveLoopbackTrust({ env, desktopManaged: false, hostedWorkspace: hostedWorkspaceConfigured(env) }).trust === "service";
  const ownerToken = serviceTrust ? randomBytes(32).toString("base64url") : undefined;
  if (ownerToken) env.OMB_CLI_OWNER_STDIN = "1";
  else delete env.OMB_CLI_OWNER_STDIN;
  if (entry.staticDir) env.OMB_STATIC_DIR = entry.staticDir;
  if (entry.skillsDir && !process.env.OMB_SKILLS_DIR) env.OMB_SKILLS_DIR = entry.skillsDir;
  if (options.label && !process.env.OMB_ENVIRONMENT_LABEL) env.OMB_ENVIRONMENT_LABEL = options.label;
  if (plan) env.OMB_TUNNEL_SOCKET = plan.origin.socketPath;
  let logPath: string | undefined;
  let logFd: number | undefined;
  let tailscaleServing = false;
  let tailscaleAttempted = false;
  let startupCancelled = false;
  const cancelStartup = () => { startupCancelled = true; };
  process.on("SIGINT", cancelStartup);
  process.on("SIGTERM", cancelStartup);
  let child: ChildProcess;
  try {
    if (options.guided) {
      const logsDir = join(options.dataDir, "logs");
      mkdirSync(logsDir, { recursive: true, mode: 0o700 });
      logPath = join(logsDir, `server-${Date.now()}-${process.pid}.log`);
      logFd = openSync(logPath, "wx", 0o600);
      log("\nDein Arbeitsbereich wird gestartet…");
    }
    if (tailscale) {
      tailscaleAttempted = true;
      const served = await tailscaleServe(tailscale, options.port);
      if (startupCancelled) throw new SetupCancelled();
      if ("failure" in served) throw new Error(`--tailscale: ${explainTailscaleFailure(served.failure)}`);
      tailscaleServing = true;
      publicUrl = served.origin;
      log(`tailscale: serving https://${tailscale.dnsName} → http://127.0.0.1:${options.port} (only your tailnet can reach it)`);
    }
    if (startupCancelled) throw new SetupCancelled();
    if (publicUrl) env.OMB_PUBLIC_URL = publicUrl;
    child = spawn(entry.command, entry.args, { env, stdio: [ownerToken ? "pipe" : "ignore", logFd ?? "inherit", logFd ?? "inherit"] });
    if (ownerToken) {
      child.stdin?.on("error", () => {});
      child.stdin?.end(`${ownerToken}\n`);
      serveOwnerToken = ownerToken;
    }
  } catch (error) {
    if ((tailscaleServing || (startupCancelled && tailscaleAttempted)) && tailscale) await tailscaleServeOff(tailscale).catch(() => undefined);
    plan?.account?.service.dispose();
    if (plan) cleanupTunnelOrigin(plan.origin);
    if (error instanceof SetupCancelled) {
      log("Start abgebrochen. Es wurde kein Server gestartet; deine gespeicherte Arbeit ist unverändert.");
      return 130;
    }
    throw error;
  } finally {
    if (logFd !== undefined) closeSync(logFd);
    process.removeListener("SIGINT", cancelStartup);
    process.removeListener("SIGTERM", cancelStartup);
  }
  let exited: number | null = null;
  const childExit = new Promise<number>((done) => {
    child.once("error", () => { exited = 1; done(1); });
    child.once("exit", (code, signal) => { exited = code ?? (signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1); done(exited); });
  });
  let tunnel: RunningTunnel | null = null;
  let caddy: RunningCaddy | null = null;
  let stopping: Promise<void> | null = null;
  const stop = () => {
    stopping ??= (async () => {
      serving.tunnel = null;
      plan?.account?.service.dispose();
      // The gateway and the edge stop accepting before the server they forward to goes away.
      if (tunnel) await tunnel.stop().catch(() => undefined);
      if (caddy) await caddy.stop().catch(() => undefined);
      if (tailscaleServing && tailscale) await tailscaleServeOff(tailscale).catch(() => undefined);
      if (exited === null) {
        child.kill("SIGTERM");
        const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
        timer.unref();
        await childExit;
        clearTimeout(timer);
      }
      if (plan) cleanupTunnelOrigin(plan.origin);
    })();
    return stopping;
  };
  const onSignal = () => { void stop(); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && exited === null && !stopping) {
      if (await serverUp(options.port, child.pid)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (exited !== null) {
      if (exited !== 0) log(`SPDBot konnte nicht gestartet werden.${logPath ? ` Details: ${logPath}` : " Sieh dir die Ausgabe oben an."}`);
      return exited;
    }
    if (stopping) return await childExit;
    if (!(await serverUp(options.port, child.pid))) {
      console.error(`SPDBot war nach einer Minute noch nicht bereit.${logPath ? ` Details: ${logPath}` : " Sieh dir die Serverausgabe oben an."}`);
      await stop();
      return 1;
    }
    if (stopping || exited !== null) return await childExit;
    if (options.domain && caddyBinary) {
      try {
        caddy = await startCaddy({ binary: caddyBinary, dataDir: options.dataDir, domain: options.domain, appPort: options.port, webhookPort: Number(env.OMB_WEBHOOK_PORT), log });
        log(`https: Caddy serves ${publicUrl} → http://127.0.0.1:${options.port}; it gets the certificate from Let's Encrypt once DNS for ${options.domain} points at this machine`);
        void caddy.exited.then((code) => {
          if (!stopping) log(`caddy: stopped (exit ${code ?? "signal"}); ${publicUrl} is no longer served. Stop and start the server again.`);
        });
      } catch (error) {
        console.error(`--domain: ${message(error)}`);
        await stop();
        return 1;
      }
    }
    if (plan && child.pid) {
      tunnel = startTunnel({
        dataDir: options.dataDir,
        access: plan.access,
        originTarget: { pid: child.pid, socketPath: plan.origin.socketPath },
        binaryPath: plan.binary,
        guardian: plan.guardian,
        onState: (state) => log(describeTunnelState(state, plan.access.endpoint)),
      });
      tunnel.started.catch((error: unknown) => log(`tunnel: ${message(error)}`));
      serving.tunnel = tunnel;
      void plan.account?.service.restore().catch(() => undefined);
    }
    log("");
    log(`SPDBot läuft unter http://127.0.0.1:${options.port}${publicUrl ? `, erreichbar unter ${publicUrl}` : ""}`);
    if (options.guided) {
      log("Deine Bots und Gespräche werden automatisch gespeichert.");
      log(`Details, falls du Hilfe benötigst: ${logPath}`);
      if (options.open !== false && !await openDashboard(options.port)) log("Öffne die lokale Adresse oben in einem Browser auf diesem Computer.");
    } else {
      log(`data: ${options.dataDir}`);
      log(describeBrowserEngine(browserEngineStatus({ dataDir: options.dataDir })));
    }
    if (options.pair && options.phone) {
      log("");
      if (tunnel) {
        // No pairing secret is created or sent to the public address until its identity is verified.
        log("Telefonverbindung wird vorbereitet…");
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([tunnel.started.catch(() => undefined), childExit,
          new Promise((done) => { timer = setTimeout(done, 15_000); })]);
        if (timer) clearTimeout(timer);
      }
      if (!stopping && exited === null) await showPhonePairing(options, publicUrl, log).catch((error: unknown) => log(`Kein Kopplungscode: ${message(error)}`));
    } else if (options.pair) {
      log("");
      try {
        log(await mintPairing(options.port, { label: options.label ? `${options.label} owner` : undefined, client: options.client, publicUrl: publicUrl ?? undefined, guided: options.guided }));
        if (!options.guided) log("\nSpäter ein weiteres Gerät koppeln: pnpm spdbot pair --label \"Küchen-iPad\"");
      } catch (error) {
        log(`Kein Kopplungscode: ${message(error)}`);
        log("Nächstes Mal ohne Kopplungscode starten: pnpm spdbot serve --no-pair");
      }
    }
    log(options.guided ? "\nLass dieses Terminal geöffnet, solange du deine Bots nutzt. Ctrl+C stoppt den Server; deine gespeicherte Arbeit bleibt erhalten." : "Mit Ctrl+C stoppen");
    if (options.guided) log("Nächstes Mal: pnpm spdbot · KI- oder Telefoneinrichtung ändern: pnpm spdbot setup · Weiteres Telefon koppeln: pnpm spdbot pair");
    return await childExit;
  } finally {
    serveOwnerToken = undefined;
    await stop();
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
}

/** A server exiting with RESTART_EXIT_CODE is started again here at the same address, without a second pairing code. */
export async function serveUntilStopped(options: CliOptions, run: (options: CliOptions) => Promise<number> = runServe, now: () => number = Date.now): Promise<number> {
  const policy = restartPolicy(now);
  let launch = options;
  for (;;) {
    const code = await run(launch);
    if (!policy.again(code)) return code;
    console.log("\nSPDBot startet neu, um die Installation einer Kopie aus der Desktop-App abzuschließen…");
    launch = { ...options, pair: false, open: false };
  }
}

/** Setup imports stay behind the data-dir override: config binds its paths when first imported. */
export async function runOnboardingCommand(
  options: CliOptions,
  io: CliIo = defaultIo(),
  startServer: (options: CliOptions) => Promise<number> = serveUntilStopped,
  flow: { prompts?: SetupIo; phoneSetup?: typeof runPhoneSetup; running?: typeof isWorkspaceRunning; open?: typeof openDashboard } = {},
): Promise<number> {
  const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;
  if (options.command === "setup" && !interactive) {
    io.error("Die Einrichtung benötigt ein interaktives Terminal. Rufe dort pnpm spdbot setup auf und verwende anschließend pnpm spdbot serve für unbeaufsichtigte Starts.");
    return 1;
  }
  process.env.OMB_DATA_DIR = options.dataDir;
  if (options.command !== "setup" && await (flow.running ?? isWorkspaceRunning)(options)) {
    if (options.local || options.tunnel || options.tailscale || options.publicUrl) {
      io.error("Dieser Arbeitsbereich läuft bereits. Stoppe ihn, bevor du den lokalen Zugriff oder Fernzugriff änderst; die aktuelle Verbindung wurde nicht verändert.");
      return 1;
    }
    io.log(`Dein Arbeitsbereich läuft bereits: http://127.0.0.1:${options.port}`);
    io.log("Es wurde kein zweiter Server gestartet. Deine vorhandenen Bots und Gespräche sind unverändert.");
    if (interactive && options.open !== false) await (flow.open ?? openDashboard)(options.port);
    return 0;
  }
  const { runSetup, isSetupComplete, readCliStartup, saveCliStartup } = await import("./cli-setup.ts");
  const prompts = flow.prompts ?? defaultSetupIo();
  try {
    if (options.command === "setup" || !(await isSetupComplete(options.dataDir))) {
      if (!interactive) {
        io.error("Es wurde keine abgeschlossene Einrichtung gefunden. Rufe zuerst pnpm spdbot setup in einem interaktiven Terminal auf oder verwende pnpm spdbot serve mit einer vorhandenen Konfiguration.");
        return 1;
      }
      if (!(await runSetup({ dataDir: options.dataDir, port: options.port }))) {
        io.log("Einrichtung abgebrochen. Rufe pnpm spdbot auf, wenn du bereit bist.");
        return 130;
      }
    }
    const saved = readCliStartup(options.dataDir);
    // Only setup revisits the access choice; normal starts reuse consent and never turn a local session public.
    let launch = options.command === "setup" ? options : applyStartupPreferences(options, saved);
    if (interactive && options.pair && !options.local && (options.command === "setup" || !saved)) {
      io.log("\nEin optionaler Schritt: Verbinde dein Telefon. Du kannst dies überspringen und direkt hier chatten.");
      const result = await (flow.phoneSetup ?? runPhoneSetup)(launch, prompts, {
        accountReady: (value) => !!describeTunnelAccount(createTunnelAccount({ dataDir: value.dataDir, version: serverVersion() }).credentials.read()).email,
        login: (value, ui) => runLogin(value, {
          log: ui.log, error: ui.log,
          ask: (question) => /code/i.test(question) ? ui.secret(question) : ui.ask(question),
        }),
      });
      launch = { ...result.options, phone: result.phone };
      saveCliStartup(options.dataDir, startupPreferences(launch));
    }
    if (options.command === "setup") {
      io.log("\nAlles bereit. Starte mit: pnpm spdbot.");
      if (options.dataDir !== join(homedir(), ".spdbot") || options.port !== 8899) {
        io.log(`Verwende beim Start dieselben Optionen --data-dir (${options.dataDir}) und --port (${options.port}).`);
      }
      return 0;
    }
    if (saved) io.log("\nWillkommen zurück. Deine gespeicherte KI-Verbindung wird verwendet.");
    return startServer({ ...launch, guided: interactive });
  } catch (error) {
    if (!(error instanceof SetupCancelled)) throw error;
    io.log("\nEinrichtung gestoppt. Bereits gespeicherte KI-Einstellungen bleiben erhalten; es wurde kein Server gestartet. Setze die Einrichtung mit pnpm spdbot setup fort.");
    return 130;
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  if (argv[0] === "sentinel") return runSentinelCli(argv.slice(1));
  if (HEADLESS_VERB_NAMES.has(argv[0] ?? "") || (argv[0] === "help" && HEADLESS_VERB_NAMES.has(argv[1] ?? ""))) return (await import("./headless/main.ts")).runHeadless(argv);
  const options = parseArgs(argv);
  if ("error" in options) {
    console.error(`${options.error}\n\n${USAGE}`);
    return 2;
  }
  if (!await discoverCliPort(options, argv, process.env, serverUp)) return 1;
  process.env.OMB_DATA_DIR = options.dataDir;
  switch (options.command) {
    case "setup":
    case "start":
      return runOnboardingCommand(options);
    case "serve":
      return serveUntilStopped(options);
    case "pair":
      return runPair(options);
    case "sessions":
      return runSessions(options);
    case "status":
      return runStatus(options);
    case "login":
      return runLogin(options);
    case "access":
      return runAccess(options);
    case "service":
      return runServiceCommand({
        action: options.serviceAction ?? "install", dataDir: options.dataDir, port: options.port, domain: options.domain, tunnel: options.tunnel,
        tailscale: options.tailscale, label: options.label, sentinel: options.sentinel, script: process.argv[1] ?? "", node: process.execPath,
      }, { log: (line) => console.log(line), error: (line) => console.error(line) });
    case "fleet":
      if (options.fleetAction === "agent") {
        const layout = fleetLayout();
        await startFleetAgent({
          socketPath: options.socket ?? layout.socketPath,
          group: options.group,
          node: process.execPath,
          script: process.argv[1] ?? "",
          licenseKey: options.licenseKey ?? process.env.OMB_LICENSE_KEY,
        }, { log: (line) => console.log(line) });
        await new Promise<void>((resolveStop) => {
          for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => resolveStop());
        });
        return 0;
      }
      return runFleetCommand({
        action: options.fleetAction as FleetInput["action"],
        slug: options.slug,
        domain: options.domain,
        operator: options.operator ?? process.env.SUDO_USER,
        admins: options.admins ?? [],
        members: options.members ?? [],
        brandFile: options.brandFile,
        anthropicKeyFile: options.anthropicKeyFile,
        cap: options.cap,
        licenseKey: options.licenseKey ?? process.env.OMB_LICENSE_KEY,
        memory: options.memory,
        dryRun: options.dryRun ?? false,
        yes: options.yes ?? false,
        keepData: options.keepData ?? false,
        userAction: options.fleetUserAction,
        email: options.email,
        chatOnly: options.chatOnly,
        node: process.execPath,
        script: process.argv[1] ?? "",
      }, { log: (line) => console.log(line), error: (line) => console.error(line) });
    case "logout":
      return runLogout(options);
    case "browser":
      return runBrowser(options);
    default:
      console.log(USAGE);
      return 0;
  }
}
