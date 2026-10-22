import type { LocaleKey } from "@/locales";

export const SKIN_IDS = [
  "spd",
  "midnight",
  "atelier",
  "foundry",
  "lagoon",
  "graphite",
  "linen",
  "dusk",
  "daylight",
  "meadow",
] as const;
export type SkinId = (typeof SKIN_IDS)[number];

export type Skin = {
  id: SkinId;
  name: string;
  tagline: string;
  taglineKey?: LocaleKey;
};

export const SKINS: readonly Skin[] = [
  { id: "spd", name: "SPD", tagline: "Deep plum, soft lavender. SPD Studio.", taglineKey: "settings.skin.spd.tagline" },
  { id: "midnight", name: "Midnight", tagline: "The original. Cool and dark.", taglineKey: "settings.skin.midnight.tagline" },
  { id: "atelier", name: "Atelier", tagline: "Daylight on paper, warm and quiet.", taglineKey: "settings.skin.atelier.tagline" },
  { id: "foundry", name: "Foundry", tagline: "Night shift. Dark, warm, lit in brass.", taglineKey: "settings.skin.foundry.tagline" },
  { id: "lagoon", name: "Lagoon", tagline: "Cool daylight. Porcelain and deep teal.", taglineKey: "settings.skin.lagoon.tagline" },
  { id: "graphite", name: "Graphite", tagline: "Quiet charcoal and softened steel blue.", taglineKey: "settings.skin.graphite.tagline" },
  { id: "linen", name: "Linen", tagline: "Clean daylight with a restrained navy accent.", taglineKey: "settings.skin.linen.tagline" },
  { id: "dusk", name: "Dusk", tagline: "Muted plum after dark, calm and low-key.", taglineKey: "settings.skin.dusk.tagline" },
  { id: "daylight", name: "Daylight", tagline: "Midnight in reverse. Near-white, ink-black bubbles.", taglineKey: "settings.skin.daylight.tagline" },
  { id: "meadow", name: "Meadow", tagline: "Fresh white with a calm green.", taglineKey: "settings.skin.meadow.tagline" },
];

export const DEFAULT_SKIN: SkinId = "spd";

const KEY = "omb-skin";

function isSkinId(value: unknown): value is SkinId {
  return SKIN_IDS.includes(value as SkinId);
}

// With storage blocked the localStorage getter itself throws, and `typeof` alone doesn't shield it.
function getStore(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readSkin(): SkinId {
  try {
    const store = getStore();
    const stored = store?.getItem(KEY);
    if (isSkinId(stored)) return stored;
  } catch {
  }
  return DEFAULT_SKIN;
}

export function applySkin(id: SkinId): void {
  document.documentElement.dataset.skin = id;
  try {
    getStore()?.setItem(KEY, id);
  } catch {
  }
  // Keep the native window background in sync; Windows caption buttons use the CSS tokens.
  try {
    void window.ogb?.applySkin?.(id)?.catch(() => undefined);
  } catch {
  }
}
