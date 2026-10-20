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
