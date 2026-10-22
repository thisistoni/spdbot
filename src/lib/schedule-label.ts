import { atLocalTime } from "@/lib/routine-calendar";
import type { RoutineSchedule } from "@/lib/routines";
import { activeLocale, t } from "@/lib/i18n";
import { cronScheduleLabel as serverCronScheduleLabel } from "../../shared/cron-label";

/** Compute at render time so changing the app language also changes calendar labels. */
export function dayNames(style: "short" | "long" | "narrow" = "short"): string[] {
  return Array.from({ length: 7 }, (_, day) => new Date(2026, 0, 4 + day).toLocaleDateString(activeLocale(), { weekday: style }));
}

export function niceTime(at: number): string {
  return new Date(at).toLocaleTimeString(activeLocale(), { hour: "numeric", minute: "2-digit" });
}

export function niceDate(at: number): string {
  return new Date(at).toLocaleDateString(activeLocale(), { weekday: "long", month: "long", day: "numeric" });
}

export function whenLabel(at: number): string {
  const date = new Date(at);
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay ? niceTime(at) : date.toLocaleDateString(activeLocale(), { month: "short", day: "numeric" });
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return t("schedule.duration.minutes", { count: minutes });
  if (minutes % 60 === 0) return t("schedule.duration.hours", { count: minutes / 60 });
  return t("schedule.duration.mixed", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

export function intervalLabel(minutes: number): string {
  if (minutes < 60) return t("schedule.interval.minutes", { count: minutes });
  if (minutes === 60) return t("schedule.interval.hour");
  if (minutes % 60 === 0) return t("schedule.interval.hours", { count: minutes / 60 });
  return t("schedule.interval.mixed", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

function intervalRestrictions(schedule: Extract<RoutineSchedule, { type: "interval" }>): string[] {
  const details: string[] = [];
  if (schedule.weekdays && schedule.weekdays.length < 7) {
    details.push(schedule.weekdays.join(",") === "1,2,3,4,5"
      ? t("schedule.weekdays")
      : schedule.weekdays.map((day) => dayNames()[day]).join(", "));
  }
  if (schedule.window) {
    const wallTime = (time: string) => {
      const [hour, minute] = time.split(":").map(Number);
      return niceTime(new Date(2000, 0, 1, hour, minute).getTime());
    };
    details.push(`${wallTime(schedule.window.start)}–${wallTime(schedule.window.end)}`);
  }
  if (schedule.endsAt != null) {
    details.push(t("schedule.until", { date: new Date(schedule.endsAt).toLocaleDateString(activeLocale(), { month: "short", day: "numeric", year: "numeric" }) }));
  }
  return details;
}

/** Translate only the shared formatter's known presentation patterns. Unknown cron syntax stays exact. */
export function localizedCronScheduleLabel(schedule: Extract<RoutineSchedule, { type: "cron" }>): string {
  const suffix = ` · ${schedule.timeZone}`;
  const label = serverCronScheduleLabel(schedule).slice(0, -suffix.length);
  const translated = localizedSchedulePhrase(label);
  return `${translated ?? label}${suffix}`;
}

const ENGLISH_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ENGLISH_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "last"] as const;

/** Also handles server-generated bot overview phrases without touching names or scheduler data. */
export function localizedSchedulePhrase(phrase: string): string | null {
  let match: RegExpExecArray | null;
  if ((match = /^Every day at (.+)$/.exec(phrase))) return t("schedule.dailyAt", { time: localizedClockText(match[1]!) });
  if ((match = /^Every weekday at (.+)$/.exec(phrase))) return t("schedule.weekdaysAt", { time: localizedClockText(match[1]!) });
  if ((match = /^Weekly on (\w+) at (.+)$/.exec(phrase))) {
    const day = ENGLISH_DAYS.indexOf(match[1]!);
    if (day >= 0) return t("schedule.weeklyAt", { day: dayNames("long")[day]!, time: localizedClockText(match[2]!) });
  }
  if ((match = /^Monthly on the last day at (.+)$/.exec(phrase))) return t("schedule.cron.lastDay", { time: match[1]! });
  if ((match = /^Monthly on day (\d+) at (.+)$/.exec(phrase))) return t("schedule.cron.monthDay", { day: match[1]!, time: match[2]! });
  if ((match = /^Yearly on (\w+) (\d+) at (.+)$/.exec(phrase))) {
    const month = ENGLISH_MONTHS.indexOf(match[1]!);
    if (month >= 0) return t("schedule.cron.yearly", { month: new Date(2024, month, 1).toLocaleDateString(activeLocale(), { month: "long" }), day: match[2]!, time: match[3]! });
  }
  if ((match = /^Monthly on the (first|second|third|fourth|fifth|last) (\w+) at (.+)$/.exec(phrase))) {
    const day = ENGLISH_DAYS.indexOf(match[2]!);
    const order = ORDINALS.find((value) => value === match![1]);
    if (day >= 0 && order) return t("schedule.cron.nthWeekday", { order: t(`schedule.ordinal.${order}`), day: dayNames("long")[day]!, time: match[3]! });
  }
  if ((match = /^Every (\d+) minutes?$/.exec(phrase))) return t("automations.when.everyMinutes", { count: match[1]! });
  if (phrase === "Every hour") return t("automations.when.everyHour");
  if ((match = /^Every (\d+) hours?$/.exec(phrase))) return t("automations.when.everyHours", { count: match[1]! });
  if ((match = /^Every (\d+) hours? (\d+) minutes$/.exec(phrase))) return t("schedule.interval.mixed", { hours: match[1]!, minutes: match[2]! });
  if ((match = /^Once on (\w+) (\d+) at (.+)$/.exec(phrase))) {
    const month = ENGLISH_MONTHS.indexOf(match[1]!);
    if (month >= 0) return t("schedule.overview.once", { month: new Date(2024, month, 1).toLocaleDateString(activeLocale(), { month: "long" }), day: match[2]!, time: localizedClockText(match[3]!) });
  }
  if ((match = /^((?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)(?:, (?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday))*) at (.+)$/.exec(phrase))) {
    return t("schedule.daysAt", { days: match[1]!.split(", ").map(day => dayNames("long")[ENGLISH_DAYS.indexOf(day)]).join(", "), time: localizedClockText(match[2]!) });
  }
  if (phrase.startsWith("Cron ")) return phrase;
  const zone = /^(.*) · (\S+)$/.exec(phrase);
  if (zone) {
    const label = localizedSchedulePhrase(zone[1]!);
    if (label) return `${label} · ${zone[2]}`;
  }
  return null;
}

/** Parse only the server's fixed en-US wall-clock format, preserving the represented time zone. */
function localizedClockText(value: string): string {
  const match = /^(\d{1,2}):(\d{2}) ([AP]M)$/.exec(value);
  if (!match || activeLocale().startsWith("en")) return value;
  const hour = Number(match[1]) % 12 + (match[3] === "PM" ? 12 : 0);
  return niceTime(new Date(2000, 0, 1, hour, Number(match[2])).getTime());
}

/** Only complete, known app-generated overview lines are translated; user-written names remain verbatim. */
export function localizedRoutineOverview(line: string): string | null {
  if (activeLocale().startsWith("en")) return null;
  const match = /^(.+?): (.+?)\.(?: Next run (\d{1,2}:\d{2} [AP]M)\.)?(?: Last run (queued|running|waiting|completed|failed|cancelled|missed) at (\d{1,2}:\d{2} [AP]M)\.)?$/.exec(line);
  if (!match) return null;
  const schedule = localizedSchedulePhrase(match[1]!);
  if (!schedule) return null;
  const next = match[3] ? ` ${t("schedule.overview.next", { time: localizedClockText(match[3]) })}` : "";
  const last = match[4] && match[5] ? ` ${t("schedule.overview.last", { status: t(`routines.status.${match[4]}` as "routines.status.completed"), time: localizedClockText(match[5]) })}` : "";
  return `${schedule}: ${match[2]}.${next}${last}`;
}

export function scheduleLabel(schedule: RoutineSchedule | { type: "once"; at: number } | { type: "daily"; time: string; weekdays: number[] }): string {
  if (schedule.type === "cron") return localizedCronScheduleLabel(schedule);
  if (schedule.type === "once") return `${niceDate(schedule.at)}, ${niceTime(schedule.at)}`;
  if (schedule.type === "interval") return [intervalLabel(schedule.everyMinutes), ...intervalRestrictions(schedule)].join(" · ");
  const days = schedule.weekdays;
  const time = niceTime(atLocalTime(Date.now(), schedule.time));
  if (days.length === 7) return t("schedule.dailyAt", { time });
  if (days.join(",") === "1,2,3,4,5") return t("schedule.weekdaysAt", { time });
  if (days.length === 1) return t("schedule.weeklyAt", { day: dayNames()[days[0]!]!, time });
  return t("schedule.daysAt", { days: days.map((day) => dayNames()[day]).join(", "), time });
}

export function scheduleSentence(schedule: RoutineSchedule): string {
  if (schedule.type === "cron") return localizedCronScheduleLabel(schedule);
  if (schedule.type === "interval") {
    const minutes = schedule.everyMinutes;
    const cadence = minutes < 60 ? t("schedule.sentence.minutes", { count: minutes })
      : minutes === 60 ? t("schedule.sentence.hour")
        : minutes % 60 === 0 ? t("schedule.sentence.hours", { count: minutes / 60 })
          : t(Math.floor(minutes / 60) === 1 ? "schedule.sentence.mixedOne" : "schedule.sentence.mixed", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
    return [cadence, ...intervalRestrictions(schedule)].join(" · ");
  }
  if (schedule.type === "once") return t("schedule.sentence.once", { date: niceDate(schedule.at), time: niceTime(schedule.at) });
  const label = scheduleLabel(schedule);
  return label.charAt(0).toLocaleLowerCase(activeLocale()) + label.slice(1);
}
