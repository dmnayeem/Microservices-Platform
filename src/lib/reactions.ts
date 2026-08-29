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
 * Every reaction with its count, in the fixed catalog order.
 *
 * Catalog order, not count order: the breakdown is read repeatedly on different
 * posts, and a list whose rows reshuffle by popularity has to be re-read every
 * time. Types nobody picked are included with 0 so the list has the same five
 * rows everywhere.
 */
export function reactionBreakdown(
  counts: Record<string, number> | null | undefined
): { type: ReactionType; emoji: string; label: string; count: number }[] {
  return REACTIONS.map((r) => ({
    type: r.type,
    emoji: r.emoji,
    label: r.label,
    count: Math.max(0, Math.trunc(counts?.[r.type] ?? 0)),
  }));
}

/**
 * Move one viewer's reaction from `from` to `to` in a per-type count map.
 *
 * Used for the optimistic update. `null` on either side means "no reaction", so
 * this covers all four transitions: first reaction, switch, un-react, and the
 * no-op of picking what you already had.
 *
 * Returns a new object — mutating the one held in state would leave React
 * showing the old numbers.
 */
export function shiftReactionCounts(
  counts: Record<string, number> | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined
): Record<string, number> {
  const next: Record<string, number> = { ...(counts ?? {}) };
  if (from === to) return next;
  if (from) next[from] = Math.max(0, (next[from] ?? 0) - 1);
  if (to) next[to] = (next[to] ?? 0) + 1;
  return next;
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
