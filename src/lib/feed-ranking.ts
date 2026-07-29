// Smart social-feed ranking. Pure + server-safe (no imports) so it can be unit-
// tested and reused. A post's "hot score" blends engagement, freshness (with a
// comment-bump via lastActivityAt), a light follow boost, and a per-day
// deterministic jitter for variety without breaking pagination.

/** Half-life (hours) of the recency decay — activity older than this loses ~half its weight. */
export const HALF_LIFE_HOURS = 18;
/** Multiplier applied to posts whose author the viewer follows. */
export const FOLLOW_MULT = 1.25;
/** How many freshest posts to score per main-feed request (bounded for scale). */
export const POOL_SIZE = 500;

export interface RankablePost {
  id: string;
  userId: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  lastActivityAt: Date;
}

/** Deterministic 0..1 pseudo-random from a string seed (xfnv1a-ish). Same seed →
 *  same value, so pagination stays stable within a day while varying day-to-day. */
export function rand01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Map to [0,1)
  return ((h >>> 0) % 100000) / 100000;
}

/** UTC day key (YYYY-MM-DD) — the jitter seed component that rotates the feed daily. */
export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface ScoreOpts {
  follows: Set<string>;
  now: Date;
  /** Jitter seed component. Same seed → same order (stable pagination); a new
   *  seed reshuffles. The feed route passes a per-session seed (or falls back to
   *  the UTC day key), giving fresh variety each refresh. */
  seed: string;
}

/** Hot score for a post. Higher = higher in the feed. */
export function scorePost(post: RankablePost, opts: ScoreOpts): number {
  const engagement =
    post.likesCount + 2 * post.commentsCount + 3 * post.sharesCount;

  const ageHours = Math.max(
    0,
    (opts.now.getTime() - post.lastActivityAt.getTime()) / (1000 * 60 * 60)
  );
  const recency = Math.exp(-ageHours / HALF_LIFE_HOURS);

  const follow = opts.follows.has(post.userId) ? FOLLOW_MULT : 1;

  // ±15% deterministic variety, stable for a given seed (keeps pages consistent).
  const jitter = 0.85 + 0.3 * rand01(`${post.id}:${opts.seed}`);

  return (1 + engagement) * recency * follow * jitter;
}
