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

// ── Bulk add ─────────────────────────────────────────────────────────────────

export const BULK_GAMES_MAX = 200;

/** One pasted line: `Title | Game URL | Icon image URL | Category (optional)`. */
export interface BulkGameRow {
  /** 1-based line number in the pasted text, so errors point at the right line. */
  line: number;
  title: string;
  embedUrl: string;
  iconUrl: string;
  category: string;
}

export function isHttpsUrl(s: string): boolean {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Pasted text → rows. A line with a tab is split on tabs (a spreadsheet paste),
 * anything else on `|`. Blank lines and `#` comments are skipped, and so is a
 * spreadsheet header row ("Title", "Game URL", …) when it comes first.
 */
export function parseBulkGames(text: string): BulkGameRow[] {
  const rows: BulkGameRow[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const s = raw.trim();
    if (!s || s.startsWith("#")) return;
    const cells = (raw.includes("\t") ? raw.split("\t") : raw.split("|")).map((c) =>
      c.trim()
    );
    const [title = "", embedUrl = "", iconUrl = "", category = ""] = cells;
    if (rows.length === 0 && /^(game\s*)?(title|name)$/i.test(title) && !isHttpsUrl(embedUrl)) {
      return;
    }
    rows.push({ line: i + 1, title, embedUrl, iconUrl, category });
  });
  return rows;
}

/** The per-row checks — the same function runs in the preview and on the server. */
export function bulkRowError(r: Pick<BulkGameRow, "title" | "embedUrl" | "iconUrl" | "category">): string | null {
  if (r.title.length < 2) return "Title is missing or too short.";
  if (r.title.length > 120) return "Title is longer than 120 characters.";
  if (!r.embedUrl) return "Game URL is missing.";
  if (!isHttpsUrl(r.embedUrl)) return "Game URL must be a full address starting with https://";
  if (!r.iconUrl) return "Icon image URL is missing.";
  if (!isHttpsUrl(r.iconUrl) || r.iconUrl.length > 1000) {
    return "Icon image URL must be a full address starting with https://";
  }
  if (r.category.length > 60) return "Category name is longer than 60 characters.";
  return null;
}

/** An existing category with this name or slug (case-insensitive), if any. */
export function matchGameCategory<T extends { name: string; slug: string }>(
  name: string,
  categories: T[]
): T | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const slug = slugify(name);
  return (
    categories.find(
      (c) => c.name.trim().toLowerCase() === n || c.slug === n || (!!slug && c.slug === slug)
    ) ?? null
  );
}

export const bulkGamesSchema = z.object({
  rows: z
    .array(
      z.object({
        line: z.number().int().min(1),
        title: z.string().max(500),
        embedUrl: z.string().max(2000),
        iconUrl: z.string().max(2000),
        category: z.string().max(200).default(""),
      })
    )
    .min(1, "Paste at least one game.")
    .max(BULK_GAMES_MAX, `At most ${BULK_GAMES_MAX} games at a time.`),
  isActive: z.boolean().default(true),
  /** "Connected with the RevType SDK" → scoreTrusted + scoreRewardEnabled. */
  connected: z.boolean().default(false),
  pointsPer1000: z.number().int().min(0).max(10_000).default(0),
});
