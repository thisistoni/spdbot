import { t } from "../lib/i18n";
import { BROWSER_SIGN_IN_FAILED, SERVICE_TRUST_REASON } from "../lib/session";

/** Translate only app-owned messages; keep server/provider diagnostics unchanged. */
export function sessionMessage(message: string): string {
  if (message === SERVICE_TRUST_REASON) return t("pairPage.serviceTrust");
  if (message === BROWSER_SIGN_IN_FAILED) return t("pairPage.expiredSignIn");
  const unreachable = /^could not reach the server \((.*)\)$/s.exec(message);
  return unreachable ? t("pairPage.unreachable", { detail: unreachable[1]! }) : message;
}
