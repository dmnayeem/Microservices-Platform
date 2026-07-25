/**
 * Parse a JSON string that came from the database, returning `fallback` instead
 * of throwing when the column holds `null`, an empty string, or malformed data.
 *
 * Several tables store JSON as a `String?` (e.g. `LotteryTicket.numbers`,
 * `Lottery.winningNumbers`). A malformed row should degrade gracefully — an
 * empty ticket list, a null winning-number set — not crash the whole request
 * with an opaque 500.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
