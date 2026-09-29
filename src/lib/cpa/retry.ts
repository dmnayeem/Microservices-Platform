/**
 * CPA retry after a rejection — client-safe (no prisma), so the admin screen
 * and the user UI share the one rule with the server.
 *
 * A REJECTED conversion may be tried again once `cpa.retry_after_hours`
 * (default 24, admin-editable 0–720) have passed since the rejection
 * (`reviewedAt`). The retry REUSES the row — `@@unique([offerId, userId])`
 * stays — so it goes back to PENDING and the previous attempt is kept in the
 * row's `history` JSON (and an audit entry). APPROVED, HELD and REVERSED are
 * final: nothing here reopens them.
 */

export const CPA_RETRY_SETTING_KEY = "cpa.retry_after_hours";
export const CPA_RETRY_DEFAULT_HOURS = 24;
export const CPA_RETRY_MIN_HOURS = 0;
export const CPA_RETRY_MAX_HOURS = 720;

/** Whole hours in 0–720; anything unreadable is the default. */
export function clampCpaRetryHours(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return CPA_RETRY_DEFAULT_HOURS;
  return Math.min(CPA_RETRY_MAX_HOURS, Math.max(CPA_RETRY_MIN_HOURS, Math.round(n)));
}

/** When a rejection made at `rejectedAt` may be retried. */
export function cpaRetryAt(rejectedAt: Date | string | null | undefined, hours: number): Date | null {
  if (!rejectedAt) return null;
  const t = new Date(rejectedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + Math.max(0, hours) * 3_600_000);
}

/**
 * For a REJECTED conversion: may it be tried again now, and from when. (Only
 * REJECTED is ever retryable — callers check the status first.) A row with no
 * `reviewedAt` (should not exist) counts as rejected just now — the safe side.
 */
export function cpaRetryState(
  row: { reviewedAt: Date | string | null },
  hours: number,
  now: Date = new Date()
): { ready: boolean; retryAt: Date } {
  const retryAt = cpaRetryAt(row.reviewedAt ?? now, hours) ?? now;
  return { ready: now.getTime() >= retryAt.getTime(), retryAt };
}

/** "5h" / "40m" / "2d" — how long until `at`. */
export function cpaWaitLabel(at: Date | string, now: Date = new Date()): string {
  const ms = new Date(at).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 60_000) return "a moment";
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.ceil(ms / 3_600_000);
  if (h < 48) return `${h}h`;
  return `${Math.ceil(h / 24)}d`;
}

/** One previous attempt, as kept in `CpaConversion.history`. */
export interface CpaAttemptRecord {
  attempt: number;
  status: string;
  rejectionReason: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  clickId: string | null;
  txid: string | null;
  postbackVerified: boolean;
  proofImages: string[];
  proofText: string | null;
  submittedAt: string | null;
  retriedAt: string;
  /** "user" = the user resubmitted proof; "postback" = the network confirmed a new click. */
  retriedBy: "user" | "postback";
}

export function readCpaHistory(v: unknown): CpaAttemptRecord[] {
  return Array.isArray(v) ? (v as CpaAttemptRecord[]) : [];
}

/**
 * The start of the current attempt: the moment the previous attempt was
 * rejected. A click older than this belongs to an earlier attempt, so a
 * postback for it must not touch the current one. Null = first attempt.
 */
export function cpaAttemptBoundary(history: unknown): Date | null {
  const h = readCpaHistory(history);
  const last = h[h.length - 1];
  if (!last?.reviewedAt) return last ? new Date(last.retriedAt) : null;
  const d = new Date(last.reviewedAt);
  return Number.isFinite(d.getTime()) ? d : null;
}
