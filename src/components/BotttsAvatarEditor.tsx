import type { Bot } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { BOTTTS_COLORS, botttsAvatarBackground, botttsAvatarUri } from "@/lib/bottts-avatar";
import { BOTTTS_EYES, BOTTTS_MOUTHS, BOTTTS_TEXTURES, botttsAvatarOptions, type BotttsAvatarOptions } from "../../shared/bottts-avatar";
import type { AvatarPatch } from "./avatar-editing";
import { Select } from "./Select";

/** Both profile editors use the same supported Bottts Neutral controls. */
export function BotttsAvatarEditor({ bot, disabled, onPatch }: {
  bot: Bot;
  disabled: boolean;
  onPatch: (patch: AvatarPatch) => void;
}) {
  const options = botttsAvatarOptions(bot.botttsAvatar);
  const seed = bot.id || bot.name || "bot";
  const change = (patch: Partial<BotttsAvatarOptions>) => {
    const next = { ...options, ...patch };
    for (const key of Object.keys(next) as Array<keyof BotttsAvatarOptions>) {
      if (next[key] === undefined) delete next[key];
    }
    // Selecting a control explicitly switches back to Bottts, never deletes a custom image or its framing.
    onPatch({ avatarCrop: "mascot", botttsAvatar: next });
  };
  const automatic = (active: boolean, onClick: () => void) => (
    <button type="button" disabled={disabled} aria-pressed={active} onClick={onClick}
      className={cn("rounded px-2 py-1 text-[11px] normal-case tracking-normal disabled:opacity-50", active ? "bg-control text-ink" : "text-ink-secondary hover:bg-control")}>
      {t("botttsAvatar.automatic")}
    </button>
  );

  return <div className="space-y-4" data-bottts-editor>
    <p className="text-[11.5px] text-ink-secondary">{t("botttsAvatar.hint")}</p>
    {(["eyes", "mouth"] as const).map((part) => <fieldset key={part} disabled={disabled}>
      <legend className="mb-2 flex w-full items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-secondary">{t(`botttsAvatar.${part}`)}</span>
        {automatic(options[part] === undefined, () => change({ [part]: undefined }))}
      </legend>
      <div className={cn("grid gap-1.5", part === "eyes" ? "grid-cols-7" : "grid-cols-5")}>
        {(part === "eyes" ? BOTTTS_EYES : BOTTTS_MOUTHS).map((value) => {
          const label = t(`botttsAvatar.${part}.${value}` as never);
          return <button key={value} type="button" disabled={disabled} aria-label={label} title={label}
            aria-pressed={options[part] === value} data-bottts-part={part} data-bottts-value={value}
            onClick={() => change({ [part]: value })}
            className={cn("flex min-h-10 items-center justify-center rounded-lg border p-1 hover:bg-control disabled:opacity-50", options[part] === value ? "border-accent-border bg-control" : "border-transparent")}>
            <img src={botttsAvatarUri(seed, { ...options, [part]: value })} alt="" width={36} height={36}
              className="size-9" style={{ borderRadius: `${options.radius ?? 22}%` }} />
          </button>;
        })}
      </div>
    </fieldset>)}

    <fieldset disabled={disabled}>
      <legend className="mb-2 flex w-full items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-secondary">{t("botttsAvatar.color")}</span>
        {automatic(options.backgroundColor === undefined, () => change({ backgroundColor: undefined }))}
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        {BOTTTS_COLORS.map((color) => <button key={color} type="button" disabled={disabled}
          aria-label={t("botttsAvatar.useColor", { color })} title={color}
          aria-pressed={options.backgroundColor?.toLowerCase() === color.toLowerCase()}
          onClick={() => change({ backgroundColor: color })}
          className={cn("size-7 rounded-full border border-ink/15 disabled:opacity-50", options.backgroundColor?.toLowerCase() === color.toLowerCase() && "ring-2 ring-accent-border ring-offset-2 ring-offset-card")}
          style={{ backgroundColor: color }} />)}
        <label className="flex items-center gap-2 text-[12px] text-ink-secondary">
          <input type="color" disabled={disabled} aria-label={t("botttsAvatar.customColor")}
            value={options.backgroundColor ?? botttsAvatarBackground(seed, options)}
            onChange={(event) => change({ backgroundColor: event.target.value })}
            className="h-7 w-8 cursor-pointer rounded bg-transparent" />
          {t("botttsAvatar.customColor")}
        </label>
      </div>
    </fieldset>

    <fieldset disabled={disabled}>
      <legend className="mb-2 text-[12px] font-medium text-ink-secondary">{t("botttsAvatar.shape")}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-inset p-1">
        {([0, 22, 50] as const).map((radius) => <button key={radius} type="button" disabled={disabled}
          aria-pressed={(options.radius ?? 22) === radius} data-bottts-radius={radius}
          onClick={() => change({ radius })}
          className={cn("rounded-md px-2 py-1.5 text-[12px] disabled:opacity-50", (options.radius ?? 22) === radius ? "bg-control text-ink" : "text-ink-secondary hover:bg-control")}>
          {t(radius === 0 ? "botPanel.avatar.square" : radius === 50 ? "botPanel.avatar.circle" : "botPanel.avatar.rounded")}
        </button>)}
      </div>
    </fieldset>

    <label className="flex items-center justify-between gap-3 text-[12px] text-ink-secondary">
      {t("botttsAvatar.texture")}
      <Select disabled={disabled} aria-label={t("botttsAvatar.texture")} size="sm"
        value={options.texture === false ? "none" : options.textureVariant ?? "auto"}
        onChange={(event) => change(event.target.value === "auto" ? { texture: undefined, textureVariant: undefined }
          : event.target.value === "none" ? { texture: false, textureVariant: undefined }
          : { texture: true, textureVariant: event.target.value as (typeof BOTTTS_TEXTURES)[number] })}
        className="min-w-0">
        <option value="auto">{t("botttsAvatar.automatic")}</option>
        <option value="none">{t("botttsAvatar.noTexture")}</option>
        {BOTTTS_TEXTURES.map((value) => <option key={value} value={value}>{t(`botttsAvatar.texture.${value}`)}</option>)}
      </Select>
    </label>
  </div>;
}
