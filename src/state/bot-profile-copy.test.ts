import { describe, expect, it } from "vitest";
import type { Bot } from "./store";
import { botCopyProfile } from "./bot-profile-copy";

describe("copied avatar profile", () => {
  it("retains saved Bottts overrides and custom image framing without copying identity or execution grants", () => {
    const source = { id: "old", name: "Scout", botttsAvatar: { eyes: "hearts", radius: 50 }, avatarUrl: "/api/attachments/cat.webp", avatarCrop: "circle", avatarZoom: 2, avatarFocusX: 0.3, avatarFocusY: 0.7, approvalMode: "full" } as Bot;
    const copy = botCopyProfile(source);
    expect(copy).toMatchObject({ name: "Scout copy", botttsAvatar: source.botttsAvatar, avatarUrl: source.avatarUrl, avatarCrop: "circle", avatarZoom: 2, avatarFocusX: 0.3, avatarFocusY: 0.7 });
    expect(copy).not.toHaveProperty("id");
    expect(copy).not.toHaveProperty("approvalMode");
  });
});
