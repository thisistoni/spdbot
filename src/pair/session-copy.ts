import { t } from "../lib/i18n";
import { BROWSER_SIGN_IN_FAILED, SERVICE_TRUST_REASON } from "../lib/session";

const ownedMessages: Record<string, Parameters<typeof t>[0]> = {
  "pairing code is wrong or has expired; create a new one on the server": "pairPage.invalidCode",
  "email sign-in is not set up on this server; use a pairing code": "pairPage.emailUnavailable",
  "this email is not on this server's sign-in list; ask the server's owner to add it": "pairPage.emailNotAllowed",
  "enter a valid email address": "pairPage.invalidEmail",
  "enter the 8-digit code from the email": "pairPage.emailCodeRequired",
  "that code is wrong or has expired; request a new one": "pairPage.invalidEmailCode",
  "too many attempts; wait a minute and request a new code": "pairPage.waitForNewCode",
  "Your session ended. Sign in again before creating a pairing code.": "pairPage.sessionEnded",
};

/** Translate only app-owned messages; keep server/provider diagnostics unchanged. */
export function sessionMessage(message: string): string {
  if (message === SERVICE_TRUST_REASON) return t("pairPage.serviceTrust");
  if (message === BROWSER_SIGN_IN_FAILED) return t("pairPage.expiredSignIn");
  if (message === "this sign-in link has expired or was already used") return t("pairPage.expiredSignIn");
  const key = Object.hasOwn(ownedMessages, message) ? ownedMessages[message] : undefined;
  if (key) return t(key);
  const lockout = /^too many failed (pairing|sign-in) attempts from your address; try again in (\d+)s$/.exec(message);
  if (lockout) return t(lockout[1] === "pairing" ? "pairPage.pairingLockout" : "pairPage.signInLockout", { seconds: lockout[2]! });
  const service = /^the sign-in service could not be reached \((.*)\); try again in a moment$/s.exec(message);
  if (service) return t("pairPage.signInUnavailable", { detail: service[1]! });
  const noAddress = /^this server has no public address to put in a link: set ((?:SPDBOT|OMB)_PUBLIC_URL), or open \/pair on the address you use and type the code$/.exec(message);
  if (noAddress) return t("pairPage.noPublicAddress", { variable: noAddress[1]! });
  const unreachable = /^could not reach the server \((.*)\)$/s.exec(message);
  return unreachable ? t("pairPage.unreachable", { detail: unreachable[1]! }) : message;
}
