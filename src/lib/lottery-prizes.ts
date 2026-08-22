/**
 * Lottery prize arithmetic. Pure, DB-free and dependency-free on purpose:
 *
 *  - the draw (src/lib/lottery.ts) and the admin form's live simulator run the
 *    SAME code, so what an admin previews is what the draw pays; and
 *  - it can be exercised by a throwaway script without touching the database,
 *    which matters because every function here decides how much real money
 *    leaves the platform.
 *
 * ## The two prize modes
 *
 * **FIXED** — `Lottery.prizes` holds absolute point amounts. This is how every
 * existing lottery works and is untouched by this module.
 *
 * **POOL** — the prize is derived from ticket sales at draw time:
 *
 *     pool = (gross − houseCut) + seed + rolledIn      [capped at poolCapPoints]
 *     gross = ticketsSold × ticketPrice
 *     houseCut = floor(gross × houseCutPercent / 100)
 *
 * The cut comes off **gross ticket sales only** — never the seed (the
 * platform's own money, cutting it is cutting yourself) and never rolled-in
 * points (already cut when the *source* lottery sold its tickets; cutting again
 * compounds down a rollover chain).
 */

/** One POOL-mode prize tier. `percent` is a share of the pool, not an amount. */
export interface PrizeTier {
  position: number;
  percent: number;
  description: string;
}

/** A concrete payout, after the pool has been split. */
export interface PrizeAward {
  position: number;
  description: string;
  /** Null in FIXED mode — there is no percentage, just an amount. */
  percent: number | null;
  amount: number;
}

export interface PoolInput {
  ticketsSold: number;
  ticketPrice: number;
  houseCutPercent: number;
  seedPoints: number;
  rolloverInPoints: number;
  poolCapPoints?: number | null;
}

export interface PoolResult {
  gross: number;
  houseCut: number;
  /** What is actually available to pay out. */
  pool: number;
  /** Amount above `poolCapPoints` that the house keeps instead. */
  overflow: number;
}

const int = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

/** Compute the payable pool from ticket sales, seed and carry-over. */
export function computePool(a: PoolInput): PoolResult {
  const ticketsSold = int(a.ticketsSold);
  const ticketPrice = int(a.ticketPrice);
  const pct = Math.min(90, Math.max(0, Math.floor(a.houseCutPercent || 0)));

  const gross = ticketsSold * ticketPrice;
  const houseCut = Math.floor((gross * pct) / 100);
  let pool = gross - houseCut + int(a.seedPoints) + int(a.rolloverInPoints);

  let overflow = 0;
  const cap = a.poolCapPoints;
  if (cap != null && cap > 0 && pool > cap) {
    overflow = pool - cap;
    pool = cap;
  }
  return { gross, houseCut, pool, overflow };
}

/**
 * Normalise a stored tier list: drop junk, clamp, sort ascending by position,
 * and renumber so positions are always 1..N with no gaps.
 */
export function parsePrizeTiers(raw: unknown): PrizeTier[] {
  if (!Array.isArray(raw)) return [];
  const out: PrizeTier[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    const percent = Number(o.percent);
    if (!Number.isFinite(percent) || percent <= 0) continue;
    out.push({
      position: Math.floor(Number(o.position)) || out.length + 1,
      percent,
      description:
        typeof o.description === "string" && o.description.trim()
          ? o.description.trim()
          : `Prize ${out.length + 1}`,
    });
  }
  out.sort((a, b) => a.position - b.position);
  return out.map((t, i) => ({ ...t, position: i + 1 }));
}

/** Do the percentages add up? Admin-facing validation. */
export function tiersTotalPercent(tiers: PrizeTier[]): number {
  return tiers.reduce((s, t) => s + t.percent, 0);
}

/**
 * When fewer tickets sold than there are tiers, only the top `ticketsSold`
 * tiers can be awarded — one ticket cannot hold two positions.
 *
 * The unawarded tiers' share is **redistributed** across the survivors rather
 * than quietly vanishing. Selling 2 tickets on a 50/30/20 lottery pays
 * 50/30 of the pool = 80%, leaving 20% stranded with nobody to pay it to; after
 * re-normalising it pays 62.5/37.5, i.e. the whole pool. That is the behaviour
 * a player expects from "the pot is split between the winners".
 */
export function effectiveTiers(
  tiers: PrizeTier[],
  ticketsSold: number
): PrizeTier[] {
  const n = Math.min(tiers.length, Math.max(0, Math.floor(ticketsSold)));
  if (n <= 0) return [];
  if (n === tiers.length) return tiers;

  const kept = tiers.slice(0, n);
  const total = tiersTotalPercent(kept);
  if (total <= 0) return kept;
  return kept.map((t) => ({ ...t, percent: (t.percent / total) * 100 }));
}

/**
 * Split a pool across tiers.
 *
 * Floors every share, then gives the rounding remainder to first place, so the
 * awards always sum to EXACTLY the pool — no points are minted and none are
 * lost to rounding. (Three tiers of 33.33% on a pool of 100 floor to 33/33/33
 * and leave 1 behind; that 1 goes to 1st.)
 */
export function splitPool(pool: number, tiers: PrizeTier[]): PrizeAward[] {
  const p = int(pool);
  if (tiers.length === 0 || p <= 0) return [];

  const awards: PrizeAward[] = tiers.map((t) => ({
    position: t.position,
    description: t.description,
    percent: t.percent,
    amount: Math.floor((p * t.percent) / 100),
  }));

  const remainder = p - awards.reduce((s, a) => s + a.amount, 0);
  if (remainder > 0) awards[0].amount += remainder;
  return awards;
}

/** FIXED-mode prize rows, as stored on `Lottery.prizes`. */
export interface FixedPrize {
  position: number;
  amount: number;
  description: string;
}

export function parseFixedPrizes(raw: unknown): FixedPrize[] {
  if (!Array.isArray(raw)) return [];
  const out: FixedPrize[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const amount = Math.floor(Number(o.amount));
    if (!Number.isFinite(amount) || amount < 0) continue;
    out.push({
      position: Math.floor(Number(o.position)) || out.length + 1,
      amount,
      description:
        typeof o.description === "string" ? o.description : `Prize ${out.length + 1}`,
    });
  }
  return out.sort((a, b) => a.position - b.position);
}

/** FIXED prizes as awards, capped at the number of tickets that exist. */
export function fixedAwards(
  prizes: FixedPrize[],
  ticketsSold: number
): PrizeAward[] {
  return prizes
    .slice(0, Math.max(0, Math.floor(ticketsSold)))
    .map((p) => ({
      position: p.position,
      description: p.description,
      percent: null,
      amount: p.amount,
    }));
}

/**
 * A plain-English summary of what a POOL lottery would pay at a given sales
 * volume. Used by the admin simulator so the economics are visible BEFORE
 * publishing, not discovered at draw time.
 */
export function simulatePool(
  input: PoolInput,
  tiers: PrizeTier[]
): { pool: PoolResult; awards: PrizeAward[]; totalPaid: number } {
  const pool = computePool(input);
  const awards = splitPool(pool.pool, effectiveTiers(tiers, input.ticketsSold));
  return {
    pool,
    awards,
    totalPaid: awards.reduce((s, a) => s + a.amount, 0),
  };
}
