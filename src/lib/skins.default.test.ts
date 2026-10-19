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
  it("opens a fresh install in SPD, in Simple mode, and keeps it on the next launch", async () => {
    expect(await boot()).toEqual({ skin: "spd", advanced: false, stored: "spd" });
    values.set("omb-installed", "2026-10-17T00:00:00.000Z");
    expect(await boot()).toEqual({ skin: "spd", advanced: false, stored: "spd" });
  });

  it.each([null, "", "retired-skin"])("uses SPD for an earlier install whose saved skin is %s", async (saved) => {
    values.set("omb-installed", "2026-01-01T00:00:00.000Z");
    if (saved !== null) values.set("omb-skin", saved);
    expect(await boot()).toEqual({ skin: "spd", advanced: true, stored: "spd" });
    expect(await boot()).toEqual({ skin: "spd", advanced: true, stored: "spd" });
  });

  it.each(SKIN_IDS)("preserves the saved %s choice on every launch", async (id) => {
    values.set("omb-skin", id);
    values.set("omb-advanced-mode", "0");
    expect(await boot()).toEqual({ skin: id, stored: id, advanced: false });
    expect(await boot()).toEqual({ skin: id, stored: id, advanced: false });
  });

  it("uses SPD when storage is unavailable or cannot be read", async () => {
    const { readSkin } = await import("./skins");
    vi.stubGlobal("localStorage", undefined);
    expect(readSkin()).toBe("spd");
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("storage blocked"); } });
    expect(readSkin()).toBe("spd");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("storage getter blocked"); } });
    expect(readSkin()).toBe("spd");
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

  it("shows SPD first and selected in Appearance on a fresh install", async () => {
    await boot();
    const { SkinPicker } = await import("@/components/SkinPicker");
    const markup = renderToStaticMarkup(createElement(SkinPicker));
    const pressed = [...markup.matchAll(/aria-pressed="true"[\s\S]*?<div class="text-\[13px\] font-medium text-ink">([^<]+)</g)].map(([, name]) => name);
    expect(pressed).toEqual(["SPD"]);
    const choices = [...markup.matchAll(/<div class="text-\[13px\] font-medium text-ink">([^<]+)</g)].map(([, name]) => name);
    expect(choices).toEqual(["SPD", "Midnight", "Atelier", "Foundry", "Lagoon", "Graphite", "Linen", "Dusk", "Daylight", "Meadow"]);
  });
});
