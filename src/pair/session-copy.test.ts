import { afterEach, expect, it } from "vitest";
import { setLocale } from "../lib/i18n";
import { BROWSER_SIGN_IN_FAILED, SERVICE_TRUST_REASON, defaultDeviceLabel } from "../lib/session";
import { sessionMessage } from "./session-copy";
afterEach(() => setLocale("en"));
it("localizes ownership, expired links and connection errors without modifying diagnostics", () => {
  setLocale("de");
  expect(sessionMessage(SERVICE_TRUST_REASON)).toContain("nicht als Eigentümer");
  expect(sessionMessage(BROWSER_SIGN_IN_FAILED)).toContain("Anmeldelink ist abgelaufen");
  expect(sessionMessage(BROWSER_SIGN_IN_FAILED)).not.toMatch(/Cloud|MausBot/);
  expect(sessionMessage("could not reach the server (ECONNREFUSED)")).toBe("Der Server ist nicht erreichbar (ECONNREFUSED)");
  expect(sessionMessage("provider-specific error 123")).toBe("provider-specific error 123");
});
it("keeps browser and OS names, and honors an explicit English selection", () => {
  setLocale("de"); expect(defaultDeviceLabel("Chrome/123 Windows")).toBe("Chrome auf Windows");
  setLocale("en"); expect(defaultDeviceLabel("Chrome/123 Windows")).toBe("Chrome on Windows");
});

it("translates actual pairing and email refusals, preserves retry times and external diagnostics", () => {
  setLocale("de");
  expect(sessionMessage("pairing code is wrong or has expired; create a new one on the server")).toBe("Der Kopplungscode ist falsch oder abgelaufen. Erstelle auf dem Server einen neuen Code.");
  expect(sessionMessage("too many failed pairing attempts from your address; try again in 73s")).toContain("73 Sekunden");
  expect(sessionMessage("too many failed sign-in attempts from your address; try again in 21s")).toContain("Anmeldeversuche von deiner Adresse. Versuche es in 21 Sekunden");
  expect(sessionMessage("the sign-in service could not be reached (provider_code (502)); try again in a moment")).toBe("Der Anmeldedienst ist nicht erreichbar (provider_code (502)). Versuche es gleich noch einmal.");
  expect(sessionMessage("Your session ended. Sign in again before creating a pairing code.")).toBe("Deine Sitzung ist beendet. Melde dich erneut an, bevor du einen Kopplungscode erstellst.");
  for (const detail of ["Provider says: that code is wrong", "constructor", "toString"]) expect(sessionMessage(detail)).toBe(detail);
  expect(sessionMessage("this server has no public address to put in a link: set OMB_PUBLIC_URL, or open /pair on the address you use and type the code")).toBe("Dieser Server hat keine öffentliche Adresse für einen Link. Setze OMB_PUBLIC_URL oder öffne /pair unter der Adresse, die du verwendest, und gib den Code ein.");
  setLocale("en");
  expect(sessionMessage("pairing code is wrong or has expired; create a new one on the server")).toBe("pairing code is wrong or has expired; create a new one on the server");
});
