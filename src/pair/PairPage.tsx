import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { DesktopWorkspaceSwitcher } from "../components/DesktopWorkspaceSwitcher";

import {
  defaultDeviceLabel,
  isConnected,
  newAttemptId,
  pairWithCode,
  readSessionState,
  reasonWorthShowing,
  startEmailSignIn,
  verifyEmailSignIn,
  type EnvironmentDescriptor,
  type SessionState,
} from "../lib/session";
import { sessionMessage } from "./session-copy";
import { pairedDestination } from "../lib/phone-pairing";

const input = "mt-1 w-full rounded-md border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink outline-none focus:border-accent-border";
const button = "mt-5 w-full rounded-md bg-accent px-4 py-2 text-[14px] font-medium text-accent-ink disabled:opacity-50";
const fieldLabel = "mt-4 block text-[12px] font-medium text-ink-secondary";

/** Only the desktop app pairs from a link at once; a browser asks, so a sent link cannot sign it in unseen. */
export function pairsAutomatically(initialCode: string | null, desktop = typeof window !== "undefined" && Boolean(window.ogb?.workspaces)): boolean {
  return Boolean(initialCode) && desktop;
}

export function pairIntro({ mode, sent, email, cloudHome }: { mode: "email" | "code" | null; sent: boolean; email: string; cloudHome: boolean }): string {
  if (mode === "email") return sent ? t("pairPage.emailSent", { email }) : t("pairPage.emailIntro");
  if (cloudHome) return t("pairPage.cloudIntro");
  return t("pairPage.codeIntro");
}

export function PairPage({ initialCode, initialEmail = null, reason }: { initialCode: string | null; initialEmail?: string | null; reason?: string }) {
  const [code, setCode] = useState(initialCode ?? "");
  const [label, setLabel] = useState(defaultDeviceLabel());
  const [environment, setEnvironment] = useState<EnvironmentDescriptor | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState(() => newAttemptId());
  const [mode, setMode] = useState<"email" | "code" | null>(initialCode ? "code" : null);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [opening, setOpening] = useState(() => pairsAutomatically(initialCode));

  useEffect(() => {
    if (!opening || !initialCode) return;
    let active = true;
    void pairWithCode({ code: initialCode, label, attemptId }).then((result) => {
      if (!active) return;
      if (result.ok) { location.replace(pairedDestination(location.search)); return; }
      setOpening(false);
      setError(sessionMessage(result.error));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void fetch("/.well-known/spdbot/environment")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: EnvironmentDescriptor | null) => {
        setEnvironment(d);
        setMode((current) => current ?? (d?.capabilities.emailSignIn ? "email" : "code"));
      })
      .catch(() => {
        setEnvironment(null);
        setMode((current) => current ?? "code");
      });
    void readSessionState().then(setSession);
  }, []);

  const connected = isConnected(session);
  const emailOffered = environment?.capabilities.emailSignIn === true;
  const cloudHome = environment?.capabilities.cloudHome === true;

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await pairWithCode({ code, label, attemptId });
    setBusy(false);
    if (result.ok) {
      location.replace(pairedDestination(location.search));
      return;
    }
    setError(sessionMessage(result.error));
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = sent ? await verifyEmailSignIn({ email, code: otp, label }) : await startEmailSignIn(email);
    setBusy(false);
    if (!result.ok) {
      setError(sessionMessage(result.error));
      return;
    }
    if (sent) {
      location.replace(pairedDestination(location.search));
      return;
    }
    setSent(true);
  }

  function switchMode(next: "email" | "code") {
    setMode(next);
    setError(null);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-6 text-ink">
      <div className="absolute left-3 top-12 max-w-[280px]"><DesktopWorkspaceSwitcher /></div>
      <div className="w-full max-w-[420px]">
        {opening ? (
          <p role="status" className="text-[20px] font-semibold">{cloudHome ? t("pairPage.openingCloud") : t("pairPage.connectingTo", { name: environment?.label ?? t("pairPage.appName") })}</p>
        ) : <>
        <h1 className="text-[20px] font-semibold">{cloudHome ? t("pairPage.cloudTitle") : t(mode === "email" ? "pairPage.signInTo" : "pairPage.connectTo", { name: environment?.label ?? t("pairPage.appName") })}</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-secondary">
          {environment && !cloudHome ? t("pairPage.version", { version: environment.version, platform: environment.platform }) : ""}
          {pairIntro({ mode, sent, email, cloudHome })}
        </p>
        {reasonWorthShowing(reason) && !connected ? <p className="mt-3 text-[13px] text-ink-secondary">{sessionMessage(reasonWorthShowing(reason)!)}</p> : null}
        {error && cloudHome && initialCode ? <p className="mt-3 text-[13px] text-ink-secondary">{t("pairPage.expiredCloud")}</p> : null}
        </>}
        {opening ? null : connected ? (
          <p className="mt-4 text-[13.5px]">
            {t("pairPage.connected")}{" "}
            <a href="/" className="text-accent underline">
              {t("pairPage.openApp")}
            </a>
          </p>
        ) : mode === "email" ? (
          <form onSubmit={submitEmail}>
            <label className={fieldLabel} htmlFor="signin-email">
              {t("pairPage.email")}
            </label>
            <input
              id="signin-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSent(false);
                setOtp("");
              }}
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              className={input}
            />
            {sent ? (
              <>
                <label className={fieldLabel} htmlFor="signin-code">
                  {t("pairPage.emailCode")}
                </label>
                <input
                  id="signin-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="12345678"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  spellCheck={false}
                  className={`${input} font-mono text-[15px] tracking-[0.12em]`}
                />
                <label className={fieldLabel} htmlFor="signin-label">
                  {t("pairPage.device")}
                </label>
                <input id="signin-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} className={input} />
              </>
            ) : null}
            {error ? <p className="mt-3 text-[13px] text-danger">{error}</p> : null}
            <button type="submit" disabled={busy || !email.includes("@") || (sent && otp.replace(/\D/g, "").length < 8)} className={button}>
              {busy ? (sent ? t("pairPage.signingIn") : t("pairPage.sending")) : sent ? t("pairPage.signIn") : t("pairPage.sendCode")}
            </button>
            {sent ? (
              <button type="button" onClick={() => setSent(false)} className="mt-3 w-full text-[13px] text-ink-secondary underline">
                {t("pairPage.newCode")}
              </button>
            ) : null}
            <button type="button" onClick={() => switchMode("code")} className="mt-3 w-full text-[13px] text-ink-secondary underline">
              {t("pairPage.usePairing")}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <label className={fieldLabel} htmlFor="pair-code">
              {t("pairPage.code")}
            </label>
            <input
              id="pair-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setAttemptId(newAttemptId());
              }}
              placeholder="XXXX-XXXX-XXXX"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              className={`${input} font-mono text-[15px] tracking-[0.12em]`}
            />
            <label className={fieldLabel} htmlFor="pair-label">
              {t("pairPage.device")}
            </label>
            <input id="pair-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} className={input} />
            {error ? <p className="mt-3 text-[13px] text-danger">{error}</p> : null}
            <button type="submit" disabled={busy || code.replace(/[^a-z0-9]/gi, "").length < 12} className={button}>
              {busy ? t("pairPage.connecting") : t("pairPage.connect")}
            </button>
            {emailOffered ? (
              <button type="button" onClick={() => switchMode("email")} className="mt-3 w-full text-[13px] text-ink-secondary underline">
                {t("pairPage.useEmail")}
              </button>
            ) : null}
          </form>
        )}
      </div>
    </main>
  );
}
