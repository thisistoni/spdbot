import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLocale, t } from "@/lib/i18n";
import type { Bot } from "@/state/store";

const fixture = vi.hoisted(() => ({
  state: { config: null, bots: [], routines: [], routineRuns: [], computerControl: {}, instances: [] } as Record<string, unknown>,
}));
vi.mock("@/state/store", async (original) => ({
  ...await original<typeof import("@/state/store")>(),
  useStore: () => ({ state: fixture.state, dispatch: vi.fn() }),
}));
vi.mock("./DesktopCapabilities", () => ({ useCaptionChrome: () => ({ padClass: "", dragProps: {} }) }));
vi.mock("./RoutinesPage", () => ({ RoutineEditor: () => null }));
vi.mock("./BrowserPanel", () => ({ BrowserPanel: () => null }));
vi.mock("./SignInRequestCard", () => ({ SignInBanner: () => null }));
vi.mock("@/lib/page-visible", () => ({ usePageVisible: () => true }));
const { RemoteDesktopPanel } = await import("./remote-desktop-panel");
const bot = { id: "bot", name: "Ada", cloudBackend: "vps", modelSelection: { instanceId: "test" } } as Bot;
const source = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
afterEach(() => setLocale("en"));

describe("visible core localization", () => {
  it("renders remote computer controls and permission explanations in German", () => {
    setLocale("de");
    const markup = renderToStaticMarkup(createElement(RemoteDesktopPanel, { bot }));
    for (const text of ["Computer von Ada", "VPS-Vorschau nicht verfügbar", "Zeitplan erstellen", "Zeitpläne", "temporäre, verschlüsselte Verbindung", "SSH- und VNC-Zugangsdaten", "gekoppelte Gerät"]) {
      expect(markup).toContain(text);
    }
    for (const text of ["Open the live desktop", "Take control", "Scheduled tasks", "Settings → Remote access", "MausBot", "OpenMausBot"]) {
      expect(markup).not.toContain(text);
    }
  });

  it("preserves English fallback and named bot content", () => {
    setLocale("en");
    const markup = renderToStaticMarkup(createElement(RemoteDesktopPanel, { bot }));
    expect(markup).toContain("Ada&#x27;s computer");
    expect(markup).toContain("Take control");
    expect(markup).toContain("Create schedule");
  });

  it("localizes provider safety copy without weakening the provider block", () => {
    setLocale("de");
    expect(t("chat.providerSafety.guidance")).toContain("SPDBot kann diese Sperre nicht aufheben");
    expect(t("chat.providerSafety.help")).toBe("Über die Sicherheitsprüfungen des Anbieters");
    expect(source("ChatView.tsx")).toContain('t("chat.providerSafety.guidance")');
    expect(source("ChatView.tsx")).toContain('href={PROVIDER_SAFETY_HELP_URL}');
    expect(source("ChatView.tsx")).not.toContain("{PROVIDER_SAFETY_GUIDANCE}");
  });

  it("removes the upstream community promotion without removing import choices", () => {
    const text = source("TeamLibraryPanel.tsx");
    expect(text).not.toContain("COMMUNITY_TEAMS_REPOSITORY");
    expect(text).not.toContain("milind-soni/openmausbot-teams");
    expect(text).not.toContain('t("templates.communityRepo")');
    expect(text).toContain('t("templates.projectPathPlaceholder")');
    expect(text).toContain('t("templates.invalidJson")');
    expect(text).toContain("const readFile = async (file: File)");
    expect(text).toContain("loadGithubTeam");
  });
});
