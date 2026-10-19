import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StoreProvider, type Bot } from "@/state/store";
import { stateForBot } from "@/lib/mascot";
import { BotProfileAvatarCard } from "./BotProfileAvatarCard";
import { PanelHero } from "./bot-panel/PanelHero";
import { AvatarEditorCard } from "./bot-panel/AvatarEditorCard";

function makeBot(overrides: Partial<Bot> = {}): Bot {
  return {
    id: "bot-1",
    threadId: "thread-1",
    name: "Maus",
    title: "Maus",
    description: "",
    notifications: false,
    color: "green",
    unread: false,
    modelSelection: { instanceId: "local", model: "test-model" },
    messages: [],
    ...overrides,
  };
}

function renderCard(bot: Bot, surface: "identity" | "panel" | "editor" = "identity") {
  const activeState = stateForBot(bot);
  const portrait = surface === "identity"
    ? createElement(BotProfileAvatarCard, { bot, activeState, mascotMotion: null, onPatch: vi.fn() })
    : surface === "panel"
      ? createElement(PanelHero, { bot, activeState, patch: vi.fn(), editorOpen: false, onToggleEditor: vi.fn() })
      : createElement(AvatarEditorCard, { bot, activeState, onPatch: vi.fn(), onClose: vi.fn() });
  return renderToStaticMarkup(
    createElement(StoreProvider, null, portrait),
  );
}

describe("BotProfileAvatarCard", () => {
  it("shows the generated default without obsolete body, color or expression pickers", () => {
    const markup = renderCard(makeBot());
    expect(markup).toContain("data:image/svg+xml");
    expect(markup).not.toContain('aria-label="Use the Cursor body"');
    expect(markup).not.toContain('aria-label="Use blue mascot color"');
    expect(markup).not.toContain('aria-label="Use happy expression"');
  });

  it("offers zoom and drag framing for a custom image", () => {
    const markup = renderCard(makeBot({
      avatarUrl: "/api/attachments/cat.webp",
      avatarCrop: "circle",
      avatarZoom: 1.5,
    }));
    expect(markup).toContain('aria-label="Zoom avatar"');
    expect(markup).toContain("Drag the picture to reposition it");
    expect(markup).toContain("150%");
    expect(markup).toContain("Reset framing");
  });

  it("hides zoom controls for the mascot", () => {
    const markup = renderCard(makeBot());
    expect(markup).not.toContain('aria-label="Zoom avatar"');
  });

  it("preserves uploaded images and their chosen crop", () => {
    for (const crop of ["circle", "rounded", "square"] as const) {
      const markup = renderCard(makeBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: crop }));
      expect(markup).toContain("/api/attachments/cat.webp");
      expect(markup).toContain(`bg-raised" style="width:168px;height:168px;border-radius:${crop === "circle" ? "50%" : crop === "rounded" ? "22%" : "0"}`);
    }
  });
});

describe.each(["identity", "panel", "editor"] as const)("%s portrait activity", (surface) => {
  it.each([
    { name: "Developer" }, { title: "Researcher" }, { mascotExpression: "working" }, { mascotExpression: "focused" },
  ])("keeps an idle profile %j from implying live work", (profile) => {
    const markup = renderCard(makeBot({ ...profile, busy: false }), surface);
    expect(markup).not.toContain("ring-inset");
  });

  it.each(["idle", "happy", "sleeping"])("shows real work despite a saved %s expression", (mascotExpression) => {
    const markup = renderCard(makeBot({ busy: true, activity: "working", mascotExpression }), surface);
    expect(markup).toContain("ring-inset ring-accent");
  });

  it("stops the work cue while waiting for approval", () => {
    const markup = renderCard(makeBot({ busy: true, activity: "waiting-on-you", mascotExpression: "working" }), surface);
    expect(markup).not.toContain("ring-inset");
  });

  it("keeps the same generated face through profile and activity changes", () => {
    const source = (markup: string) => markup.match(/<img src="([^"]+)"/)?.[1];
    const idle = renderCard(makeBot({ name: "Developer", busy: false }), surface);
    const working = renderCard(makeBot({ name: "Renamed", busy: true }), surface);
    const stopped = renderCard(makeBot({ name: "Researcher", busy: false }), surface);
    expect(source(idle)).toMatch(/^data:image\/svg\+xml/);
    expect(source(working)).toBe(source(idle));
    expect(source(stopped)).toBe(source(idle));
    expect(working).toContain("ring-inset");
    expect(stopped).not.toContain("ring-inset");
  });
});
