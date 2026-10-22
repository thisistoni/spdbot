import { afterEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "./i18n";
import { transitionComputerControlLease } from "./computer-control";

afterEach(() => setLocale("en"));

describe("German computer control failures", () => {
  it.each(["take", "release"] as const)("localizes a refused %s without changing its gate", async (action) => {
    setLocale("de");
    const native = vi.fn(async () => true);
    await expect(transitionComputerControlLease({ action, syncNativeBrowser: true,
      requestControl: async () => ({ held: action !== "take", helpReason: null }),
      setNativeBrowserControl: native,
    })).rejects.toThrow(action === "take"
      ? "SPDBot konnte die Übernahme der Computersteuerung nicht bestätigen."
      : "SPDBot konnte die Computersteuerung nicht freigeben.");
    expect(native.mock.calls).toHaveLength(action === "take" ? 1 : 0);
  });

  it("does not request control when pausing the native browser fails", async () => {
    setLocale("de");
    const request = vi.fn();
    await expect(transitionComputerControlLease({ action: "take", syncNativeBrowser: true,
      requestControl: request, setNativeBrowserControl: async () => false,
    })).rejects.toThrow("SPDBot konnte den Browser dieses Bots nicht sicher anhalten.");
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves the native pause when a released browser cannot resume", async () => {
    setLocale("de");
    await expect(transitionComputerControlLease({ action: "release", syncNativeBrowser: true,
      requestControl: async () => ({ held: false, helpReason: null }), setNativeBrowserControl: async () => false,
    })).rejects.toThrow("Der Computer wurde freigegeben, aber der Browser bleibt zur Sicherheit angehalten.");
  });
});
