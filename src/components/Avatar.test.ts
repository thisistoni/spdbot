import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  BotAvatar,
  MausAvatar,
  resolveBotAvatarOutcome,
  type BotAvatarProps,
  type MausAvatarProps,
} from "./Avatar";
import { MASCOT_BODIES } from "../../shared/mascot-bodies";
import { botttsAvatarUri } from "@/lib/bottts-avatar";

const render = (props: Partial<MausAvatarProps>) =>
  renderToStaticMarkup(createElement(MausAvatar, { color: "green", animated: false, ...props }));

const renderBot = (bot: Partial<BotAvatarProps["bot"]>) =>
  renderToStaticMarkup(
    createElement(BotAvatar, { bot: { color: "green", ...bot }, animated: false }),
  );

describe("MausAvatar body", () => {
  it("wears the cursor when no body is given", () => {
    expect(render({})).toContain(MASCOT_BODIES.cursor.fit);
  });

  it("wears the body it is given", () => {
    const markup = render({ bodyId: "star" });
    expect(markup).toContain(MASCOT_BODIES.star.fit);
  });

  it("falls back to the cursor for an unknown body", () => {
    // SAFETY: "hexagram" is deliberately not a MascotBodyId, to exercise the runtime fallback for persisted or streamed
    // data.
    expect(render({ bodyId: "hexagram" as MausAvatarProps["bodyId"] })).toContain(
      MASCOT_BODIES.cursor.fit,
    );
  });

  it("paints the body with the per-bot gradient, never a flat black fill", () => {
    const markup = render({ bodyId: "circle" });
    expect(markup).not.toContain('fill="#000000"');
    expect(markup).not.toContain("{{GRADIENT}}");
    expect(markup).toContain("url(#");
  });
});

describe("BotAvatar's two avatar outcomes", () => {
  it("zooms and positions a custom image inside its crop", () => {
    const markup = renderBot({
      avatarUrl: "/api/attachments/cat.webp",
      avatarCrop: "circle",
      avatarZoom: 2,
      avatarFocusX: 0.25,
      avatarFocusY: 0.75,
    });
    expect(markup).toContain("scale(2)");
    expect(markup).toContain("25% 75%");
    expect(markup).toContain("border-radius:50%");
  });

  it("renders a flat cropped image for circle/rounded/square, with no mascot at all", () => {
    const markup = renderBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "circle" });
    expect(markup).toContain("<img");
    expect(markup).not.toContain("<svg");
  });

  it("shows the image as it is, with no mascot face painted on it", () => {
    const markup = renderBot({ avatarUrl: "/api/attachments/cat.webp", avatarCrop: "square" });
    expect(markup).toContain("border-radius:0");
    expect(markup).toContain("<img");
    expect(markup).not.toContain("<image");
    expect(markup).not.toContain("radialGradient");
  });

  it("renders Bottts Neutral for the default crop, even if an uploaded image is retained", () => {
    const markup = renderBot({ id: "bot-1", avatarUrl: "/api/attachments/cat.webp", avatarCrop: "mascot" });
    expect(markup).toContain("data:image/svg+xml");
    expect(markup).not.toContain("/api/attachments/cat.webp");
  });

  it("falls back to Bottts when a flat crop has no valid image", () => {
    const markup = renderBot({ avatarUrl: undefined, avatarCrop: "circle" });
    expect(markup).toContain("data:image/svg+xml");
  });

  it("keeps the same face across names, colors, sizes and renders, but distinguishes bots", () => {
    const uri = (markup: string) => markup.match(/data:image\/svg\+xml[^" ]+/)?.[0];
    const first = renderBot({ id: "bot-1", name: "First", color: "green" });
    const renamed = renderBot({ id: "bot-1", name: "Renamed", color: "blue" });
    const other = renderBot({ id: "bot-2", name: "First", color: "green" });
    expect(uri(first)).toBeTruthy();
    expect(uri(renamed)).toBe(uri(first));
    expect(uri(other)).not.toBe(uri(first));
    expect(renderToStaticMarkup(createElement(BotAvatar, { bot: { id: "bot-1", color: "green" }, size: 18 }))).toContain('width="18"');
    expect(renderToStaticMarkup(createElement(BotAvatar, { bot: { id: "bot-1", color: "green" }, size: 220 }))).toContain('width="220"');
  });

  it("uses saved Bottts options and applies the chosen shape to its busy ring", () => {
    const bot = { id: "bot-1", color: "green" as const, botttsAvatar: { eyes: "hearts" as const, radius: 50 } };
    const markup = renderToStaticMarkup(createElement(BotAvatar, { bot, busy: true, size: 18 }));
    expect(markup).toContain("border-radius:50%");
    expect(markup).toContain(botttsAvatarUri("bot-1", bot.botttsAvatar).replaceAll("&", "&amp;"));
    expect(markup).toContain("ring-accent");
    const custom = renderBot({ ...bot, avatarUrl: "/api/attachments/cat.webp", avatarCrop: "square", avatarZoom: 2 });
    expect(custom).toContain("/api/attachments/cat.webp");
    expect(custom).toContain("border-radius:0");
    expect(custom).toContain("scale(2)");
  });

  it("keeps the same face after the renderer module is reloaded", async () => {
    const before = botttsAvatarUri("bot-1");
    vi.resetModules();
    const { botttsAvatarUri: reloaded } = await import("@/lib/bottts-avatar");
    expect(reloaded("bot-1")).toBe(before);
  });

  it("keeps a visible busy cue and a distinct sleeping state", () => {
    const bot = { id: "bot-1", color: "green" as const };
    expect(renderToStaticMarkup(createElement(BotAvatar, { bot, state: "working", busy: true }))).toContain("ring-accent");
    expect(renderToStaticMarkup(createElement(BotAvatar, { bot, state: "sleeping" }))).toContain("opacity-55");
  });

  it.each(["working", "thinking", "searching", "alerting"] as const)("does not infer live work from a %s expression", (state) => {
    expect(renderToStaticMarkup(createElement(BotAvatar, { bot: { id: "bot-1", color: "green" }, state }))).not.toContain("ring-inset");
  });
});

describe("resolveBotAvatarOutcome", () => {
  // imageFailed is set by the <img>'s onError, which renderToStaticMarkup never fires, so the decision is a pure
  // function.
  it("falls back to Bottts for an image that failed to load", () => {
    expect(
      resolveBotAvatarOutcome({ avatarCrop: "circle", hasUrl: true, imageFailed: true }),
    ).toBe("bottts");
  });

  it("renders a good flat image flat", () => {
    expect(
      resolveBotAvatarOutcome({ avatarCrop: "rounded", hasUrl: true, imageFailed: false }),
    ).toBe("flatImage");
  });

  it("keeps the default crop on Bottts even with a loaded image", () => {
    expect(
      resolveBotAvatarOutcome({ avatarCrop: "mascot", hasUrl: true, imageFailed: false }),
    ).toBe("bottts");
  });

  it("falls back to Bottts when there is no image at all", () => {
    expect(
      resolveBotAvatarOutcome({ avatarCrop: "square", hasUrl: false, imageFailed: false }),
    ).toBe("bottts");
  });
});
