import { describe, expect, it } from "vitest";
import { SKINS } from "../lib/skins";
import { en, locales } from "./index";

// Entry points reported in the German UI review. Component tests cover their
// rendered states; this catches accidental fallback when source keys change.
const entryKeys = [
  "settings.section.appearance", "settings.group.ai", "settings.group.computers", "settings.group.account", "place.local",
  "newBot.sections", "newBot.create", "model.variant.none", "settings.recovery.chooseEngine", "settings.recovery.chooseModel",
  "browser.chrome.connecting", "browser.chrome.tabs", "browser.chrome.newTab", "browser.setup.contactAdmin",
  "pairPage.connectTo", "pairPage.connectingTo", "pairPage.serviceTrust", "pairPage.expiredSignIn",
  "desktopWorkspaces.loading", "desktopWorkspaces.connectTitle", "desktopWorkspaces.address",
  "room.members.manage", "room.members.changed", "teamMap.byteCount", "skills.library.assignPickBot",
] as const satisfies readonly (keyof typeof en)[];

describe("German visible entry points", () => {
  it("has explicit German text rather than English fallback", () => {
    for (const key of entryKeys) expect(locales.de[key], key).toBeTruthy();
    expect(locales.de["settings.section.appearance"]).toBe("Darstellung");
    expect(locales.de["settings.group.ai"]).toBe("KI");
    expect(locales.de["place.local"]).toBe("Dieser Computer");
  });

  it("provides a German description for every existing theme without changing theme names", () => {
    for (const skin of SKINS) {
      expect(skin.taglineKey, skin.id).toBeTruthy();
      expect(locales.de[skin.taglineKey!], skin.id).toBeTruthy();
    }
  });

  it("does not expose the former product brand from any bundled catalog", () => {
    for (const [language, pack] of Object.entries(locales)) {
      for (const [key, value] of Object.entries(pack)) expect(value, `${language}:${key}`).not.toMatch(/MausBot|OpenMaus/i);
    }
  });
});
