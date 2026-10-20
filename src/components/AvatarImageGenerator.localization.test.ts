import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";
const f = vi.hoisted(() => ({ provider: "custom" }));
vi.mock("@/state/store", () => ({
  useStore: () => ({ state: { config: { imageGen: { provider: f.provider, configured: false, customKeyConfigured: true } } }, dispatch: vi.fn() }),
  api: vi.fn(),
}));
import { AvatarImageGenerator } from "./AvatarImageGenerator";
afterEach(() => setLocale("en"));
const render = () => renderToStaticMarkup(createElement(AvatarImageGenerator, {
  botLabel: "Fixture", disabled: false, generating: false, onGenerate: vi.fn(), onSavingChange: vi.fn(),
}));
it("explains custom server location in German without upstream product names", () => {
  f.provider = "custom"; setLocale("de");
  const html = render();
  expect(html).toContain("Eigener Anbieter");
  for (const label of ["Bildanbieter", "Basis-URL", "Bildmodell", "API-Schlüssel des eigenen Bildanbieters", "Verbindung speichern", "Vorgabe für die Avatar-Generierung", "Avatar generieren"]) expect(html).toContain(label);
  expect(html).not.toMatch(/Generate avatar|Connection settings|Save connection|Image provider/);
  expect(html).toContain("Entferne ihn für eine Verbindung ohne Schlüssel.");
  expect(html).toContain("localhost bezeichnet den SPDBot-Server");
  expect(html).not.toMatch(/OpenMaus|MausBot|OpenAI-compatible Images API/);
});
it("keeps the shared Grok credential warning visible and German", () => {
  f.provider = "xai"; setLocale("de");
  const html = render();
  expect(html).toContain("Wenn du ihn änderst oder entfernst, betrifft das auch andere Grok-Funktionen.");
  expect(html).toContain("Grok (xAI)");
  expect(html).not.toContain("Shares the Grok API key");
});
