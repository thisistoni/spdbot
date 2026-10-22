import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLocale, t } from "@/lib/i18n";
import type { Bot } from "@/state/store";

vi.mock("@/state/store", async original => ({ ...await original<typeof import("@/state/store")>(), useStore: () => ({ state: { bots: [], instances: [] }, dispatch: vi.fn() }) }));
vi.mock("@/lib/thread-preferences", () => ({ useShowThreads: () => true }));
vi.mock("./Avatar", () => ({ BotAvatar: () => null }));
import { ConnectionDetail } from "./ConnectionDetail";
import { TurnNarrationRun } from "./TurnNarrationRun";
import { SelectPopup } from "./browser/SelectPopup";
import { TeamCanvas } from "./TeamCanvas";

afterEach(() => setLocale("en"));
describe("remaining German core labels", () => {
  it("localizes connection controls without exposing the hidden address", () => {
    setLocale("de");
    const html = renderToStaticMarkup(createElement(ConnectionDetail, { label: "Adresse", value: "private-server-address.example" }));
    expect(html).toContain("Anzeigen");
    expect(html).toContain('aria-label="Adresse kopieren"');
    expect(html).not.toContain("private-server-address.example");
  });

  it("localizes progress-toggle tooltips and preserves the provider's message", () => {
    setLocale("de");
    const html = renderToStaticMarkup(createElement(TurnNarrationRun, { label: "Original status", children: "Original progress" }));
    expect(html).toContain('title="Fortschrittsmeldungen anzeigen"');
    expect(html).toContain("Original status");
  });

  it("localizes browser popup accessibility without translating website choices", () => {
    setLocale("de");
    const html = renderToStaticMarkup(createElement(SelectPopup, { options: [{ label: "Original website option", disabled: false }], selectedIndex: 0, anchor: { left: 0, top: 0, width: 100, height: 20 }, bounds: { width: 200, height: 200 }, onChoose: () => {}, onClose: () => {} }));
    expect(html).toContain('aria-label="Option auswählen"');
    expect(html).toContain("Original website option");
  });

  it.each([['waiting-on-you', 'Wartet auf dich'], ['no-signal', 'Kein Signal'], ['working', 'Arbeitet']] as const)("localizes team status %s at the rendering boundary", (activity, expected) => {
    setLocale("de");
    const bot = { id: "bot", name: "Ada", activity, modelSelection: { instanceId: "test", model: "Original model" } } as Bot;
    const html = renderToStaticMarkup(createElement(TeamCanvas, { sections: [{ key: "team", name: "Original team", chiefs: [], members: [bot] }], canManage: false, onMove: async () => {}, onInstructions: () => {}, onEditTeam: () => {}, onDeleteTeam: () => {}, isEmpty: () => false }));
    expect(html).toContain(expected);
    expect(html).toContain("Original model");
  });

  it("routes mobile navigation and workspace examples through the catalog", () => {
    setLocale("de");
    const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    const workspaces = readFileSync(new URL("./WorkspacesSection.tsx", import.meta.url), "utf8");
    expect(app).toContain('aria-label={t("app.openBotList")}');
    expect(workspaces).toContain('placeholder={t("workspaces.userEmailPlaceholder")}');
    expect(t("app.openBotList")).toBe("Bot-Liste öffnen");
    expect(t("workspaces.userEmailPlaceholder")).toContain(" oder ");
  });
});
