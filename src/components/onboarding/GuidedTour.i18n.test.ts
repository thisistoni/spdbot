import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";
import { TOUR_STEPS, tourSteps } from "@/lib/guided-tour";
import de from "@/locales/de.json";

const fixture = vi.hoisted(() => ({ advanced: true, seen: [] as string[], api: vi.fn() }));
vi.mock("@/state/store", () => ({
  api: fixture.api,
  useStore: () => ({
    state: { config: { onboarding: { completedAt: "2026-10-19T00:00:00Z", hintsSeen: fixture.seen } } },
    dispatch: vi.fn(),
  }),
}));
vi.mock("@/lib/interface-mode", () => ({ readAdvancedMode: () => fixture.advanced, useAdvancedMode: () => fixture.advanced }));
vi.mock("@/lib/send-key", () => ({ useSendKey: () => "enter", sendKeyLabel: () => "Enter" }));
vi.mock("./Spotlight", () => ({
  Spotlight: ({ children, progress, primary, secondary }: {
    children: ReactNode; progress?: string; primary: { label: string }; secondary?: { label: string };
  }) => createElement("div", null, children, createElement("span", null, progress),
    createElement("button", null, primary.label), secondary && createElement("button", null, secondary.label)),
}));
import { GuidedTour } from "./GuidedTour";

beforeEach(() => {
  setLocale("de");
  vi.stubGlobal("window", {});
  fixture.seen = [];
  fixture.api.mockClear();
});
afterEach(() => { setLocale("en"); vi.unstubAllGlobals(); });

describe.each([true, false])("German guided tour (advanced=%s)", (advanced) => {
  it("renders each step and navigation in German, including the simple-mode variants", () => {
    fixture.advanced = advanced;
    for (const step of tourSteps(advanced)) {
      const key = step.copy ?? `onboarding.tour.${step.id.slice(5)}`;
      const translated = (de as Record<string, string>)[key];
      expect(translated, key).toBeTruthy();
      const html = renderToStaticMarkup(createElement(GuidedTour));
      expect(html, key).toContain(translated.replace("{key}", "Enter"));
      expect(html).not.toMatch(/\{key\}|Step \d|Skip tour|>Next<|>Finish</);
      if (step.id === "tour.done") {
        expect(html).toContain(">Fertig</button>");
        expect(html).not.toContain("Tour überspringen");
      } else {
        expect(html).toContain(`Schritt ${fixture.seen.length + 1} von ${TOUR_STEPS.length - 1}`);
        expect(html).toContain(">Weiter</button>");
        expect(html).toContain("Tour überspringen");
      }
      fixture.seen.push(step.id);
    }
    expect(renderToStaticMarkup(createElement(GuidedTour))).toBe("");
    expect(fixture.api).not.toHaveBeenCalled();
  });
});
