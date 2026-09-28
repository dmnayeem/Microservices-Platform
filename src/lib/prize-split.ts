/**
 * Splitting a prize budget between winners — the leaderboard pools and fixed
 * lottery prizes. Client-safe.
 *
 * Every split returns whole points that add up to EXACTLY the budget: the
 * rounding remainder goes to 1st place, so "1,000 between 3" is 334/333/333
 * and never 333/333/333 with a point missing.
 */

export type SplitMode = "equal" | "top" | "gradual";

export const SPLIT_LABEL: Record<SplitMode, string> = {
  equal: "Equal",
  top: "Top-heavy (50 / 25 / 15 …)",
  gradual: "Gradual (each place a little less)",
};

function weights(count: number, mode: SplitMode): number[] {
  if (mode === "equal") return Array(count).fill(1);
  if (mode === "gradual") return Array.from({ length: count }, (_, i) => count - i);
  // "top" — the split the leaderboard has always used when no list is set.
  if (count === 1) return [1];
  if (count === 2) return [0.65, 0.35];
  if (count === 3) return [0.5, 0.3, 0.2];
  return [0.5, 0.25, 0.15, ...Array(count - 3).fill(0.1 / (count - 3))];
}

export function splitBudget(total: number, count: number, mode: SplitMode): number[] {
  const n = Math.max(0, Math.floor(count));
  const t = Math.max(0, Math.floor(total));
  if (n === 0) return [];
  if (t === 0) return Array(n).fill(0);
  const w = weights(n, mode);
  const sum = w.reduce((a, b) => a + b, 0);
  const out = w.map((x) => Math.floor((t * x) / sum));
  out[0] += t - out.reduce((a, b) => a + b, 0);
  return out;
}

/** After each place is paid, how much of the budget is still unallocated. */
export function remainingAfterEach(total: number, amounts: number[]): number[] {
  let left = Math.floor(total);
  return amounts.map((a) => (left -= Math.max(0, Math.floor(a || 0))));
}

export function allocated(amounts: number[]): number {
  return amounts.reduce((a, b) => a + Math.max(0, Math.floor(b || 0)), 0);
}
