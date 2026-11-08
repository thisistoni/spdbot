import {useState,type CSSProperties,type ReactNode} from "react";
import {ArrowUpRight,KeyRound,LoaderCircle} from "lucide-react";
import {usePurchaseAccess} from "@/lib/purchase-access";
import {t} from "@/lib/i18n";
import {DEFAULT_BRAND} from "@/lib/brand";

/** Mount the workspace and onboarding only after Main confirms buyer access. */
export function PurchaseAccessGate({children}:{children:ReactNode}) {
  const {bridge,access,setAccess}=usePurchaseAccess();
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  if(!bridge||access?.allowed)return children;
  const pending=!access;
  const connecting=access?.state==="connecting";
  const issue=access?.issue;
  const status=issue==="secure_storage_unavailable"?t("purchase.storage")
    :issue==="clock_verification_required"?t("purchase.clock")
    :issue==="access_service_unavailable"?t("purchase.unavailable")
    :failed||issue?t("purchase.gate.retry")
    :connecting?t("purchase.connecting"):"";
  async function act(action:"connect"|"refresh"|"signOut") {
    setBusy(true);setFailed(false);
    try{setAccess(await bridge![action]());}catch{setFailed(true);}finally{setBusy(false);}
  }
  return <div className="flex min-h-dvh flex-col bg-panel text-ink">
    <div className="h-12 shrink-0" style={{WebkitAppRegion:"drag"} as CSSProperties}/>
    <main className="m-auto flex w-full max-w-md flex-col items-center gap-7 px-8 py-14 text-center" aria-label={t("purchase.gate.title")}>
      <img src={DEFAULT_BRAND.logo} width={64} height={64} alt="" className="rounded-2xl"/>
      <div className="flex flex-col gap-4"><h1 className="text-3xl font-medium tracking-tight">{t("purchase.gate.title")}</h1><p className="text-sm leading-6 text-ink-secondary">{t("purchase.gate.explain")}</p></div>
      {pending?<p className="flex items-center gap-2 text-sm text-ink-secondary" role="status"><LoaderCircle size={17} className="animate-spin motion-reduce:animate-none"/>{t("purchase.gate.checking")}</p>:<>
        <button onClick={()=>void act("connect")} disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-accent px-6 py-3 font-medium text-[var(--color-accent-ink)] transition-transform duration-150 active:scale-[.98] disabled:opacity-60 motion-reduce:transform-none"><KeyRound size={18}/>{busy?t("purchase.gate.checking"):connecting?t("purchase.gate.reopen"):t("purchase.connect")}<ArrowUpRight size={16}/></button>
        {status&&<p role={issue||failed?"alert":"status"} className="text-sm leading-6 text-ink-secondary">{status}</p>}
        {(access.connected||issue==="secure_storage_unavailable")&&<div className="flex items-center gap-6"><button disabled={busy} onClick={()=>void act("refresh")} className="min-h-10 text-xs text-ink-secondary hover:text-ink">{t("purchase.refresh")}</button><button disabled={busy} onClick={()=>void act("signOut")} className="min-h-10 text-xs text-ink-secondary hover:text-ink">{t("purchase.reset")}</button></div>}
      </>}
    </main>
  </div>;
}
