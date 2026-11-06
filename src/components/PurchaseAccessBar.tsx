import { useState } from "react";
import { KeyRound } from "lucide-react";
import { t } from "@/lib/i18n";
import { usePurchaseAccess } from "@/lib/purchase-access";
import { useCaptionChrome } from "./DesktopCapabilities";

export function PurchaseAccessBar() {
  const { bridge, access, setAccess } = usePurchaseAccess();
  const caption = useCaptionChrome();
  const [busy, setBusy] = useState(false);
  if (!bridge || !access) return null;
  const act = async (action: "connect" | "refresh" | "signOut") => {
    setBusy(true);
    try { setAccess(await bridge[action]()); } finally { setBusy(false); }
  };
  const label = access.issue === "access_service_unavailable" ? t("purchase.unavailable")
    : access.issue === "clock_verification_required" ? t("purchase.clock")
    : access.issue === "secure_storage_unavailable" ? t("purchase.storage")
    : access.allowed ? t("purchase.active") : access.state === "connecting" ? t("purchase.connecting") : t("purchase.required");
  return <div style={caption.noDragStyle} className={`flex shrink-0 items-center gap-3 border-b border-hairline/40 bg-panel px-4 pb-2 text-xs text-ink-secondary ${caption.draggable ? "pt-8" : "pt-2"}`} role="status">
    <KeyRound size={14} aria-hidden="true" />
    <span className="mr-auto">{label}</span>
    <button className="rounded px-2 py-1 text-ink hover:bg-raised disabled:opacity-50" disabled={busy} onClick={() => void act(access.allowed ? "refresh" : "connect")}>
      {access.allowed ? t("purchase.refresh") : t("purchase.connect")}
    </button>
    {(access.connected || access.issue === "secure_storage_unavailable") && <button className="rounded px-2 py-1 hover:bg-raised disabled:opacity-50" disabled={busy} onClick={() => void act("signOut")}>{access.issue === "secure_storage_unavailable" ? t("purchase.reset") : t("purchase.signOut")}</button>}
  </div>;
}
