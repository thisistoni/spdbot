import { z } from "zod";

// Variant IDs from the pinned @dicebear/styles 10.6.0 Bottts Neutral definition.
export const BOTTTS_EYES = ["bulging", "dizzy", "eva", "frame1", "frame2", "glow", "happy", "hearts", "robocop", "round", "roundFrame01", "roundFrame02", "sensor", "shade01"] as const;
export const BOTTTS_MOUTHS = ["bite", "diagram", "grill01", "grill02", "grill03", "smile01", "smile02", "square01", "square02"] as const;
export const BOTTTS_TEXTURES = ["camo01", "camo02", "circuits", "dirty01", "dirty02", "dots", "grunge01", "grunge02"] as const;

/** Optional overrides only: missing values retain the bot ID's original face. */
export const botttsAvatarSchema = z.object({
  eyes: z.enum(BOTTTS_EYES).optional(),
  mouth: z.enum(BOTTTS_MOUTHS).optional(),
  texture: z.boolean().optional(),
  textureVariant: z.enum(BOTTTS_TEXTURES).optional(),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  radius: z.number().int().min(0).max(50).optional(),
}).strict();

export type BotttsAvatarOptions = z.infer<typeof botttsAvatarSchema>;

/** Persisted and streamed appearance data must never break avatar rendering. */
export function botttsAvatarOptions(value: unknown): BotttsAvatarOptions {
  return botttsAvatarSchema.safeParse(value).data ?? {};
}
