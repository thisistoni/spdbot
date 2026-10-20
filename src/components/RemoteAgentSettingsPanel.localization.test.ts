import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";
import type { Bot } from "@/state/store";
vi.mock("@/state/store", () => ({ api: vi.fn(), useStore: () => ({ dispatch: vi.fn() }) }));
vi.mock("./VoiceSettings", () => ({ VoiceSettings: () => null }));
vi.mock("./Avatar", () => ({ BotAvatar: () => null }));
vi.mock("@/components/DesktopCapabilities", () => ({ useCaptionChrome: () => ({ padClass: "", dragProps: {} }) }));
import { RemoteAgentSettingsPanel } from "./RemoteAgentSettingsPanel";
afterEach(() => setLocale("en"));
it("localizes the remote profile panel without altering the person's profile fields", () => {
  setLocale("de");
  const bot = { id: "b1", name: "Ada", title: "Custom title", description: "Original description", avatarUrl: "/uploads/avatar.png", notifications: true } as Bot;
  const html = renderToStaticMarkup(createElement(RemoteAgentSettingsPanel, { bot }));
  for (const text of ["Einstellungen des Remote-Agenten", "Titel", "Beschreibung", "Benachrichtigungen", "Eigenen Avatar entfernen", "Custom title", "Original description"]) expect(html).toContain(text);
  expect(html).not.toMatch(/Remote agent settings|Agent notifications|Enable completion|Remove custom avatar/);
  expect(html).toContain('accept="image/png,image/jpeg,image/gif,image/webp"');
});
