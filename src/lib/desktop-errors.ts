import { t } from "./i18n";

const messages = new Map<string, Parameters<typeof t>[0]>([
  ["Enter the OpenMausBot HTTPS companion address or full Tailscale name ending in .ts.net", "desktop.error.companionAddress"],
  ["Enter the six-digit code shown on the other computer", "desktop.error.companionCode"],
  ["The remote computer returned an invalid device credential", "desktop.error.deviceCredential"],
  ["The remote computer returned an invalid pairing response", "desktop.error.pairingResponse"],
  ["The remote computer did not answer", "desktop.error.computerNoAnswer"],
  ["The remote viewer did not answer", "desktop.error.viewerNoAnswer"],
  ["The saved remote computer credential is invalid", "desktop.error.savedCredential"],
  ["Every desktop companion relay port is already in use", "desktop.error.relayPorts"],
  ["The operating-system credential store could not be read this launch", "desktop.error.storeUnread"],
  ["The operating-system credential store is unavailable", "desktop.error.storeUnavailable"],
  ["The credential store could not be read on this launch, so credentials cannot be saved", "desktop.error.storeSaveBlocked"],
  ["That file is on the computer this app is connected to", "desktop.error.remoteFile"],
  ["The desktop client window is unavailable", "desktop.error.clientUnavailable"],
  ["Enter the SPDBot HTTPS companion address or full Tailscale name ending in .ts.net", "desktop.error.companionAddress"],
  ["Enter an HTTPS server address or a full pairing link. Keep the pairing code after #, not in the URL query.", "remote.client.server.invalidLink"],
]);

/** Translate known app-owned failures; retain external diagnostics after removing Electron's IPC wrapper. */
export function desktopErrorMessage(cause: unknown): string {
  const message = String((cause as { message?: string })?.message ?? cause)
    .replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, "");
  const key = messages.get(message);
  if (key) return t(key);
  const http = /^The remote computer answered HTTP (\d{3})$/.exec(message);
  return http ? t("desktop.error.http", { status: http[1]! }) : message;
}
