import { Avatar, Style } from "@dicebear/core";
import botttsNeutral from "@dicebear/styles/bottts-neutral.json";

const style = new Style(botttsNeutral);
const avatars = new Map<string, string>();

/** The persisted bot ID keeps the default face stable across renames and reloads. */
export function botttsAvatarUri(seed: string): string {
  const cached = avatars.get(seed);
  if (cached) return cached;
  const uri = new Avatar(style, { seed }).toDataUri();
  avatars.set(seed, uri);
  return uri;
}
