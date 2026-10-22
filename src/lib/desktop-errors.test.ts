import { afterEach, expect, it } from "vitest";
import { createRequire } from "node:module";
import { desktopErrorMessage } from "./desktop-errors";
import { setLocale } from "./i18n";

const { pairDesktopCompanion } = createRequire(import.meta.url)("../../electron/desktop-companion-client.mjs");

afterEach(() => setLocale("en"));

it("localizes actual native connection refusals without sending a pairing credential", async () => {
  setLocale("de");
  let requests = 0;
  const fetchImpl = async () => { requests++; throw new Error("must not send"); };
  for (const [endpoint, code, expected] of [
    ["http://192.168.1.2:8810", "123456", "Gib die HTTPS-Adresse des Desktop-Begleiters oder den vollständigen Tailscale-Namen mit der Endung .ts.net ein."],
    ["fixture.tail123.ts.net", "123", "Gib den sechsstelligen Code ein, der auf dem anderen Computer angezeigt wird."],
  ]) {
    const error = await pairDesktopCompanion({ endpoint, code, deviceName: "Fixture", fetchImpl }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    expect(desktopErrorMessage(error)).toBe(expected);
  }
  expect(requests).toBe(0);
});

it("keeps status codes and external diagnostics while honoring an explicit English selection", () => {
  const wrapped = new Error("Error invoking remote method 'credential:set': Error: The operating-system credential store could not be read this launch");
  setLocale("de");
  expect(desktopErrorMessage(wrapped)).toBe("Der Schlüsselspeicher des Betriebssystems konnte bei diesem Start nicht gelesen werden.");
  expect(desktopErrorMessage(new Error("The remote computer answered HTTP 429"))).toBe("Der entfernte Computer hat mit HTTP 429 geantwortet.");
  expect(desktopErrorMessage(new Error("Provider diagnostic: ECONNRESET\nTry later"))).toBe("Provider diagnostic: ECONNRESET\nTry later");
  expect(desktopErrorMessage(new Error("constructor"))).toBe("constructor");
  setLocale("en");
  expect(desktopErrorMessage(wrapped)).toBe("The operating-system credential store could not be read this launch.");
});
