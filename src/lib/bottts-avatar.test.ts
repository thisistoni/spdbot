import { Avatar, Style } from "@dicebear/core";
import definition from "@dicebear/styles/bottts-neutral.json";
import { describe, expect, it, vi } from "vitest";
import { BOTTTS_EYES, BOTTTS_MOUTHS, BOTTTS_TEXTURES, botttsAvatarSchema } from "../../shared/bottts-avatar";
import { botttsAvatarBackground, botttsAvatarUri } from "./bottts-avatar";

const style = new Style(definition);
const svg = (uri: string) => decodeURIComponent(uri.split(",")[1]!);

describe("customizable Bottts Neutral", () => {
  it("keeps existing seed-only avatars byte-for-byte, including after reset", () => {
    const original = new Avatar(style, { seed: "stable-bot" }).toDataUri();
    for (const options of [undefined, null, {}]) expect(botttsAvatarUri("stable-bot", options)).toBe(original);
  });
  it("tracks the exact pinned style variant lists", () => {
    expect(BOTTTS_EYES).toEqual(Object.keys(definition.components.eyes.variants));
    expect(BOTTTS_MOUTHS).toEqual(Object.keys(definition.components.mouth.variants));
    expect(BOTTTS_TEXTURES).toEqual(Object.keys(definition.components.texture.variants));
  });
  it("renders every supported face and texture override", () => {
    for (const eyes of BOTTTS_EYES) expect(botttsAvatarUri("bot", { eyes })).toBe(new Avatar(style, { seed: "bot", eyesVariant: eyes }).toDataUri());
    for (const mouth of BOTTTS_MOUTHS) expect(botttsAvatarUri("bot", { mouth })).toBe(new Avatar(style, { seed: "bot", mouthVariant: mouth }).toDataUri());
    for (const textureVariant of BOTTTS_TEXTURES) expect(botttsAvatarUri("bot", { texture: true, textureVariant })).toBe(new Avatar(style, { seed: "bot", textureProbability: 100, textureVariant }).toDataUri());
    expect(botttsAvatarUri("bot", { texture: false })).toBe(new Avatar(style, { seed: "bot", textureProbability: 0 }).toDataUri());
  });
  it("applies hex colors and shape independently of other settings", () => {
    expect(svg(botttsAvatarUri("bot", { backgroundColor: "#123456", radius: 50 }))).toContain("#123456");
    expect(botttsAvatarBackground("bot", { backgroundColor: "#123456" })).toBe("#123456");
    expect(botttsAvatarUri("bot", { radius: 22 })).toBe(new Avatar(style, { seed: "bot", borderRadius: 22 }).toDataUri());
  });
  it("uses saved options after the module/cache is reloaded", async () => {
    const options = { eyes: "hearts", mouth: "smile02", backgroundColor: "#ff8800", texture: false, radius: 50 } as const;
    const uri = botttsAvatarUri("bot", options);
    vi.resetModules();
    const reloaded = await import("./bottts-avatar");
    expect(reloaded.botttsAvatarUri("bot", options)).toBe(uri);
  });
  it("rejects unsupported or unsafe options without crashing persisted-data rendering", () => {
    for (const options of [{ eyes: "invented" }, { radius: 51 }, { radius: -1 }, { backgroundColor: "url(https://example.test)" }, { textureVariant: "invented" }, { unknown: true }]) {
      expect(botttsAvatarSchema.safeParse(options).success).toBe(false);
      expect(botttsAvatarUri("bot", options as never)).toBe(botttsAvatarUri("bot"));
    }
  });
});
