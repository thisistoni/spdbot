import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";

vi.mock("@/components/Avatar", () => ({ MausAvatar: () => null }));
vi.mock("@/components/PluginsPanel", () => ({ ServiceIcon: () => null }));
vi.mock("@/state/store", () => ({ api: vi.fn() }));
vi.mock("@/lib/onboarding", () => ({ reducedMotion: () => true }));
import { AgentChat } from "./AgentChat";
import { Automations } from "./Automations";
import { Channels } from "./Channels";
import { Hands } from "./Hands";
import { Setup } from "./Setup";
import { Terminal } from "./Terminal";

afterEach(() => setLocale("en"));

describe("localized reel examples", () => {
  it("renders German demo conversations, statuses and forms after switching locale", () => {
    setLocale("de");
    for (const [Scene, expected] of [
      [AgentChat, ["Kannst du prüfen", "alle bestanden", "pnpm test"]],
      [Automations, ["Wochenbericht", "Ergebnis im Chat", "8 Uhr", "…/hooks/wh_7f3a"]],
      [Channels, ["@Recherche", "Zahlen der letzten Woche", "Nachricht an #Arbeit"]],
      [Hands, ["Termin um 15 Uhr", "Termin buchen", "Gebucht ✓", "clinic.example/book"]],
      [Setup, ["/setup", "beobachte Discord", "Alle 15 Min.", "~/bug-triage"]],
      [Terminal, ["Willkommen bei SPDBot", "Dein Name", "Weiter", "pnpm spdbot", "http://127.0.0.1:8899"]],
    ] as const) {
      const html = renderToStaticMarkup(createElement(Scene, { playing: false, label: "Demo" }));
      for (const text of expected) expect(html).toContain(text);
      expect(html).not.toMatch(/Welcome to OpenMausBot|Weekly report|>Researcher</);
    }
  });

  it("retains English source copy when switching back", () => {
    setLocale("de");
    renderToStaticMarkup(createElement(Hands, { playing: false, label: "Demo" }));
    setLocale("en");
    const html = renderToStaticMarkup(createElement(Hands, { playing: false, label: "Demo" }));
    expect(html).toContain("Book an appointment");
    expect(html).toContain("Cloud screen connected");
  });
});
