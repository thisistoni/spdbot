import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CliOptions } from "./cli.ts";
import { SetupCancelled, type SetupIo } from "./cli-prompts.ts";
import { normalizePhoneOrigin, phonePairingInstructions, runPhoneSetup, type PhoneSetupDependencies } from "./cli-phone-setup.ts";

const options: CliOptions = {
  command: "start", port: 18799, dataDir: "/fixture/phone-home", tailscale: false,
  tunnel: false, pair: false, client: false, json: false,
};

function prompts(script: { choices?: Array<number | Error>; confirms?: boolean[]; answers?: Array<string | Error> } = {}) {
  const choices = [...script.choices ?? []];
  const confirms = [...script.confirms ?? []];
  const answers = [...script.answers ?? []];
  const lines: string[] = [];
  const take = <T>(values: Array<T | Error>, question: string): T => {
    if (!values.length) throw new Error(`Unexpected fixture prompt: ${question}`);
    const next = values.shift()!;
    if (next instanceof Error) throw next;
    return next;
  };
  const io: SetupIo = {
    log: vi.fn((line: string) => { lines.push(line); }),
    choose: vi.fn(async (question: string, choicesOffered: readonly string[]) => {
      lines.push(question, ...choicesOffered);
      return take(choices, question);
    }),
    ask: vi.fn(async (question: string) => take(answers, question)),
    secret: vi.fn(async () => { throw new Error("The fixture must inject account sign-in"); }),
    confirm: vi.fn(async (question: string) => { lines.push(question); return take(confirms, question); }),
  };
  return { io, lines, consumed: () => expect([choices, confirms, answers]).toEqual([[], [], []]) };
}

function dependencies() {
  return {
    accountReady: vi.fn<NonNullable<PhoneSetupDependencies["accountReady"]>>().mockReturnValue(false),
    login: vi.fn<PhoneSetupDependencies["login"]>().mockResolvedValue(0),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Phone setup fixtures must not use the network"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("phone origin validation", () => {
  it.each([
    ["https://maus.example", "https://maus.example"],
    ["  https://MAUS.example:443/  ", "https://maus.example"],
    ["https://mini.tail1234.ts.net:8443", "https://mini.tail1234.ts.net:8443"],
    ["https://[2001:db8::1]:8443/", "https://[2001:db8::1]:8443"],
  ])("normalizes an HTTPS origin without claiming reachability: %s", (input, expected) => {
    expect(normalizePhoneOrigin(input)).toBe(expected);
  });

  it.each([
    "", "not a url", "http://maus.example", "https:maus.example", "https:///maus.example", "https://@maus.example",
    "https://localhost", "https://localhost.",
    "https://mini.localhost", "https://127.0.0.1:8799", "https://127.1", "https://2130706433",
    "https://0.0.0.0", "https://[::]", "https://[::1]", "https://[::ffff:127.0.0.1]",
    "https://[::ffff:0.0.0.0]", "https://user:password@maus.example", "https://maus.example/pair",
    "https://maus.example/?token=secret", "https://maus.example/#code=ABCD-EFGH-JKLM",
    "https://maus.example/?", "https://maus.example/#", "https://maus.\nexample",
    "https://maus.example\\private", "openmausbot://pair?token=secret",
  ])("rejects a local, credential-bearing or non-origin input: %s", (input) => {
    expect(normalizePhoneOrigin(input)).toBeNull();
  });
});

