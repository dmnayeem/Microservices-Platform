import "server-only";

/**
 * Database health counters.
 *
 * This app is built to degrade quietly: the Prisma retry extension silently
 * retries a read up to four times, and `safeRead` swallows a failed non-critical
 * query so the page still renders. Both are correct for UX and blinding for
 * operations — a database sliding into trouble produces no user-visible signal
 * until it is already bad.
 *
 * These counters are the early warning. **A rising retry rate moves hours before
 * anything breaks**, which makes it the single most useful number to watch
 * during a traffic ramp.
 *
 * Process-local and reset on restart, so treat them as a rate signal, not a
 * ledger. Read them from `/api/admin/db-health`.
 */

interface Counters {
  /** Reads that succeeded only after at least one retry. */
  retriedReads: number;
  /** Individual retry attempts (a single read can contribute several). */
  retryAttempts: number;
  /** Reads that exhausted retries and threw. */
  failedReads: number;
  /** `safeRead` calls that fell back instead of returning data. */
  degradedReads: number;
  /** Label → count, so you can see WHICH read is degrading. */
  degradedByLabel: Record<string, number>;
  /** Most recent error message seen, for context. */
  lastError: string | null;
  lastErrorAt: string | null;
  since: string;
}

/**
 * Sentry is optional and loaded lazily, so this module stays usable (and this
 * file stays cheap) when no DSN is configured. Failures here are swallowed on
 * purpose — telemetry must never break a request.
 */
function breadcrumb(category: string, message: string): void {
  if (!process.env.SENTRY_DSN) return;
  void import("@sentry/nextjs")
    .then((S) => S.addBreadcrumb({ category, message, level: "warning" }))
    .catch(() => {});
}

function captureMessage(message: string): void {
  if (!process.env.SENTRY_DSN) return;
  void import("@sentry/nextjs")
    .then((S) => S.captureMessage(message, "error"))
    .catch(() => {});
}

const counters: Counters = {
  retriedReads: 0,
  retryAttempts: 0,
  failedReads: 0,
  degradedReads: 0,
  degradedByLabel: {},
  lastError: null,
  lastErrorAt: null,
  since: new Date().toISOString(),
};

export function noteRetryAttempt(err: unknown): void {
  counters.retryAttempts++;
  counters.lastError = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
  counters.lastErrorAt = new Date().toISOString();
  // Breadcrumb only — a single retry is normal and must not page anyone. What
  // matters is the RATE, which is visible on the Sentry timeline once several
  // land close together.
  breadcrumb("db.retry", counters.lastError);
}

export function noteRetriedRead(): void {
  counters.retriedReads++;
}

export function noteFailedRead(): void {
  counters.failedReads++;
  // A read that exhausted every retry IS worth an event.
  captureMessage("db.read.failed_after_retries");
}

export function noteDegradedRead(label: string): void {
  counters.degradedReads++;
  counters.degradedByLabel[label] = (counters.degradedByLabel[label] ?? 0) + 1;
  breadcrumb("db.degraded", label);
}

export function readDbHealth(): Counters {
  return {
    ...counters,
    degradedByLabel: { ...counters.degradedByLabel },
  };
}
