import { z } from "zod";
import { isInterstitialPlacement } from "@/lib/ad-placements";

/**
 * The Game admin write contract, in one place.
 *
 * Create validated seven fields with zod while update did a hand-rolled,
 * unvalidated `body.x !== undefined` assignment field by field — so the two
 * paths enforced different rules, and anything added to one was silently
 * missing from the other.
 *
 * Client-safe (no prisma, no `server-only`) so the admin form can share the
 * same limits it will be judged against.
 */

export const ORIENTATIONS = ["ANY", "PORTRAIT", "LANDSCAPE"] as const;

const fields = {
  title: z.string().min(2).max(120),
  categoryId: z.string().cuid().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  iconUrl: z.string().min(1),
  coverUrl: z.string().max(1000).nullable().optional(),
  embedUrl: z.string().url(),
  orientation: z.enum(ORIENTATIONS).default("ANY"),
  isFeatured: z.boolean().default(false),
  order: z.number().int().default(0),
  isActive: z.boolean().default(true),

  // ── Ads ────────────────────────────────────────────────────────────────
  adsEnabled: z.boolean().default(true),
  adOnOpen: z.boolean().default(true),
  adOnResume: z.boolean().default(true),
  adOnQuit: z.boolean().default(true),
  adIntervalSeconds: z.number().int().min(0).max(3600).default(0),
  adThrottleSeconds: z.number().int().min(10).max(3600).default(60),
  /**
   * Restricted to interstitials. Pointing a game at `IN_FEED` would serve
   * advertiser inventory full-screen in a slot it was never bought for — the
   * client must never be trusted to pick this.
   */
  adPlacement: z
    .string()
    .refine(isInterstitialPlacement, "That placement can't be used for games."),

  // ── Rewards ────────────────────────────────────────────────────────────
  rewardEnabled: z.boolean().default(false),
  rewardPointsPerTick: z.number().int().min(0).max(1000).default(0),
  rewardTickSeconds: z.number().int().min(5).max(3600).default(60),
  rewardMaxPerSession: z.number().int().min(0).max(100_000).default(0),
  rewardDailyCapPoints: z.number().int().min(0).max(100_000).default(0),
  rewardRequiresAd: z.boolean().default(false),

  // ── Score rewards ──────────────────────────────────────────────────────
  scoreRewardEnabled: z.boolean().default(false),
  scoreTrusted: z.boolean().default(false),
  scorePointsPer1000: z.number().int().min(0).max(10_000).default(0),
  scoreDailyCapPoints: z.number().int().min(0).max(100_000).default(0),
};

export const gameCreateSchema = z.object(fields);
export const gameUpdateSchema = z.object(fields).partial();

export type GameInput = z.infer<typeof gameCreateSchema>;

/**
 * Cross-field rules. Each exists because the alternative is a game that looks
 * configured but quietly pays nothing (or pays on an unverifiable number).
 */
export function gameConfigError(v: Partial<GameInput>): string | null {
  if (v.rewardEnabled) {
    if (!v.rewardPointsPerTick || v.rewardPointsPerTick <= 0) {
      return "Rewards are on but points per interval is 0 — nobody would earn anything.";
    }
    if (!v.rewardTickSeconds || v.rewardTickSeconds <= 0) {
      return "Set how many seconds of play earn one reward.";
    }
  }
  if (v.scoreRewardEnabled && !v.scoreTrusted) {
    return "Score rewards need a trusted (first-party) game. A score sent by an arbitrary embed can be any number the player likes.";
  }
  if (v.rewardRequiresAd && v.adsEnabled === false) {
    return "Rewards require an ad, but ads are switched off for this game — nobody could ever earn.";
  }
  return null;
}

export const gameCategorySchema = z.object({
  name: z.string().min(1).max(60),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes only.")
    .optional(),
  iconKey: z.string().max(60).nullable().optional(),
  color: z.string().max(30).nullable().optional(),
  order: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

/** "Word Puzzles!" → "word-puzzles" */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