describe("optional phone setup", () => {
  it("defaults to skipping without account access or changes", async () => {
    const deps = dependencies();
    const ui = prompts({ choices: [0] });
    const result = await runPhoneSetup(options, ui.io, deps);
    expect(result).toEqual({ options });
    expect(result.options).toBe(options);
    expect(ui.io.choose).toHaveBeenCalledWith("SPDBot im Browser auf deinem Telefon nutzen?", expect.any(Array), 0);
    expect(deps.accountReady).not.toHaveBeenCalled();
    expect(deps.login).not.toHaveBeenCalled();
    ui.consumed();
  });

  it("offers only existing Tailscale and HTTPS routes, defaulting to skip", async () => {
    const deps = dependencies();
    const ui = prompts({ choices: [1, 3] });
    expect(await runPhoneSetup(options, ui.io, deps)).toEqual({ options });
    expect(ui.io.choose).toHaveBeenLastCalledWith("Wie soll dein Telefon diesen Computer erreichen?", [
      "Vorhandenes Tailscale – nur dein Tailnet", "Vorhandene HTTPS-Adresse – erweiterte Einrichtung",
      "Zurück zur Telefonauswahl", "Vorerst überspringen",
    ], 3);
    expect(deps.accountReady).not.toHaveBeenCalled();
    expect(deps.login).not.toHaveBeenCalled();
    expect(ui.lines.join("\n")).not.toMatch(/OpenMausBot|Cloudflare|Managed|Konto/);
    ui.consumed();
  });

  it("refuses an explicit managed tunnel without inspection, login or a silent fallback", async () => {
    const deps = dependencies();
    const ui = prompts();
    const input = { ...options, tunnel: true };
    await expect(runPhoneSetup(input, ui.io, deps)).rejects.toThrow(/nicht verfügbar.*--tunnel.*keine Verbindung geändert/);
    expect(input.tunnel).toBe(true);
    expect(deps.accountReady).not.toHaveBeenCalled();
    expect(deps.login).not.toHaveBeenCalled();
    expect(ui.io.choose).not.toHaveBeenCalled();
    ui.consumed();
  });

  it("declining Tailscale exposure returns to routes and may skip without sign-in", async () => {
    const deps = dependencies();
    const ui = prompts({ choices: [2, 0, 3], confirms: [false] });
    expect(await runPhoneSetup(options, ui.io, deps)).toEqual({ options });
    expect(deps.accountReady).not.toHaveBeenCalled();
    expect(deps.login).not.toHaveBeenCalled();
    ui.consumed();
  });

  it("supports existing Tailscale only after consent, without installing it or signing in", async () => {
    const deps = dependencies();
    const ui = prompts({ choices: [2, 0], confirms: [true] });
    expect(await runPhoneSetup(options, ui.io, deps)).toEqual({
      phone: "android", options: { ...options, tailscale: true, publicUrl: undefined, client: true, pair: true },
    });
    expect(ui.io.confirm).toHaveBeenCalledWith(expect.stringContaining("Tailnet"), false);
    expect(deps.login).not.toHaveBeenCalled();
    expect(ui.lines.join("\n")).toContain("bereits installiert");
    ui.consumed();
  });

  it("rejects a pasted secret without echoing it, then accepts an advanced HTTPS origin", async () => {
    const deps = dependencies();
    const ui = prompts({ choices: [2, 1, 1], answers: ["https://user:secret@example.com/#code=credential", "https://maus.example/"] });
    expect(await runPhoneSetup(options, ui.io, deps)).toEqual({
      phone: "android", options: { ...options, publicUrl: "https://maus.example", client: true, pair: true },
    });
    expect(ui.lines.join("\n")).not.toContain("user:secret");
    expect(ui.lines.join("\n")).not.toContain("code=credential");
    expect(deps.login).not.toHaveBeenCalled();
    ui.consumed();
  });

  it("offers back and skip without enabling any route", async () => {
    const deps = dependencies();
    const ui = prompts({ choices: [1, 1, 2, 0], answers: [""] });
    expect(await runPhoneSetup(options, ui.io, deps)).toEqual({ options });
    expect(deps.login).not.toHaveBeenCalled();
    ui.consumed();
  });

  it.each([
    { publicUrl: "https://maus.example/" }, { tailscale: true },
  ])("reuses explicit existing route options without a nested chooser: %j", async (route) => {
    const deps = dependencies();
    deps.accountReady.mockReturnValue(true);
    const ui = prompts({ choices: [1] });
    const input = { ...options, ...route };
    const result = await runPhoneSetup(input, ui.io, deps);
    expect(result.phone).toBe("ios");
    expect(result.options.client).toBe(true);
    expect(ui.io.choose).toHaveBeenCalledTimes(1);
    expect(ui.io.confirm).not.toHaveBeenCalled();
    expect(deps.login).not.toHaveBeenCalled();
    ui.consumed();
  });

  it("does not mistake a localhost publicUrl for phone connectivity", async () => {
    const deps = dependencies();
    const ui = prompts({ choices: [1, 3] });
    const input = { ...options, publicUrl: "http://127.0.0.1:18799" };
    expect(await runPhoneSetup(input, ui.io, deps)).toEqual({ options: input });
    expect(ui.lines.join("\n")).toContain("localhost- oder LAN-IP-Link verbindet dein Telefon nicht");
    ui.consumed();
  });

  it("propagates Ctrl-C before route selection without changing options", async () => {
    const deps = dependencies();
    const ui = prompts({ choices: [new SetupCancelled()] });
    await expect(runPhoneSetup(options, ui.io, deps)).rejects.toBeInstanceOf(SetupCancelled);
    expect(deps.login).not.toHaveBeenCalled();
    expect(options.tunnel).toBe(false);
  });

  it("propagates Ctrl-C during URL entry without selecting or saving a route", async () => {
    const deps = dependencies();
    const ui = prompts({ choices: [1, 1], answers: [new SetupCancelled()] });
    await expect(runPhoneSetup(options, ui.io, deps)).rejects.toBeInstanceOf(SetupCancelled);
    expect(deps.login).not.toHaveBeenCalled();
    expect(options.tunnel).toBe(false);
  });

});

describe("phone pairing instructions", () => {
  it.each(["ios", "android"] as const)("refuses phone instructions for an unready %s route", (phone) => {
    const text = phonePairingInstructions(phone, { origin: "https://maus.example", ready: false }).join("\n");
    expect(text).toContain("noch nicht bereit");
    expect(text).not.toContain("https://maus.example");
    expect(text).not.toContain("bereits verbunden");
  });

  it.each(["https://localhost", "https://maus.example/#code=secret", null])("never repeats a local or credential-bearing origin: %s", (origin) => {
    const text = phonePairingInstructions("ios", { origin, ready: true }).join("\n");
    expect(text).toContain("noch nicht bereit");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("localhost");
  });

  it("describes iOS browser pairing without advertising an unavailable native app", () => {
    const text = phonePairingInstructions("ios", { origin: "https://maus.example", ready: true }).join("\n");
    expect(text).toContain("Safari");
    expect(text).toContain("separate SPDBot-App ist nicht erforderlich");
    expect(text).toContain("https://maus.example/pair");
    expect(text).toContain("allein koppelt das Telefon noch nicht");
    expect(text).toContain("keine Einstellungen oder Kopplungsverwaltung");
    expect(text).not.toMatch(/OpenMausBot|openmausbot:\/\/|apps\.apple|testflight|play\.google/);
  });

  it("sends Android users to browser pairing, not a native app", () => {
    const text = phonePairingInstructions("android", { origin: "https://maus.example", ready: true }).join("\n");
    expect(text).toContain("Scanne unter Android den QR-Code mit der Kamera");
    expect(text).toContain("um den Browser zu öffnen");
    expect(text).toContain("https://maus.example/pair");
    expect(text).not.toContain("not the Android native pairing scanner");
    expect(text).toContain("fünf Minuten");
  });
});
