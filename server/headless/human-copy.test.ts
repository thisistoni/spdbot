import { describe, expect, it } from "vitest";
import { USAGE, HEADLESS_USAGE } from "../cli-usage.ts";
import { HeadlessError } from "./args.ts";
import { VERB_HELP } from "./main.ts";
import { humanCliMessage } from "./human-copy.ts";
import { Output } from "./output.ts";

function capture(json = false) {
  const out: string[] = [], err: string[] = [];
  const output = new Output({ out: (line) => out.push(line), err: (line) => err.push(line), readStdin: async () => "" }, { json });
  return { out, err, output };
}

describe("SPDBot CLI presentation", () => {
  it("documents only supported checkout commands, without npm or hosted account advertising", () => {
    for (const help of [USAGE, HEADLESS_USAGE, ...Object.values(VERB_HELP)]) {
      expect(help).not.toMatch(/OpenMausBot|openmausbot|npm install -g|npx |--tunnel|OPENMAUSBOT_|OMB_PORT/);
      expect(help).toContain("pnpm spdbot");
    }
    expect(USAGE).toContain("pnpm spdbot pair");
    expect(USAGE).toContain("--port 8899");
    expect(USAGE).toContain("kein veröffentlichtes npm-Paket");
    expect(VERB_HELP.connect).toContain("Einstellungen → Fernzugriff");
    expect(humanCliMessage("open Settings → Phone → Set up a phone there, then pass --code CODE")).toContain("Server-Kopplungscode");
    expect(VERB_HELP.run).toContain("130 Strg+C (Arbeit läuft weiter)");
    expect(VERB_HELP["team apply"]).toContain("--prune löscht");
  });

  it("localizes human errors and recovery instructions, preserving their values", () => {
    const human = capture();
    human.output.error(new HeadlessError("no OpenMausBot server answered on 127.0.0.1 ports 8899, 18899, 28899", 5, "start one with `openmausbot serve`, or name one with --url or SPDBOT_URL"));
    expect(human.err).toEqual([
      "Fehler: Kein SPDBot-Server antwortet auf 127.0.0.1 an den Ports 8899, 18899, 28899.",
      "Hinweis: Starte einen Server mit pnpm spdbot serve oder gib ihn mit --url beziehungsweise SPDBOT_URL an.",
    ]);
    expect(humanCliMessage('no bot named "OpenMausBot archives"')).toBe('Kein Treffer für Bot mit dem Namen „OpenMausBot archives“.');
    expect(humanCliMessage("stopped waiting; the work keeps running")).toBe("Warten beendet; die Arbeit läuft weiter.");
    expect(humanCliMessage("wait again: openmausbot wait --thread t1 --since 1000")).toBe("Erneut warten: pnpm spdbot wait --thread t1 --since 1000");
  });

  it("does not change JSON errors, progress logs, provider errors or user content", () => {
    const raw = capture(true);
    const error = new HeadlessError("this OpenMausBot server cannot report a conversation's job", 5, "update OpenMausBot on the server");
    raw.output.error(error);
    expect(JSON.parse(raw.out[0]!)).toEqual({ ok: false, error: error.message, hint: error.hint, exitCode: 5 });
    raw.output.progress({ event: "run", message: "OpenMausBot diagnostic fixture", at: 123 });
    expect(JSON.parse(raw.err[0]!)).toEqual({ event: "run", message: "OpenMausBot diagnostic fixture", at: 123 });
    const external = "Provider failure: openmausbot is a user-supplied filename";
    expect(humanCliMessage(external)).toBe(external);
    const human = capture();
    human.output.result({}, [external]);
    expect(human.out).toEqual([external]);
  });

  it("still redacts secrets after formatting a human error", () => {
    const human = capture();
    human.output.error(new HeadlessError("not allowed: sk-ant-abcdefghijklmnopqrstuv0123", 5));
    expect(human.err.join("\n")).not.toContain("sk-ant-abcdefghijklmnopqrstuv0123");
    expect(human.err[0]).toContain("Fehler: Nicht erlaubt:");
  });
});

it("uses the actual SPDBot command and environment hints after identity integration", () => {
  expect(humanCliMessage("pass --url (or --port), or set SPDBOT_URL or OMB_PORT")).toBe("Übergib --url oder --port oder setze SPDBOT_URL.");
  expect(humanCliMessage("run spdbot help connect")).toBe("Rufe pnpm spdbot help connect auf.");
  expect(humanCliMessage("get one with `spdbot connect URL --out FILE`, then pass --token-file FILE or set SPDBOT_TOKEN")).toContain("--token-file FILE oder setze SPDBOT_TOKEN");
});
