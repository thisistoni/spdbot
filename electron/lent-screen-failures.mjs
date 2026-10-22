// Plain sentences for a lent screen that cannot work, with the fix the person can make on this computer. They reach
// the bot through the server and this computer's lending activity, so they name no path.

export const SCREEN_LOCKED =
  "Der Bildschirm dieses Computers ist gesperrt. Apps und Bildschirm können deshalb nicht angezeigt oder bedient werden. Entsperre ihn und lasse ihn entsperrt, während der Bot arbeitet. Versuche es dann erneut.";

export function helperMissing(platform = process.platform) {
  return platform === "win32"
    ? "Die Computersteuerung konnte auf diesem PC nicht starten: cua-driver.exe fehlt oder ist blockiert. Prüfe unter Windows-Sicherheit → Viren- & Bedrohungsschutz → Schutzverlauf, ob die Datei in Quarantäne ist. Prüfe ihre vertrauenswürdige Herkunft, bevor du sie freigibst, oder installiere SPDBot aus der offiziellen Quelle neu. Starte SPDBot danach erneut."
    : "Die Computersteuerung konnte nicht starten: cua-driver fehlt oder ist blockiert. Installiere SPDBot erneut und starte die App danach neu.";
}

/** `reason` is the desktop's own cua start-up failure, which never crosses to the server as written. */
export function cuaUnavailable(reason, platform = process.platform) {
  const why = String(reason ?? "");
  if (/binary not found|is missing|ENOENT|EPERM|EACCES/i.test(why)) return helperMissing(platform);
  if (/Accessibility|Screen Recording|permission/i.test(why)) {
    return "Die Computersteuerung benötigt auf diesem Computer eine Freigabe: Erlaube SPDBot unter Systemeinstellungen → Datenschutz & Sicherheit die Bedienungshilfen und Bildschirmaufnahme. Starte SPDBot danach neu.";
  }
  return "Die Computersteuerung läuft auf diesem Computer nicht. Öffne dort SPDBot und prüfe, ob die Computersteuerung in den Einstellungen aktiviert ist. Versuche es dann erneut.";
}
