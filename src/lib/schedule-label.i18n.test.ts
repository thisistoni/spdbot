import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "./i18n";
import { dayNames, durationLabel, localizedRoutineOverview, scheduleLabel, scheduleSentence } from "./schedule-label";
import { plainWhen } from "./automations";
import { cronDraftFor, cronEditorValue } from "@/components/routines/cron-editor";

afterEach(() => setLocale("en"));

describe("German routine presentation", () => {
  it("uses the active language for weekdays, intervals, restrictions and safety durations", () => {
    setLocale("de");
    expect(dayNames("long")[1]).toBe("Montag");
    expect(durationLabel(90)).toBe("1 Std. 30 Min.");
    const interval = { type: "interval" as const, everyMinutes: 5, anchorAt: 0, weekdays: [1, 2, 3, 4, 5], window: { start: "09:00", end: "17:00" }, endsAt: new Date(2026, 9, 30).getTime() };
    expect(scheduleLabel(interval)).toContain("Alle 5 Min. · montags bis freitags · 9:00–17:00 · bis");
    expect(scheduleSentence(interval)).toContain("alle 5 Minuten");
    setLocale("en");
    expect(dayNames("long")[1]).toBe("Monday");
  });

  it.each([
    ["0 9 1 * *", "Monatlich am 1. um 09:00"],
    ["30 8 L * *", "Monatlich am letzten Tag um 08:30"],
    ["0 9 1 1 *", "Jährlich am 1. Januar um 09:00"],
    ["0 9 * * 1#2", "Monatlich am zweiten Montag um 09:00"],
    ["0 9 * * 1-5", "Montags bis freitags um 09:00"],
    ["0 9 * * 1", "Wöchentlich am Montag um 09:00"],
    ["*/15 9-17 * * 1-5", "Cron */15 9-17 * * 1-5"],
  ])("localizes the cron label %s, not the expression or zone", (expression, label) => {
    setLocale("de");
    const schedule = { type: "cron" as const, expression, timeZone: "Asia/Kolkata" };
    expect(scheduleLabel(schedule)).toBe(`${label} · Asia/Kolkata`);
    expect(scheduleSentence(schedule)).toBe(`${label} · Asia/Kolkata`);
    expect(plainWhen(schedule)).toBe(expression.startsWith("*/15") ? "Nach einem eigenen Zeitplan" : `${label} · Asia/Kolkata`);
    expect(schedule.expression).toBe(expression);
  });

  it("translates exact server-owned overview grammar while preserving names and wall-clock times", () => {
    setLocale("de");
    expect(localizedRoutineOverview("Every 5 minutes: Inbox: Review. Next run 9:30 AM. Last run completed at 8:30 PM.")).toBe("Alle 5 Minuten: Inbox: Review. Nächster Durchlauf: 9:30. Letzter Durchlauf: Abgeschlossen, um 20:30.");
    expect(localizedRoutineOverview("Every day at 9:00 AM: Morning check. Next run 10:00 AM.")).toBe("Jeden Tag um 9:00: Morning check. Nächster Durchlauf: 10:00.");
    expect(localizedRoutineOverview("Once on October 19 at 12:00 PM: One-off.")).toBe("Einmal am 19. Oktober um 12:00: One-off.");
    expect(localizedRoutineOverview("Monthly on the last day at 09:00 · Europe/Berlin: Monatsbericht.")).toBe("Monatlich am letzten Tag um 09:00 · Europe/Berlin: Monatsbericht.");
    expect(localizedRoutineOverview("A user-written description: keep this unchanged.")).toBeNull();
    setLocale("en");
    expect(localizedRoutineOverview("Every hour: Inbox check.")).toBeNull();
  });

  it("translates cron validation without changing validation or scheduling", () => {
    setLocale("de");
    const after = Date.parse("2026-01-10T12:00:00Z");
    const draft = cronDraftFor(undefined, after);
    const invalid = cronEditorValue("cron", { ...draft, expression: "not cron" }, after);
    expect(invalid.schedule).toBeNull();
    expect(invalid.runs).toEqual([]);
    expect(invalid.error).toContain("Cron braucht fünf Felder");
    expect(cronEditorValue("monthly", { ...draft, time: "" }, after).error).toBe("Wähle eine Uhrzeit für diese Routine.");
  });
});
