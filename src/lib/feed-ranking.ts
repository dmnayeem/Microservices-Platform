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

/** Hot score for a post. Higher = higher in the feed.
 *
 *  Randomness is the PRIMARY driver: with a fresh seed each load the order
 *  reshuffles substantially every reload and older posts resurface (no fixed
 *  chronological serial). Engagement + a gentle, never-vanishing recency give
 *  quality a mild nudge; a followed author gets a small edge. */
export function scorePost(post: RankablePost, opts: ScoreOpts): number {
  const engagement =
    post.likesCount + 2 * post.commentsCount + 3 * post.sharesCount;

  const ageHours = Math.max(
    0,
    (opts.now.getTime() - post.lastActivityAt.getTime()) / (1000 * 60 * 60)
  );
  // Soft recency — decays slowly and never reaches 0, so an old post can still
  // surface when the dice favour it (unlike exp() which buries anything old).
  const recencySoft = 1 / (1 + ageHours / (HALF_LIFE_HOURS * 4));

  const follow = opts.follows.has(post.userId) ? FOLLOW_MULT : 1;

  // 0..1, changes whenever the seed changes (a new seed is issued each load).
  const random = rand01(`${post.id}:${opts.seed}`);
  // log-compress engagement so a viral post nudges — never dominates — the shuffle.
  const quality = Math.log2(2 + engagement);

  // (0.2..1.2) random band is the dominant factor (6× spread); quality and
  // recency are mild multipliers on top.
  return (
    (0.2 + random) * (1 + 0.35 * quality) * (0.6 + 0.4 * recencySoft) * follow
  );
}
