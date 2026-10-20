import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, Bot } from "@/state/store";
import type { Routine, RoutineRun } from "@/lib/routines";

const fixture = vi.hoisted(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  return { advanced: false, state: undefined as AppState | undefined };
});
vi.mock("@/lib/interface-mode", () => ({ useAdvancedMode: () => fixture.advanced, setAdvancedMode: () => {} }));
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, useStore: () => ({ state: fixture.state ?? original.initialState, dispatch: vi.fn() }) };
});
vi.mock("./DesktopCapabilities", async (importOriginal) => ({
  ...await importOriginal<typeof import("./DesktopCapabilities")>(),
  useDesktopCapabilities: () => ({ capabilities: { host: {}, dictation: { available: false } }, ready: true }),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

const { initialState } = await import("@/state/store");
const { EventDetails, RoutineEditor } = await import("./RoutineCalendarPage");
const { setLocale } = await import("@/lib/i18n");
const { CronScheduleFields } = await import("./routines/CronScheduleFields");
const { MiniMonth } = await import("./routines/MiniMonth");
const bot = { id: "runner", threadId: "runner-main", name: "Runner", title: "", description: "", color: "green", notifications: true, unread: false, busy: false, messages: [], modelSelection: { instanceId: "test", model: "test" } } as Bot;
const routine: Routine = { id: "brief", name: "Morning brief", prompt: "Summarise my inbox.", target: "bot", botId: bot.id, runOn: "maus", enabled: true, schedule: { type: "daily", time: "06:30", weekdays: [0, 1, 2, 3, 4, 5, 6] }, durationMinutes: 30, nextRunAt: Date.now() + 3_600_000, createdAt: 0, updatedAt: 0 };
const runAt = (day: number, status: RoutineRun["status"]): RoutineRun => ({ id: `run-${day}`, routineId: routine.id, routineName: routine.name, target: "bot", botId: bot.id, runOn: "maus", scheduledFor: day * 86_400_000, createdAt: day * 86_400_000, startedAt: day * 86_400_000, finishedAt: day * 86_400_000 + 95_000, status, manual: false });
const routineItem = (definition: Routine, run: RoutineRun | null = null) => ({ kind: "routine" as const, id: `next-${definition.id}`, at: definition.nextRunAt ?? 0, durationMinutes: 30, routine: definition, run });
const markup = renderToStaticMarkup;
function details(item: Parameters<typeof EventDetails>[0]["item"]) {
  return { html: markup(createElement(EventDetails, { item, bots: [bot], onClose: vi.fn(), onEdit: vi.fn(), onCallChanged: vi.fn(), onOpenRoom: vi.fn(), onOpenRun: vi.fn() })) };
}
beforeEach(() => { fixture.advanced = false; fixture.state = { ...initialState, bots: [bot], routines: [routine], routineRuns: [] }; setLocale("de"); });
afterEach(() => setLocale("en"));
afterAll(() => vi.unstubAllGlobals());

describe("German routine screens", () => {
  it("renders the advanced interval editor and safety controls in German", () => {
    fixture.advanced = true;
    const value = { ...routine, schedule: { type: "interval" as const, everyMinutes: 15, anchorAt: Date.now() + 60_000 } };
    const html = markup(createElement(RoutineEditor, { routine: value, bots: [bot], onClose: vi.fn() }));
    for (const copy of ["Termin bearbeiten", "Wiederholung", "Ausführen alle", "Zeitraum", "Ganztägig", "Erweitert", "Sicherheitslimit der Routine", "Kein Limit", "Letzten Durchlauf merken", "SPDBot", "Anhang hinzufügen", "Speichern"]) expect(html, copy).toContain(copy);
    for (const copy of ["OpenMausBot", "Every X minutes", "Choose the days", "Stop if still running after", "Add attachment"]) expect(html, copy).not.toContain(copy);
  });

  it("renders German routine details and translated run status", () => {
    fixture.advanced = true;
    const { html } = details(routineItem(routine, { ...runAt(1, "waiting") }));
    for (const copy of ["Routinendetails", "Wartet", "Jeden Tag um", "Durchlauflimit", "Kein Zeitlimit", "Durchlauf abbrechen"]) expect(html, copy).toContain(copy);
    expect(html).not.toContain("This run is waiting");
  });

  it("renders monthly fields, localized month names and honest paused preview labels", () => {
    const html = markup(createElement(CronScheduleFields, { choice: "yearly", value: { expression: "0 9 1 10 *", day: "1", month: "10", time: "09:00", timeZone: "Europe/Berlin" }, onChange: vi.fn(), runs: [Date.UTC(2026, 9, 19, 9)], error: "" }));
    for (const copy of ["Oktober", "Letzter Tag", "Zeitzone", "Nächste Durchläufe", "Bei Zeitumstellungen"]) expect(html, copy).toContain(copy);
    expect(html).not.toContain("October");
    const mini = markup(createElement(MiniMonth, { anchor: new Date(2026, 9, 19).getTime(), onSelect: vi.fn() }));
    expect(mini).toContain('aria-label="Vorheriger Monat"');
    expect(mini).toContain("Oktober 2026");
  });
});
