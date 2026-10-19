import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StoreProvider, type Bot } from "@/state/store";
import { BotProfileAvatarCard } from "./BotProfileAvatarCard";

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

function renderCard(bot: Bot) {
  return renderToStaticMarkup(
    createElement(
      StoreProvider,
      null,
      createElement(BotProfileAvatarCard, {
        bot,
        activeState: "idle",
        mascotMotion: null,
        onPatch: vi.fn(),
      }),
    ),
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
