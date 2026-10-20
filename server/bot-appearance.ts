import type { BotRecord } from "./store.ts";

/** New bot appearance stays separate from execution settings and legacy defaults. */
export function initialBotAppearance(
  profile: Partial<Pick<BotRecord, "color" | "mascotExpression" | "mascotBody" | "botttsAvatar">>,
  fallbackColor: BotRecord["color"],
) {
  return {
    color: profile.color ?? fallbackColor,
    ...(profile.mascotExpression ? { mascotExpression: profile.mascotExpression } : {}),
    ...(profile.mascotBody ? { mascotBody: profile.mascotBody } : {}),
    ...(profile.botttsAvatar !== undefined ? { botttsAvatar: profile.botttsAvatar } : {}),
  };
}
