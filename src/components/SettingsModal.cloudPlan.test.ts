import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettingsSection } from "@/state/store";
import { SettingsModal } from "./SettingsModal";

const fixture = vi.hoisted(() => ({ section: "cloudAccount" as AppSettingsSection, config: undefined as { cloudHome?: boolean } | undefined, advanced: false }));
vi.mock("@/lib/interface-mode", () => ({ useAdvancedMode: () => fixture.advanced, setAdvancedMode: vi.fn() }));
vi.mock("./RoomTurnTimeoutSettings", () => ({ RoomTurnTimeoutSettings: () => null }));
vi.mock("./DesktopCapabilities", () => ({ useDesktopCapabilities: () => ({ capabilities: {} }) }));
vi.mock("@/state/store", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/state/store")>(),
  api: vi.fn(),
  useStore: () => ({ state: { appSettingsSection: fixture.section, config: fixture.config, instances: [], bots: [] }, dispatch: vi.fn() }),
}));
vi.mock("./OrganizationSettings", () => ({ OrganizationSettings: () => "ORGANIZATION_MARKER" }));
vi.mock("./CompanyBackupSettings", () => ({ CompanyBackupSettings: () => "COMPANY_BACKUP_MARKER" }));
vi.mock("./CloudAccountSettings", () => ({ CloudAccountSettings: ({ cloudHome }: { cloudHome?: boolean }) => `CLOUD_PLAN_MARKER${cloudHome ? " home" : ""}` }));

const plan = { state: vi.fn(), manage: vi.fn(), useThisComputer: vi.fn() };
beforeEach(() => {
  fixture.section = "cloudAccount"; fixture.config = undefined;
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
});
afterEach(() => { vi.unstubAllGlobals(); });
const render = () => renderToStaticMarkup(createElement(SettingsModal));

describe.each(["Simple", "Advanced"] as const)("%s SPDBot settings", (mode) => {
  beforeEach(() => { fixture.advanced = mode === "Advanced"; });
  it.each([false, true])("hides unsupported upstream accounts even with their desktop bridges (cloud home: %s)", (cloudHome) => {
    vi.stubGlobal("window", { ogb: { cloudAccount: {}, organization: {}, companyBackups: {}, cloudPlan: plan } });
    fixture.config = { cloudHome };
    for (const section of ["cloudAccount", "organization"] as const) {
      fixture.section = section;
      const html = render();
      expect(html).not.toContain("CLOUD_PLAN_MARKER");
      expect(html).not.toContain("ORGANIZATION_MARKER");
      expect(html).not.toContain('value="cloudAccount"');
      expect(html).not.toContain('value="organization"');
      expect(html).not.toContain('data-settings-page="account"');
      expect(html).not.toContain("MausBot Cloud");
      expect(html).toContain(mode === "Advanced" ? 'value="general" selected=""' : 'data-settings-block="general"');
    }
  });
  it("keeps local backups without promoting enterprise backup services", () => {
    fixture.section = "backups";
    vi.stubGlobal("window", { ogb: { organization: {}, companyBackups: {} } });
    const html = render();
    expect(html).not.toContain("COMPANY_BACKUP_MARKER");
    expect(html).toContain(mode === "Advanced" ? 'value="backups" selected=""' : 'data-settings-block="backups"');
  });
});
