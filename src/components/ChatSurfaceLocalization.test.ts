// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";
import type { Message } from "@/state/store";
import type { SkillRequestCardData } from "../../shared/skill-request";

const fixture = vi.hoisted(() => ({ api: vi.fn(), dispatch: vi.fn() }));
vi.mock("@/state/store", async original => ({
  ...await original<typeof import("@/state/store")>(),
  api: fixture.api,
  useStore: () => ({ state: { bots: [], groups: [] }, dispatch: fixture.dispatch }),
}));
vi.mock("@/lib/thread-preferences", () => ({ useShowThreads: () => true }));
vi.mock("@/lib/send-key", async original => ({ ...await original<typeof import("@/lib/send-key")>(), useSendKey: () => "enter" }));
vi.mock("./MenuMotion", () => ({ useMenuMotion: (open: boolean) => ({ shown: open, className: "", exitProps: {} }) }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

import { SearchResults } from "./SearchResults";
import { ConfirmDialogCard } from "./ConfirmDialog";
import { ExportTranscriptMenu } from "./ExportTranscriptMenu";
import { ComposerAttachments } from "./ComposerAttachments";
import { CitationBadge } from "./CitationUI";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";
import { CommandPalette, openCommandPalette } from "./CommandPalette";
import { SecretRequestCard } from "./SecretRequestCard";
import { SkillRequestPreview } from "./SkillRequestPreview";
import { LibrarySkillMeta } from "./SkillsSection";
import { citationAttachment } from "@/lib/citations";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  setLocale("de");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  fixture.api.mockReset().mockResolvedValue({ hits: [] });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); setLocale("en"); vi.useRealTimers(); });
const mount = async (element: React.ReactNode) => { await act(async () => root.render(element)); };
const click = async (selector: string) => { await act(async () => (document.querySelector(selector) as HTMLElement).click()); };

describe("German chat surfaces", () => {
  it("renders search results and no-results copy in German", async () => {
    vi.useFakeTimers();
    await mount(createElement(SearchResults, { query: "Meeting", onLanded: () => {} }));
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(host.textContent).toContain("Nachrichten");
    expect(host.textContent).toContain("Keine Nachrichten zu „Meeting“ gefunden");
  });

  it("keeps confirmation content and translates only the app-owned Cancel action", () => {
    const html = renderToStaticMarkup(createElement(ConfirmDialogCard, { open: true, title: "User title", body: "User body", confirmLabel: "User action", onConfirm: () => {}, onCancel: () => {} }));
    expect(html).toContain("Abbrechen");
    expect(html).toContain("User body");
    expect(html).toContain("User action");
  });

  it("opens localized export choices without changing conversation text", async () => {
    await mount(createElement(ExportTranscriptMenu, { title: "Original conversation", messages: [{ id: "message", role: "user", text: "Original text", at: 0 }] as Message[] }));
    await click('[aria-label="Unterhaltung exportieren"]');
    expect(host.textContent).toContain("Als Markdown kopieren");
    expect(host.textContent).toContain("Als .md herunterladen");
  });

  it("localizes attachment controls while preserving pasted content", () => {
    const html = renderToStaticMarkup(createElement(ComposerAttachments, { items: [{ kind: "paste", id: "paste", text: "Original pasted text", size: 20, lines: 1 }], onAdd: () => {}, onRemove: () => {}, onChangeCitation: () => {}, onDisplayInChatBox: () => {}, notice: null, onNotice: () => {}, uploadImage: async () => null }));
    expect(html).toContain("Original pasted text");
    expect(html).toContain("EINGEFÜGT");
    expect(html).toContain("Im Eingabefeld anzeigen");
    expect(html).toContain("Eingefügten Text entfernen");
  });

  it("opens localized citation controls without translating the quote", async () => {
    const citation = citationAttachment({ ownerType: "bot", ownerId: "bot", threadId: "thread", messageId: "message" }, { text: "Original quote", start: 0, end: 14, prefix: "", suffix: "" });
    await mount(createElement(CitationBadge, { citation, onChange: () => {}, onRemove: () => {}, onNavigate: async () => false }));
    await click('[aria-label="Zitat öffnen: Original quote"]');
    expect(document.body.textContent).toContain("Zitierte Nachricht");
    expect(document.body.textContent).toContain("Kommentar bearbeiten");
    expect(document.body.textContent).toContain("Original quote");
  });

  it("localizes keyboard descriptions and the command palette", async () => {
    const html = renderToStaticMarkup(createElement(KeyboardShortcutsModal, { open: true, onClose: () => {} }));
    expect(html).toContain("Tastenkürzel");
    expect(html).toContain("Nachricht senden");
    expect(html).toContain("Chat und Eingabefeld");
    await mount(createElement(CommandPalette));
    await act(async () => openCommandPalette());
    expect(document.querySelector('[aria-label="Befehlssuche"]')).not.toBeNull();
    expect(host.textContent).toContain("Noch keine Ziele zum Wechseln vorhanden");
  });

  it("retains masked credential entry and localizes the security notice", () => {
    const message = { id: "secret", role: "bot", kind: "secret", at: 0, text: "", secret: { target: "openaiImageApiKey", label: "OpenAI API key", description: "Original provider description", helpUrl: "https://platform.openai.com/api-keys", placeholder: "sk-…" } } as Message;
    const html = renderToStaticMarkup(createElement(SecretRequestCard, { botId: "bot", threadId: "thread", message }));
    expect(html).toContain('type="password"');
    expect(html).toContain("Sicher speichern");
    expect(html).toContain("Von SPDBot sicher gespeichert und niemals dem Chat hinzugefügt.");
    expect(html).toContain("Original provider description");
    expect(html).not.toMatch(/MausBot|OpenMausBot/);
  });

  it("preserves skill source bytes and the full-review safety requirement", () => {
    const request = { version: 1, requestId: "request", botId: "bot", threadId: "thread", stagedId: "staged", action: "update", name: "my-skill", gist: "", source: "local", preview: "Original skill instructions", sha256: "a".repeat(64), warnings: [], createdAt: 0 } as SkillRequestCardData;
    const html = renderToStaticMarkup(createElement(SkillRequestPreview, { request }));
    expect(html).toContain("Prüfe die vollständige SKILL.md, bevor du die aktuelle Version ersetzt");
    expect(html).toContain("Original skill instructions");
    expect(html).toContain("Quelle: local");
    const meta = renderToStaticMarkup(createElement(LibrarySkillMeta, { skill: { name: "my-skill", description: "", enabled: true, warnings: [], assignedBots: [], source: "local", importedAt: "2026-01-01T00:00:00Z", tags: [], version: "1.0" } }));
    expect(meta).toContain("Quelle: local");
  });
});
