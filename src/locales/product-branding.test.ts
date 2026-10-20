import { describe, expect, it } from "vitest";
import { locales } from "./index";

// Runtime catalogs must not revive upstream product offers through a fallback language.
// Required upstream attribution remains in LICENSE/NOTICE, not normal UI copy.
describe("SPDBot runtime catalog branding", () => {
  for (const [language, messages] of Object.entries(locales)) {
    it(`${language} contains no inherited product name or unpublished npm command`, () => {
      const invalid = Object.entries(messages).filter(([, value]) => /mausbot|openmaus|npx\s+spdbot/i.test(value));
      expect(invalid).toEqual([]);
    });
  }
});
