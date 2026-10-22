import { join, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createUpdateChecker, installKind, isNewerVersion, LATEST_RELEASE_URL, DOCKER_UPDATE_GUIDE_URL } from "./update-check.ts";

const release = (tag: string) =>
  ({ ok: true, status: 200, json: async () => ({ tag_name: tag, html_url: `https://github.com/thisistoni/spdbot/releases/tag/${tag}` }) }) as Response;

describe("server update check", () => {
  it("tells how this server was installed", () => {
    const none = () => false;
    const root = ["", "srv", "OpenMausBot", "server"].join(sep);
    expect(installKind({ desktopManaged: true, managed: false, serverRoot: root, exists: () => true })).toBe("desktop");
    expect(installKind({ desktopManaged: false, managed: true, serverRoot: root, exists: () => true })).toBe("managed");
    expect(installKind({ desktopManaged: false, managed: false, serverRoot: root, exists: (path) => path === "/.dockerenv" })).toBe("docker");
    expect(installKind({ desktopManaged: false, managed: false, serverRoot: root, exists: (path) => path === "/run/.containerenv" })).toBe("podman");
    expect(installKind({
      desktopManaged: false, managed: false, exists: none,
      serverRoot: ["", "usr", "lib", "node_modules", "spdbot", "dist-server"].join(sep),
    })).toBe("npm");
    expect(installKind({ desktopManaged: false, managed: false, serverRoot: root, exists: (path) => path === join(root, "..", ".git") })).toBe("git");
    expect(installKind({ desktopManaged: false, managed: false, serverRoot: root, exists: none })).toBe("unknown");
  });

  it("compares release versions numerically and never reports a malformed one", () => {
    expect(isNewerVersion("v0.1.93", "0.1.92")).toBe(true);
    expect(isNewerVersion("0.1.10", "0.1.9")).toBe(true);
    expect(isNewerVersion("v0.2.0", "0.1.99")).toBe(true);
    expect(isNewerVersion("v0.1.92", "0.1.92")).toBe(false);
    expect(isNewerVersion("v0.1.91", "0.1.92")).toBe(false);
    expect(isNewerVersion("nightly", "0.1.92")).toBe(false);
    expect(isNewerVersion("v0.1.93", "unknown")).toBe(false);
    expect(isNewerVersion("v0.1.93", "0.1.93-rc.1")).toBe(true);
    expect(isNewerVersion("v0.1.93-rc.2", "0.1.93-rc.1")).toBe(true);
    expect(isNewerVersion("v0.1.93-rc.10", "0.1.93-rc.9")).toBe(true);
    expect(isNewerVersion("v0.1.93-rc.1", "0.1.93")).toBe(false);
    expect(isNewerVersion("v0.1.93-rc.1", "0.1.93-rc.1")).toBe(false);
    expect(isNewerVersion("v0.1.93-rc.1.1", "0.1.93-rc.1")).toBe(true);
  });

  it.each(["/local/app/dist-server", "/public/app/dist-server"])("keeps the Compose project choice with its operator (%s)", async (serverRoot) => {
    const install = installKind({ desktopManaged: false, managed: false, serverRoot, exists: (path) => path === "/.dockerenv" });
    expect(install).toBe("docker");
    const fetch = vi.fn(async () => release("v0.1.93"));
    const check = createUpdateChecker({ current: "0.1.92", install, fetch });
    expect(await check()).toEqual({
      current: "0.1.92",
      install: "docker",
      latest: "0.1.93",
      available: true,
      releaseUrl: "https://github.com/thisistoni/spdbot/releases/tag/v0.1.93",
      updateGuideUrl: DOCKER_UPDATE_GUIDE_URL,
    });
    expect(fetch).toHaveBeenCalledWith(LATEST_RELEASE_URL, expect.anything());
  });

  it("says up to date, and asks GitHub at most once an hour", async () => {
    let now = 0;
    const fetch = vi.fn(async () => release("v0.1.92"));
    const check = createUpdateChecker({ current: "0.1.92", install: "npm", fetch, now: () => now });
    expect(await check()).toMatchObject({ available: false, latest: "0.1.92" });
    now = 59 * 60_000;
    await check();
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 61 * 60_000;
    await check();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps npm installs on explicit local artifacts and never offers the MausBot updater", async () => {
    expect(LATEST_RELEASE_URL).toBe("https://api.github.com/repos/thisistoni/spdbot/releases/latest");
    const fetch = vi.fn(async () => release("v0.1.93"));
    const result = await createUpdateChecker({ current: "0.1.92", install: "npm", fetch })();
    expect(result.available).toBe(true);
    expect(result.releaseUrl).toBe("https://github.com/thisistoni/spdbot/releases/tag/v0.1.93");
    expect(result.command).toBeUndefined();
    expect(result.restart).toBeUndefined();
  });

  it("treats a not-yet-published first release as no update without consulting upstream", async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 404 }) as Response);
    const check = createUpdateChecker({ current: "0.1.92", install: "npm", fetch });
    expect(await check()).toEqual({ current: "0.1.92", install: "npm", available: false });
    await check();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(LATEST_RELEASE_URL, expect.anything());
  });

  it("does not look anything up for a desktop or hosted server", async () => {
    const fetch = vi.fn();
    for (const install of ["desktop", "managed"] as const) {
      expect(await createUpdateChecker({ current: "0.1.92", install, fetch })()).toEqual({ current: "0.1.92", install, available: false });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails clearly when GitHub cannot be reached, and tries again next time", async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }) as Response);
    const check = createUpdateChecker({ current: "0.1.92", install: "git", fetch });
    await expect(check()).rejects.toThrow("GitHub answered 403");
    fetch.mockImplementation(async () => release("v0.1.93"));
    expect(await check()).toMatchObject({ available: true, command: "git pull && pnpm install", restart: true });
  });
});
