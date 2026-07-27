/**
 * Client-safe idempotency-key generator for money POSTs.
 *
 * Generate ONE key per user action attempt and send it as the `Idempotency-Key`
 * header; the server (see `withIdempotency` in `src/lib/idempotency.ts`) runs the
 * request once and replays the stored response for any retry that reuses the key.
 * This dedupes network retries / double-fires of a single action; a fresh user
 * click that generates a new key is a new action.
 */
export function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  // Fallback for older/non-secure contexts.
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}
