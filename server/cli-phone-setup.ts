// Phone onboarding only chooses a route; the caller starts, verifies and stops it, and mints or cancels its pairing code.
import type { CliOptions } from "./cli.ts";
import { type SetupIo } from "./cli-prompts.ts";

export type PhoneKind = "ios" | "android";
export interface PhoneSetupResult {
  options: CliOptions;
  phone?: PhoneKind;
}
export interface PhoneSetupDependencies {
  /** May read saved tunnel credentials, but must not sign in or start a tunnel. */
  accountReady?(options: CliOptions): boolean | Promise<boolean>;
  login(options: CliOptions, io: SetupIo): Promise<number>;
}

/** An HTTPS origin, not proof a phone can reach it; never a pasted invitation, password, query token, localhost or unspecified bind. */
export function normalizePhoneOrigin(raw: string): string | null {
  const value = raw.trim();
  // Reject control characters before URL parsing can silently remove them.
  // eslint-disable-next-line no-control-regex
  if (!/^https:\/\/[^/]/i.test(value) || /[\s\u0000-\u001f\u007f\\?#@]/.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/") return null;
    if (!host || host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host.startsWith("127.")) return null;
    if (host === "[::]" || host === "[::1]" || /^\[::ffff:(?:0:0|7f[0-9a-f]{2}:[0-9a-f]+)\]$/.test(host)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function runPhoneSetup(
  options: CliOptions,
  io: SetupIo,
  _deps: PhoneSetupDependencies,
): Promise<PhoneSetupResult> {
  const skip = (): PhoneSetupResult => ({ options });
  const selected = (phone: PhoneKind, route: Partial<CliOptions> = {}): PhoneSetupResult => ({
    options: { ...options, ...route, client: true, pair: true }, phone,
  });
  // This standalone product has no managed account/relay. Fail closed rather than save a local fallback.
  if (options.tunnel) throw new Error("Verwalteter Telefonzugriff ist in SPDBot nicht verfügbar. Verwende vorhandenes Tailscale oder eine eigene HTTPS-Adresse statt --tunnel. Es wurde keine Verbindung geändert.");
  for (;;) {
    const device = await io.choose("SPDBot im Browser auf deinem Telefon nutzen?", [
      "Vorerst überspringen",
      "iPhone / iPad – Safari",
      "Android – Browser",
    ], 0);
    if (device === 0) return skip();
    const phone: PhoneKind = device === 1 ? "ios" : "android";
    if (options.tailscale) {
      io.log("Lass Tailscale auf diesem Computer und deinem Telefon im selben Tailnet verbunden.");
      return selected(phone);
    }
    const existing = options.publicUrl ? normalizePhoneOrigin(options.publicUrl) : null;
    if (existing) {
      io.log("Deine konfigurierte HTTPS-Adresse wird geprüft, bevor ein Kopplungslink für das Telefon angezeigt wird.");
      return selected(phone, { publicUrl: existing });
    }
    io.log("Dieser Server lauscht nur auf diesem Computer. Ein localhost- oder LAN-IP-Link verbindet dein Telefon nicht.");
    let back = false;
    while (!back) {
      const route = await io.choose("Wie soll dein Telefon diesen Computer erreichen?", [
        "Vorhandenes Tailscale – nur dein Tailnet",
        "Vorhandene HTTPS-Adresse – erweiterte Einrichtung",
        "Zurück zur Telefonauswahl",
        "Vorerst überspringen",
      ], 3);
      if (route === 3) return skip();
      if (route === 2) { back = true; continue; }
      if (route === 0) {
        io.log("Tailscale muss auf diesem Computer und dem Telefon bereits installiert und angemeldet sein. HTTPS-Zertifikate müssen für das Tailnet aktiviert sein.");
        if (!await io.confirm("Darf SPDBot während des Betriebs HTTPS in deinem Tailnet bereitstellen?", false)) continue;
        return selected(phone, { tailscale: true, tunnel: false, publicUrl: undefined });
      }
      io.log("Verwende einen HTTPS-Reverse-Proxy, den du bereits für diesen Server eingerichtet hast. Gib nur seinen Ursprung ein, ohne Passwort, Kopplungscode, Pfad, Suchparameter oder Fragment.");
      const answer = await io.ask("Vorhandene HTTPS-Adresse (Enter geht zurück): ");
      if (!answer.trim()) continue;
      const origin = normalizePhoneOrigin(answer);
      if (!origin) {
        io.log("Gib einen HTTPS-Ursprung ein, der nicht auf localhost zeigt, zum Beispiel https://bot.example.com. Die Adresse wurde nicht gespeichert.");
        continue;
      }
      io.log("Dadurch wird weder ein Proxy erstellt noch ein LAN-Listener geöffnet. Die Verbindung wird vor der Kopplung geprüft.");
      return selected(phone, { publicUrl: origin, tunnel: false, tailscale: false });
    }
  }
}

/** The URL is an origin, never the invitation carrying its one-time credential. */
export function phonePairingInstructions(
  phone: PhoneKind,
  input: { origin: string | null; ready: boolean },
): string[] {
  const origin = input.origin ? normalizePhoneOrigin(input.origin) : null;
  if (!input.ready || !origin) {
    return ["Der Telefonzugriff ist noch nicht bereit. Ein QR-Code für das Telefon darf erst nach Prüfung der HTTPS-Verbindung angezeigt werden.",
      "Du kannst SPDBot weiterhin lokal auf diesem Computer nutzen."];
  }
  return [
    phone === "ios"
      ? "Scanne auf dem iPhone oder iPad den QR-Code mit der Kamera, um Safari zu öffnen. Eine separate SPDBot-App ist nicht erforderlich."
      : "Scanne unter Android den QR-Code mit der Kamera, um den Browser zu öffnen. Eine separate SPDBot-App ist nicht erforderlich.",
    `Oder öffne ${origin}/pair auf deinem Telefon und gib den Code ein.`,
    "Wähle auf dem Telefon „Verbinden“. Das Scannen eines QR-Codes allein koppelt das Telefon noch nicht.",
    "Der Code ist einmalig verwendbar und läuft nach fünf Minuten ab. Dieses Telefon erhält client-Zugriff: Chat und Freigaben, keine Einstellungen oder Kopplungsverwaltung.",
  ];
}
