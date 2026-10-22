import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "@/lib/i18n";
import type { MemoryCapacity } from "@/lib/memory";
import { HistorySection, localizedHistorySummary } from "./HistorySection";
import { OverviewSection } from "./OverviewSection";
import { PromptPreview } from "./PromptPreview";

vi.mock("../DesktopCapabilities", () => ({
  useDesktopCapabilities: () => ({ capabilities: { host: { homeDir: undefined, platform: "other" } } }),
}));
const { MemoryGauge } = await import("./MemorySection");
const { SkillReviewDialog } = await import("./SkillsSection");

afterEach(() => setLocale("en"));
const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element).replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
const capacity = (overrides: Partial<MemoryCapacity> = {}): MemoryCapacity => ({
  lines: 201, bytes: 1_000, maxLines: 200, maxBytes: 24_000, loadedLines: 200, loadedBytes: 1_000,
  truncated: true, hash: "fixture", ...overrides,
});

describe("German bot settings copy", () => {
  it("translates skill review controls without altering the SKILL.md content", () => {
    setLocale("de");
    const source = "# Keep this source exactly\nUse native:search_tool.";
    const html = render(createElement(SkillReviewDialog, {
      skill: { name: "audit", description: "", enabled: false, source: "local-import", warnings: [] },
      text: source, error: "", working: false, onCancel: vi.fn(), onEnable: vi.fn(),
    }));
    expect(html).toContain("Prüfe audit vor der Aktivierung");
    expect(html).toContain("Quelle: local-import");
    expect(html).toContain("Geprüften Skill aktivieren");
    expect(html).toContain("Abbrechen");
    expect(html).toContain(source);
    expect(html).not.toContain("Enable reviewed skill");
  });

  it("translates both line-limit and byte-limit warnings", () => {
    setLocale("de");
    const lineHtml = render(createElement(MemoryGauge, { index: capacity() }));
    expect(lineHtml).toContain("201 / 200 Zeilen");
    expect(lineHtml).toContain("1 Zeile wird nicht geladen");
    const byteHtml = render(createElement(MemoryGauge, { index: capacity({ lines: 100, loadedLines: 100, bytes: 26_000, loadedBytes: 24_000 }) }));
    expect(byteHtml).toContain("Der Rest wird nicht geladen");
    expect(byteHtml).not.toContain("not being loaded");
  });

  it("translates known prompt labels and preserves exact prompt text and unfamiliar metadata", () => {
    setLocale("de");
    const rawPrompt = "You are Scout. Keep this prompt byte-for-byte.";
    const html = render(createElement(PromptPreview, {
      data: {
        sections: [
          { id: "persona", label: "Identity", text: rawPrompt, bytes: 50 },
          { id: "future-section", label: "Custom label", text: "Custom content", bytes: 14 },
        ],
        totalBytes: 64, approxTokens: 16,
        note: "Preview from current bot settings, not the exact prompt of a running task. Task folders, notes, recall, selected skills and available connections can change the dispatched prompt. Token count is an estimate.",
      }, open: true, onToggle: vi.fn(),
    }));
    expect(html).toContain("Identität");
    expect(html).toContain("Die Token-Anzahl ist eine Schätzung");
    expect(html).toContain(rawPrompt);
    expect(html).toContain("Custom label");
    expect(html).toContain("Custom content");
  });

  it("translates history metadata without translating profile values or unknown history entries", () => {
    setLocale("de");
    expect(localizedHistorySummary('title: "English title" → "Keep me"')).toBe('Rolle: "English title" → "Keep me"');
    expect(localizedHistorySummary("soul: 12 → 24 bytes")).toBe("Anweisungen: 12 → 24 Bytes");
    expect(localizedHistorySummary("Custom historical entry")).toBe("Custom historical entry");
    const html = render(createElement(HistorySection, {
      bot: { id: "fixture" }, rows: [{ id: "change", at: 0, actor: "user", via: "ui", field: "soul", summary: "soul: 12 → 24 bytes", canRestore: false,
        restoreUnavailableReason: "This version is missing exact text or contains redacted sensitive text and cannot be restored." }],
      onRollback: vi.fn(),
    }));
    expect(html).toContain("Du über Einstellungen");
    expect(html).toContain("sensible Textstellen wurden ausgeblendet");
  });

  it("translates generated overview facts but retains arbitrary names, paths and user descriptions", () => {
    setLocale("de");
    const html = render(createElement(OverviewSection, {
      overview: {
        who: { name: "Scout", title: "Keep my role", blurb: "Keep my description", soulLead: "" },
        does: ["Paused: Daily briefing.", "Knows how to audit invoices.", "Listens for “my-hook” webhooks."],
        reaches: ["Works in /tmp/keep-my-path.", "Can use 1 connected app: gmail.", "Can talk to 2 other bots in its allowed teams."],
        wont: ["Command approvals follow the provider's custom configuration.", "Can't use a computer."],
        recent: [],
      }, prompt: null, onOpen: vi.fn(),
    }));
    expect(html).toContain("Pausiert: Daily briefing.");
    expect(html).toContain("Arbeitet in /tmp/keep-my-path.");
    expect(html).toContain("Kann mit 2 weiteren Bots in den erlaubten Teams sprechen.");
    expect(html).toContain("Kann keinen Computer nutzen.");
    expect(html).toContain("Keep my description");
  });
});
