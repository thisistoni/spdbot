import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKIN_IDS } from "./skins";

const values = new Map<string, string>();

// Each case loads fresh modules over the same storage, as a launch would; interface-mode keeps a per-session choice.
async function boot() {
  vi.resetModules();
  const [{ settleAdvancedModeDefault, readAdvancedMode }, skins] = await Promise.all([import("./interface-mode"), import("./skins")]);
  settleAdvancedModeDefault();
  skins.applySkin(skins.readSkin());
  return { skin: document.documentElement.dataset.skin, advanced: readAdvancedMode(), stored: values.get("omb-skin") };
}

beforeEach(() => {
  values.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", { documentElement: { dataset: {} as Record<string, string> } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("default skin", () => {
  it("opens a fresh install in Meadow, in Simple mode, and keeps it on the next launch", async () => {
    expect(await boot()).toEqual({ skin: "meadow", advanced: false, stored: "meadow" });
    values.set("omb-installed", "2026-10-17T00:00:00.000Z");
    expect(await boot()).toEqual({ skin: "meadow", advanced: false, stored: "meadow" });
  });

  it("keeps an install that ran before in Midnight when nobody picked a skin", async () => {
    values.set("omb-skin", "midnight");
    expect(await boot()).toMatchObject({ skin: "midnight", stored: "midnight" });
  });

  it("keeps Midnight for an earlier install whose saved skin is missing or no longer exists", async () => {
    values.set("omb-installed", "2026-01-01T00:00:00.000Z");
    expect(await boot()).toEqual({ skin: "midnight", advanced: true, stored: "midnight" });
    values.set("omb-skin", "retired-skin");
    expect(await boot()).toMatchObject({ skin: "midnight", stored: "midnight" });
  });

  it("always honours a skin someone chose", async () => {
    values.set("omb-skin", "lagoon");
    expect(await boot()).toMatchObject({ skin: "lagoon" });
    values.clear();
    values.set("omb-skin", "midnight");
    values.set("omb-advanced-mode", "0");
    expect(await boot()).toMatchObject({ skin: "midnight", advanced: false });
  });

  it.each(SKIN_IDS)("switches from %s to SPD and back across launches without changing preferences", async (id) => {
    const { applySkin } = await import("./skins");
    const { applyFont, readFont } = await import("./fonts");
    const desktopSkin = vi.fn().mockResolvedValue(true);
    Object.assign(window, { ogb: { applySkin: desktopSkin } });
    values.set("omb-advanced-mode", "0");
    values.set("omb-chat-width", "wide");
    applyFont("serif");
    applySkin(id);
    expect(await boot()).toMatchObject({ skin: id, stored: id });

    applySkin("spd");
    expect(desktopSkin).toHaveBeenLastCalledWith("spd");
    expect(await boot()).toEqual({ skin: "spd", stored: "spd", advanced: false });
    expect(readFont()).toBe("serif");
    expect(document.documentElement.dataset.font).toBe("serif");
    expect(values.get("omb-chat-width")).toBe("wide");

    applySkin(id);
    expect(await boot()).toMatchObject({ skin: id, stored: id });
    expect(desktopSkin).toHaveBeenLastCalledWith(id);
    expect(readFont()).toBe("serif");
  });

  it("applies SPD even if storage and the desktop bridge reject the change", async () => {
    const { applySkin } = await import("./skins");
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("storage blocked"); } });
    Object.assign(window, { ogb: { applySkin: vi.fn().mockRejectedValue(new Error("bridge unavailable")) } });
    expect(() => applySkin("spd")).not.toThrow();
    await Promise.resolve();
    expect(document.documentElement.dataset.skin).toBe("spd");
  });

  it("shows the persisted SPD selection and German description in Appearance", async () => {
    values.set("omb-skin", "spd");
    await boot();
    const { setLocale } = await import("./i18n");
    setLocale("de");
    const { SkinPicker } = await import("@/components/SkinPicker");
    const markup = renderToStaticMarkup(createElement(SkinPicker));
    const pressed = [...markup.matchAll(/aria-pressed="true"[\s\S]*?<div class="text-\[13px\] font-medium text-ink">([^<]+)</g)].map(([, name]) => name);
    expect(pressed).toEqual(["SPD"]);
    expect(markup).toContain("Dunkle Pflaume, sanftes Lavendel. SPD Studio.");
  });

  it("shows Meadow as the selected skin in Appearance on a fresh install", async () => {
    await boot();
    const { SkinPicker } = await import("@/components/SkinPicker");
    const markup = renderToStaticMarkup(createElement(SkinPicker));
    const pressed = [...markup.matchAll(/aria-pressed="true"[\s\S]*?<div class="text-\[13px\] font-medium text-ink">([^<]+)</g)].map(([, name]) => name);
    expect(pressed).toEqual(["Meadow"]);
  });
});
