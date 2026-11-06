// Real components, synthetic content, and no server/profile access.
import { createRoot } from "react-dom/client";
import { Spotlight } from "../../src/components/onboarding/Spotlight";
import { MeetYourBotBeat } from "../../src/components/onboarding/beats/MeetYourBotBeat";
import { BotAvatar } from "../../src/components/Avatar";
import { ChatWidthRow, FontRow, SidebarToolsLayoutRow } from "../../src/components/AppearanceSelectRows";
import { DEFAULT_BRAND } from "../../src/lib/brand";
import { setLocale, t } from "../../src/lib/i18n";
import { applySkin } from "../../src/lib/skins";
import type { Bot } from "../../src/state/store";
import "../../src/styles.css";

const query = new URLSearchParams(location.search);
setLocale(query.get("locale") ?? "de");
applySkin("spd");
document.documentElement.dataset.reducedMotion = "true";
const custom = "/api/attachments/fixture-custom.png";
const record = (action: string) => { document.body.dataset.action = action; };

createRoot(document.getElementById("root")!).render(
  query.get("view") === "bot" ? <main className="flex min-h-screen items-center justify-center bg-app p-6 text-ink"><div className="w-full max-w-[420px]"><MeetYourBotBeat bot={{ id: "fixture-custom", name: "Fixture", color: "green", avatarUrl: custom, avatarCrop: "circle", avatarZoom: 1.5, avatarFocusX: 0.25, avatarFocusY: 0.75 } as Bot} onFinish={() => record("done")} setMascot={() => {}} bump={() => {}} /></div></main> :
  query.get("view") === "appearance" ? <main className="flex min-h-screen items-center justify-center bg-app p-6 text-ink"><div className="w-full max-w-[480px]"><FontRow /><ChatWidthRow /><SidebarToolsLayoutRow /></div></main> :
  query.get("view") === "brand" ? <main className="flex min-h-screen items-center justify-center gap-6 bg-app p-6 text-ink">
    <img src={DEFAULT_BRAND.logo} width={72} height={72} alt="SPDBot" />
    <BotAvatar bot={{ id: "fixture-bot", name: "Fixture", color: "green" }} size={24} />
    <BotAvatar bot={{ id: "fixture-bot", name: "Fixture", color: "green" }} size={72} />
    <BotAvatar bot={{ id: "custom-bot", name: "Custom", color: "green", avatarUrl: custom, avatarCrop: "square" }} size={72} />
  </main> : <Spotlight anchor={null} placement="below" progress={t("onboarding.tour.progress", { current: 1, total: 10 })}
    primary={{ label: t("onboarding.tour.next"), onClick: () => record("next") }}
    secondary={{ label: t("onboarding.tour.skip"), onClick: () => record("skip") }}
    onDone={() => record("escape")}>
    {t("onboarding.welcome", { app: "SPDBot" })}
  </Spotlight>,
);
