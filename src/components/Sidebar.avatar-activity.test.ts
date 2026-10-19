import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { initialState, type Bot } from "@/state/store";

vi.mock("./DesktopCapabilities", () => ({ useDesktopCapabilities: () => ({}) }));
vi.mock("@/lib/interface-mode", async (original) => ({
  ...await original<typeof import("@/lib/interface-mode")>(),
  useAdvancedMode: () => true,
}));

import { BotListItem, PinnedBotCircle, botRowProps } from "./Sidebar";

const bot = (overrides: Partial<Bot> = {}): Bot => ({
  id: "atlas", threadId: "thread-atlas", name: "Atlas", title: "", description: "",
  notifications: true, color: "green", unread: false, busy: false, activity: "idle",
  modelSelection: { instanceId: "fixture", model: "fixture" }, messages: [],
  ...overrides,
});
const imageSource = (markup: string) => markup.match(/<img src="([^"]+)"/)?.[1];

describe.each([
  ["sidebar row", BotListItem, 32],
  ["pinned circle", PinnedBotCircle, 64],
] as const)("%s avatar activity", (_name, Component, size) => {
  const render = (candidate: Bot) => renderToStaticMarkup(createElement(Component, botRowProps(
    initialState, vi.fn(), candidate, { density: "comfortable", quiet: false, query: "", onMenu: vi.fn() },
  )));

  it.each([
    { name: "Code" }, { title: "Developer" }, { description: "Research and investigate" },
    { mascotExpression: "working" }, { mascotExpression: "searching" }, { mascotExpression: "focused" },
  ])("leaves an idle bot's ring off despite its profile %j", (profile) => {
    const markup = render(bot(profile));
    expect(markup).not.toContain("ring-inset");
    expect(markup).not.toContain('data-testid="working-dot"');
  });

  it.each(["idle", "happy", "sleeping"])("shows real work despite the saved %s expression", (mascotExpression) => {
    const markup = render(bot({ busy: true, activity: "working", mascotExpression }));
    expect(markup).toContain("ring-inset ring-accent");
    expect(markup).toContain('data-testid="working-dot"');
  });

  it.each([{ busy: true }, { activity: "working" as const }])("shows a sibling thread's work %j", (activity) => {
    const markup = render(bot({ mascotExpression: "idle", tasks: [
      { threadId: "thread-atlas", title: "Current", createdAt: 1 },
      { threadId: "sibling", title: "Background", createdAt: 2, ...activity },
    ] }));
    expect(markup).toContain("ring-inset ring-accent");
    expect(markup).toContain('data-testid="working-dot"');
  });

  it("gives waiting for approval priority over busy cues", () => {
    const markup = render(bot({ busy: true, activity: "waiting-on-you", mascotExpression: "working" }));
    expect(markup).not.toContain("ring-inset");
    expect(markup).not.toContain('data-testid="working-dot"');
    expect(markup).toContain('data-testid="waiting-dot"');
  });

  it("keeps unread and sleeping cues without suggesting work", () => {
    const markup = render(bot({ unread: true, mascotExpression: "sleeping" }));
    expect(markup).not.toContain("ring-inset");
    expect(markup).toContain('aria-label="Unread threads"');
    expect(markup).toContain("opacity-55");
  });

  it("keeps the generated face and size when work starts and ends", () => {
    const idle = render(bot({ title: "Developer" }));
    const working = render(bot({ busy: true, activity: "working" }));
    const stopped = render(bot({ title: "Researcher" }));
    expect(imageSource(idle)).toMatch(/^data:image\/svg\+xml/);
    expect(imageSource(working)).toBe(imageSource(idle));
    expect(imageSource(stopped)).toBe(imageSource(idle));
    expect(working).toContain(`width="${size}" height="${size}"`);
    expect(stopped).not.toContain("ring-inset");
  });

  it("keeps a custom image's crop and framing while retaining its work dot", () => {
    const candidate = bot({ avatarUrl: "/api/attachments/portrait.png", avatarCrop: "circle",
      avatarZoom: 2, avatarFocusX: 0.25, avatarFocusY: 0.75 });
    const idle = render(candidate);
    const working = render({ ...candidate, busy: true, activity: "working" });
    expect(imageSource(idle)).toBe("/api/attachments/portrait.png");
    expect(imageSource(working)).toBe(imageSource(idle));
    expect(working).toContain("border-radius:50%");
    expect(working).toContain("scale(2)");
    expect(working).toContain("25% 75%");
    expect(working).toContain('data-testid="working-dot"');
  });
});
