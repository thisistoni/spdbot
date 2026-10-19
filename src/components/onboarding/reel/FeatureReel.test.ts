import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";

vi.mock("./scenes", () => ({
  REEL: ["agents", "hands", "setup", "channels", "automations", "terminal"],
  sceneFor: () => ({ label }: { label: string }) => createElement("div", { "aria-label": label }),
}));
import { FeatureReel } from "./FeatureReel";

beforeEach(() => setLocale("en"));

describe("the welcome reel", () => {
  it("renders the opening scene and all scene navigation labels in German", () => {
    setLocale("de");
    const html = renderToStaticMarkup(createElement(FeatureReel, {
      onNext: vi.fn(), onSkip: vi.fn(), setMascot: vi.fn(), bump: vi.fn(),
    }));
    expect(html).toContain("Jeder Chat gehört zu einem Agenten");
    expect(html).toContain("mit eigenem Modell, Gedächtnis und Charakter");
    expect(html).toContain('aria-label="Szenen"');
    expect(html).toContain('aria-label="Auch im Terminal starten"');
    expect(html).toContain("Weiter");
    expect(html).not.toContain("Every chat is a real agent");
  });
});
