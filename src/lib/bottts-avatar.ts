import { Avatar, Style } from "@dicebear/core";
import botttsNeutral from "@dicebear/styles/bottts-neutral.json";
import { botttsAvatarOptions, type BotttsAvatarOptions } from "../../shared/bottts-avatar";

const style = new Style(botttsNeutral);
const avatars = new Map<string, { uri: string; background: string }>();
export const BOTTTS_COLORS = botttsNeutral.colors.background.values;

function avatarFor(seed: string, input?: BotttsAvatarOptions | null) {
  const options = botttsAvatarOptions(input);
  const key = JSON.stringify([seed, options]);
  const cached = avatars.get(key);
  if (cached) return cached;
  const avatar = new Avatar(style, {
    seed,
    ...(options.eyes === undefined ? {} : { eyesVariant: options.eyes }),
    ...(options.mouth === undefined ? {} : { mouthVariant: options.mouth }),
    ...(options.texture === undefined ? {} : { textureProbability: options.texture ? 100 : 0 }),
    ...(options.textureVariant === undefined ? {} : { textureVariant: options.textureVariant }),
    ...(options.backgroundColor === undefined ? {} : { backgroundColor: options.backgroundColor }),
    ...(options.radius === undefined ? {} : { borderRadius: options.radius }),
  });
  const resolved = avatar.toJSON().options.backgroundColor;
  const result = { uri: avatar.toDataUri(), background: typeof resolved === "string" ? resolved : resolved?.[0] ?? BOTTTS_COLORS[0]! };
  // Editors render many previews; keep the shared cache bounded.
  if (avatars.size >= 512) avatars.delete(avatars.keys().next().value!);
  avatars.set(key, result);
  return result;
}

/** The persisted bot ID keeps unedited faces stable across renames and reloads. */
export function botttsAvatarUri(seed: string, options?: BotttsAvatarOptions | null): string {
  return avatarFor(seed, options).uri;
}

export function botttsAvatarBackground(seed: string, options?: BotttsAvatarOptions | null): string {
  return avatarFor(seed, options).background;
}
