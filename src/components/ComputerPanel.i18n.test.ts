// Copy can freeze in the boot language in three places: a module-scope table, a message parked in state, and a sentence
// from a plain helper.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale, t } from "@/lib/i18n";
import { locales } from "@/locales";
import { screenPreviewFailure } from "@/lib/screen-preview";
import { localizeComputerProblem } from "@/lib/computer-messages";

const capabilities: DesktopCapabilities = {
  host: { platform: "linux", label: "Ubuntu", session: "x11", packaged: true },
  windowChrome: "native",
  screenPreview: { available: true, interaction: "portal-picker" },
  dictation: { available: false, engine: "none", onDevice: false },
  localComputer: { available: false, support: "supported", enabled: false, status: "disabled" },
};

vi.mock("./DesktopCapabilities", () => ({
  useDesktopCapabilities: () => ({ capabilities, ready: true }),
}));

const { LocalScreenPreview } = await import("./LocalScreenPreview");
const { CloudScreenPreview } = await import("./CloudScreenPreview");

afterEach(() => {
  setLocale("en");
});

describe("computer panel translation", () => {
  it("translates server-owned VM setup states and preserves runtime, driver and external details", () => {
    setLocale("de");
    expect(localizeComputerProblem("Install a supported container runtime first")).toBe("Installiere zuerst eine unterstützte Container-Laufzeit.");
    expect(localizeComputerProblem("Start podman first")).toBe("Starte zuerst podman.");
    expect(localizeComputerProblem("Prepare the Cua desktop image with Driver 0.20.0")).toBe("Bereite das Cua-Desktop-Image mit Treiber 0.20.0 vor.");
    for (const brand of ["OpenMausBot", "SPDBot"]) {
      expect(localizeComputerProblem(`The existing container was not created by ${brand}; recreate it`)).toContain("SPDBot");
    }
    expect(localizeComputerProblem("External runtime: fixture detail")).toBe("External runtime: fixture detail");
    setLocale("en");
    expect(localizeComputerProblem("Install a supported container runtime first")).toBe("Install a supported container runtime first");
    expect(localizeComputerProblem("Start podman first")).toBe("Start podman first");
  });

  it("resolves the local preview's phase copy at render, not at import", () => {
    expect(renderToStaticMarkup(createElement(LocalScreenPreview))).toContain(
      t("computer.screen.idle"),
    );

    setLocale("pt-br");
    const html = renderToStaticMarkup(createElement(LocalScreenPreview));
    expect(html).toContain(locales["pt-br"]!["computer.screen.idle"]);
    expect(html).toContain(locales["pt-br"]!["computer.screen.title"]);
    expect(html).not.toContain(locales.en["computer.screen.idle"]);
  });

  it("hands the caller a key for a failed screen request, not a sentence", () => {
    const failure = screenPreviewFailure(new DOMException("cancelled", "AbortError"));
    expect(failure).toMatchObject({ ok: false, phase: "cancelled" });

    setLocale("ja");
    expect(t(failure.messageKey)).toBe(locales.ja!["computer.screen.cancelled"]);
  });

  it("translates the cloud preview in every pack", () => {
    for (const [code, pack] of Object.entries(locales)) {
      setLocale(code);
      const html = renderToStaticMarkup(createElement(CloudScreenPreview, {
        src: null,
        name: "Atlas",
        error: null,
        starting: true,
        opening: false,
        disabled: false,
        onOpen: () => {},
        onRetry: () => {},
      }));
      expect(html, code).toContain(escapeHtml(pack["computer.phase.starting"]!));
    }
  });
});

function escapeHtml(value: string): string {
  return value.replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
}
