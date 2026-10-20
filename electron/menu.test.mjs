import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { name: "SPDBot" },
  Menu: { buildFromTemplate: (template) => template },
}));

import { buildApplicationMenu } from "./menu.mjs";

describe("buildApplicationMenu", () => {
  const originalPlatform = process.platform;

  function withPlatform(platform, fn) {
    Object.defineProperty(process, "platform", { value: platform, configurable: true });
    try {
      return fn();
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    }
  }

  const environments = [{ id: "x", name: "X", origin: "http://localhost" }];
  const build = (platform, overrides = {}) =>
    withPlatform(platform, () =>
      buildApplicationMenu({
        environments,
        activeId: "x",
        onSwitch: vi.fn(),
        onAddFromClipboard: vi.fn(),
        onForget: vi.fn(),
        ...overrides,
      }),
    );

  it("macOS app menu wires an explicit Preferences item to the settings callback", () => {
    const onOpenSettings = vi.fn();
    const template = build("darwin", { onOpenSettings });
    const item = template[0].submenu.find((entry) => entry.label === "Einstellungen…");
    expect(item).toBeDefined();
    expect(item.accelerator).toBe("CmdOrCtrl+,");
    expect(item.click).toBeTypeOf("function");
    item.click();
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it.each(["linux", "win32"])("does not add an app menu on %s", (platform) => {
    const template = build(platform);
    expect(template[0].role).toBe("fileMenu");
    for (const item of template) {
      expect(item.label).not.toBe("OpenMausBot");
    }
  });

  it.each(["darwin", "linux", "win32"])("keeps unsupported organization and hosted-cloud offers out of the native menu on %s", platform => {
    const submenu = build(platform, { onOrganizationSignIn: vi.fn(), onAddCloud: vi.fn() })
      .find(entry => entry.label === "Server").submenu;
    expect(submenu.some(entry => ["organization-sign-in", "add-cloud"].includes(entry.id))).toBe(false);
    expect(submenu[0].label).toBe("Dieser Computer");
    expect(submenu.some(entry => entry.label === "Mit einem Server verbinden…")).toBe(true);
    expect(submenu.some(entry => entry.label?.startsWith("X —"))).toBe(true);
  });
});
