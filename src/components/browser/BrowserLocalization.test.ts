import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import { setLocale } from "@/lib/i18n";
import { AuthPrompt } from "./AuthPrompt";
import { ChromeRow } from "./ChromeRow";
import { MoreMenu } from "./MoreMenu";

afterEach(() => setLocale("en"));
const noop = () => {};

it("renders the entire built-in browser toolbar in German without changing page titles", () => {
  setLocale("de");
  const html = renderToStaticMarkup(createElement(ChromeRow, {
    botName: "Pepper", tabs: [{ tabId: "one", title: "Example website", url: "https://example.test", active: true }],
    nav: { url: "https://example.test", loading: false, canGoBack: true, canGoForward: true },
    connected: true, control: null, takeStatus: "", commandsReady: true, profileName: "Work profile", fullscreen: false, menu: null,
    onCommand: noop, onAddress: noop, onTake: noop, onHandBack: noop, onFullscreen: noop, onProfiles: noop,
  }));
  for (const text of ["Browser-Tabs", "Neuer Tab", "Zurück", "Vorwärts", "Seite neu laden", "Suchen oder Adresse eingeben", "Example website", "Browserprofil: Work profile"]) expect(html).toContain(text);
  expect(html).not.toMatch(/New tab|Browser address|Search or enter address|Connecting…/);
});

it("renders browser sizing and action menus in German", () => {
  setLocale("de");
  const html = renderToStaticMarkup(createElement(MoreMenu, { stream: true, ready: true, typing: true, setting: { mode: "fill" }, zoom: 1, pip: { open: false }, onViewport: noop, onZoom: noop, onPip: noop, onType: noop, onSecret: noop, onReconnect: noop, onRestart: noop }));
  for (const text of ["Browsermenü", "Seitengröße", "Bereich ausfüllen", "Telefon", "Bild-in-Bild öffnen", "Ansicht erneut verbinden", "Browser neu starten"]) expect(html).toContain(text);
});

it("localizes the HTTP-auth form and preserves the requesting website", () => {
  setLocale("de");
  const html = renderToStaticMarkup(createElement(AuthPrompt, { origin: "https://example.test", realm: "Private area", onAnswer: noop }));
  for (const text of ["Bei dieser Website anmelden", "Benutzername", "Passwort", "Abbrechen", "Anmelden", "https://example.test fragt nach „Private area“"]) expect(html).toContain(text);
  expect(html).toContain('type="password"');
  expect(html).not.toMatch(/Sign in|Username|Cancel/);
});
