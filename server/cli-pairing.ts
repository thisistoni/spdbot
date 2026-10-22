// What `spdbot serve` and `spdbot pair` print for a pairing code. A browser on this computer is no longer the
// owner just by being here, so it signs in once with the link printed for it.
import qrcode from "qrcode-terminal";

/** Render the existing web pairing URL only; native-app invitation fields stay wire-compatible but are not advertised. */
export function pairingBlock(input: {
  code: string;
  url: string | null;
  inviteUrl?: string | null;
  localUrl?: string | null;
  expiresAt: number;
  hint?: string | null;
  phone?: "ios" | "android";
}): string {
  const lines = [`Kopplungscode: ${input.code}`, `Läuft ab:      ${new Date(input.expiresAt).toLocaleTimeString()} (einmalig verwendbar)`];
  if (input.localUrl) lines.push(`Dieser Computer: ${input.localUrl}`);
  // Only the existing web route is advertised. This product has no native mobile app.
  if (!input.url) {
    lines.push("Öffne /pair unter der Adresse dieses Servers und gib den Code ein.");
    lines.push("Für einen Telefonlink brauchst du eine erreichbare HTTPS-Adresse (SPDBOT_PUBLIC_URL).");
    return lines.join("\n");
  }
  lines.push(`Öffnen oder scannen: ${input.url}`, "", qrToString(input.url), "");
  lines.push("Scanne den QR-Code mit der Kamera oder öffne die Adresse im Browser.");
  return lines.join("\n");
}

/** The guided start's one sign-in, for the browser it opens on this computer. */
export function browserSignInLines(localUrl: string, code: string, expiresAt: number): string {
  return [
    "Melde dich im Browser auf diesem Computer mit diesem Link an (einmalig verwendbar, bis",
    `${new Date(expiresAt).toLocaleTimeString()}): ${localUrl}`,
    `Oder gib den Code ${code} auf der Anmeldeseite ein. Später erneut koppeln: pnpm spdbot pair`,
  ].join("\n");
}

export function qrToString(text: string): string {
  let out = "";
  qrcode.generate(text, { small: true }, (rendered: string) => {
    out = rendered;
  });
  return out;
}
