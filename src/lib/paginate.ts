/**
 * Parse a `?page=` query-string value into a safe 1-based page number.
 *
 * `parseInt("abc")` is `NaN` and `Math.max(1, NaN)` is `NaN` (JS Math.max
 * propagates NaN, it does not clamp) — passing that to Prisma as `skip: NaN`
 * throws a validation error and crashes the page. This falls back to `1` for any
 * non-numeric / non-positive value (mistyped URL, stale bookmark, crawler).
 */
export function parsePage(value: string | undefined | null): number {
  const n = parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
