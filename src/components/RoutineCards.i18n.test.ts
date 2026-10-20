import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/lib/i18n";
import type { Message } from "@/state/store";
import { RoutineRunCard } from "./RoutineRunCard";
import { GoalRunCard } from "./GoalRunCard";

beforeEach(() => setLocale("de"));
afterEach(() => setLocale("en"));

describe("German routine and team-goal receipts", () => {
  it("labels a deferred run without confusing it with running or completed", () => {
    const message: Message = { id: "receipt", role: "bot", at: 1, kind: "routine.run", routineRun: { routineId: "routine", routineName: "Posteingang prüfen", runId: "run", status: "queued", deferredAt: 1, executionThreadId: "thread" } };
    const html = renderToStaticMarkup(createElement(RoutineRunCard, { message, onOpen: vi.fn() }));
    expect(html).toContain("Zurückgestellt: Ziel beschäftigt");
    expect(html).toContain('aria-label="Durchlauf öffnen für Posteingang prüfen"');
    expect(html).not.toContain("Deferred");
  });
  it("preserves the distinction between scheduler completion and a goal needing input", () => {
    const message: Message = { id: "receipt", role: "bot", at: 1, kind: "routine.run", routineRun: { routineId: "routine", routineName: "Freigabe", runId: "run", status: "completed", goalStatus: "needs-input", executionThreadId: "thread", summary: "Bitte die Freigabe prüfen." } };
    const html = renderToStaticMarkup(createElement(RoutineRunCard, { message, onOpen: vi.fn() }));
    expect(html).toContain('aria-label="Routinen-Durchlauf von Freigabe: Braucht deine Eingabe"');
    expect(html).toContain('aria-label="Prüfen für Freigabe"');
    expect(html).not.toContain(">Abgeschlossen<");
  });
  it("renders localized team progress and keeps the coordinator and authored goal unchanged", () => {
    const message: Message = { id: "goal", role: "bot", at: 1, kind: "goal.run", goalRun: { runId: "run", goal: "Launch announcement", status: "working", coordinatorBotId: "bot", coordinatorName: "Luna", turnCount: 2, maxTurns: 12, startedAt: 1 } };
    const html = renderToStaticMarkup(createElement(GoalRunCard, { message }));
    expect(html).toContain("Launch announcement");
    expect(html).toContain("Luna koordiniert · Schritt 3 von 12");
    expect(html).toContain('aria-label="Zieldurchlauf: In Arbeit"');
    expect(html).not.toContain("coordinating");
  });
});
