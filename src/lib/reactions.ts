/**
 * Post reactions.
 *
 * One row per (post, user) whatever the emoji, so `Post.likesCount` keeps
 * meaning "how many people reacted" — every existing sort, counter, notification
 * and analytic that reads it stays correct without knowing reactions exist.
 *
 * Client-safe: no server imports, so the picker and the API can share this.
 */

export const REACTIONS = [
  { type: "LIKE", emoji: "👍", label: "Like", color: "text-indigo-400" },
  { type: "LOVE", emoji: "❤️", label: "Love", color: "text-rose-400" },
  { type: "HAHA", emoji: "😂", label: "Haha", color: "text-amber-400" },
  { type: "WOW", emoji: "😮", label: "Wow", color: "text-amber-400" },
  { type: "SAD", emoji: "😢", label: "Sad", color: "text-sky-400" },
] as const;

export type ReactionType = (typeof REACTIONS)[number]["type"];

export const DEFAULT_REACTION: ReactionType = "LIKE";

const BY_TYPE = new Map(REACTIONS.map((r) => [r.type, r]));

/** Unknown / legacy values fall back to 👍 — every pre-existing like is one. */
export function reactionMeta(type?: string | null) {
  return BY_TYPE.get((type ?? DEFAULT_REACTION) as ReactionType) ?? REACTIONS[0];
}

export function isReactionType(v: unknown): v is ReactionType {
  return typeof v === "string" && BY_TYPE.has(v as ReactionType);
}

/** Normalise anything the client sends into a type we store. */
export function toReactionType(v: unknown): ReactionType {
  return isReactionType(v) ? v : DEFAULT_REACTION;
}

/**
 * The emojis to show on a card, most-used first.
 *
 * Takes the per-type counts for one post and returns at most three, so the
 * cluster stays small on a phone.
 */
export function topReactions(
  counts: Record<string, number> | undefined,
  max = 3
): { type: ReactionType; emoji: string; count: number }[] {
  if (!counts) return [];
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([type, count]) => ({
      type: toReactionType(type),
      emoji: reactionMeta(type).emoji,
      count,
    }));
}
