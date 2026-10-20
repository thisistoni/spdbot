import { whenLabel } from "@/lib/schedule-label";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";

export interface HistoryRow {
  id: string;
  at: number;
  actor: string;
  via: string;
  field: string;
  summary: string;
  canRestore?: boolean;
  restoreUnavailableReason?: string;
  before?: string;
  after?: string;
}

const HISTORY_FIELDS: Record<string, LocaleKey> = {
  name: "botSettings.identity.name", title: "botSettings.identity.title", description: "botSettings.identity.blurb",
  cwd: "botAccess.folder.title", notifications: "notifications.title", speakReplies: "history.field.speakReplies",
};
const HISTORY_ACTORS: Record<string, LocaleKey> = {
  user: "history.actor.user", bot: "history.actor.bot", file: "history.actor.file", import: "history.actor.import", system: "history.actor.system",
};
const HISTORY_VIA: Record<string, LocaleKey> = {
  ui: "history.via.ui", api: "history.via.api", rollback: "history.via.rollback",
};

export function localizedHistorySummary(summary: string): string {
  const soul = /^soul: (\d+) → (\d+) bytes$/.exec(summary);
  if (soul) return t("history.soulChange", { before: soul[1]!, after: soul[2]! });
  const field = /^(name|title|description|cwd|notifications|speakReplies): (.+)$/.exec(summary);
  if (!field) return summary;
  // Translate only the app-owned prefix; user-entered values remain unchanged.
  const key = HISTORY_FIELDS[field[1]!];
  return key ? `${t(key)}: ${field[2]}` : summary;
}

export function HistorySection({
  bot,
  rows,
  refreshError,
  onRollback,
  rollingBack,
}: {
  bot: { id: string };
  rows: HistoryRow[] | null;
  refreshError?: boolean;
  onRollback: (id: string) => void;
  rollingBack?: boolean;
}) {
  if (!rows) {
    return <div className="text-[13px] text-ink-secondary">{t("history.loading")}</div>;
  }
  if (rows.length === 0) {
    return <div className="text-[13px] text-ink-secondary">{t("history.empty")}</div>;
  }

  const sorted = [...rows].sort((a, b) => b.at - a.at);

  return (
    <div className="flex flex-col gap-2">
      {refreshError && (
        <div className="rounded-lg bg-inset px-3 py-2 text-[12.5px] text-ink-secondary">{t("history.refreshError")}</div>
      )}
      {sorted.map((row) => (
        <div key={`${bot.id}-${row.id}`} className="rounded-xl bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink">
              <span className="text-ink-secondary">{whenLabel(row.at)}</span>
              {" · "}
              <span>
                {t("history.actorVia", { actor: HISTORY_ACTORS[row.actor] ? t(HISTORY_ACTORS[row.actor]!) : row.actor, via: HISTORY_VIA[row.via] ? t(HISTORY_VIA[row.via]!) : row.via })}
              </span>
              {" · "}
              <span>{localizedHistorySummary(row.summary)}</span>
            </div>
            {row.field === "soul" && row.canRestore === true && (
              <button
                type="button"
                disabled={rollingBack}
                onClick={() => onRollback(row.id)}
                className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-accent-text hover:bg-accent/10 disabled:opacity-50"
              >
                {t("history.undo")}
              </button>
            )}
          </div>
          {row.field === "soul" && row.canRestore !== true && (
            <p className="mt-2 text-[12px] leading-relaxed text-ink-secondary">
              {row.restoreUnavailableReason === "This version is missing exact text or contains redacted sensitive text and cannot be restored." ? t("history.restoreRedacted") : row.restoreUnavailableReason ?? t("history.restoreUnavailable")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
