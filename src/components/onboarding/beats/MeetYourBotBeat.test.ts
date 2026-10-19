import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";

vi.mock("@/components/Avatar", () => ({ MausAvatar: () => null }));
import { MeetYourBotBeat } from "./MeetYourBotBeat";

beforeEach(() => setLocale("en"));

describe("first bot setup", () => {
  it("renders the form, color controls, and start action in German", () => {
    setLocale("de");
    const html = renderToStaticMarkup(createElement(MeetYourBotBeat, {
      bot: null, onFinish: vi.fn(), setMascot: vi.fn(), bump: vi.fn(),
    }));
    expect(html).toContain("Gib deinem Bot einen Namen");
    expect(html).toContain("Bot-Name");
    expect(html).toContain('aria-label="Farbe"');
    expect(html).toContain('aria-label="Farbe: Grün"');
    expect(html).toContain("Eine dauerhafte Anweisung");
    expect(html).toContain("Chat starten");
  });
});
