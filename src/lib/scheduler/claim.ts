/**
 * The scheduler's lock.
 *
 * One row per (job, due window). Claiming a window is a `create` against
 * `@@unique([job, windowKey])` — the database decides the winner, there is no
 * read-then-write, and a loser's `create` costs one failed insert.
 *
 * A tick can die at any point (serverless kills work started after the
 * response), so a claim carries a LEASE. While the lease holds, nobody else may
 * touch the window. Once it expires, a later tick may take the window over with
 * a conditional update whose `where` names the expected state — an expired
 * lease and a state that is not `completed`. `count === 1` is the proof that
 * this tick, and only this tick, won it.
 *
 * Taking a window over re-runs the job. That is safe, and deliberately so:
 * every job in the registry is independently idempotent, so a resumed run
 * finishes what the dead one started instead of doing it twice.
 *
 * This file is deliberately dependency-free — no Prisma, no Next — so the
 * concurrency and half-dead-tick behaviour can be exercised directly. The
 * Prisma-backed store lives in `./prisma-store`, and the store is injectable so
 * these rules can be exercised without a database
 * (see `scripts/verify-staff-off-leaderboard`).
 */

export type ClaimState = "running" | "completed" | "failed";

export interface ClaimRow {
  job: string;
  windowKey: string;
  state: ClaimState;
  attempts: number;
  leaseUntil: Date;
}

export interface FinishPatch {
  ok: boolean;
  durationMs: number;
  summary?: string | null;
  error?: string | null;
  result?: unknown;
  /** When a failed run may be retried. */
  retryAt: Date;
}

export interface ClaimStore {
  /** Returns false when the unique constraint rejected the insert. */
  insert(row: {
    job: string;
    windowKey: string;
    source: string;
    leaseUntil: Date;
  }): Promise<boolean>;
  get(job: string, windowKey: string): Promise<ClaimRow | null>;
  /**
   * Conditional update. MUST match only rows whose lease has expired and whose
   * state is not `completed`, and MUST return the number of rows it changed.
   */
  takeOver(
    job: string,
    windowKey: string,
    now: Date,
    leaseUntil: Date
  ): Promise<number>;
  finish(job: string, windowKey: string, patch: FinishPatch): Promise<void>;
  /**
   * Names of jobs with ANY window (scheduled or a hand-run) still `running`
   * under a live lease. Optional: a store without it just skips the overlap
   * check between a hand-run and a scheduled run of the same job.
   */
  liveJobs?(now: Date): Promise<Set<string>>;
}

export type ClaimResult =
  | { claimed: true; attempt: number; takeover: boolean }
  /** `completed` is the cheap no-op: one indexed read and nothing else. */
  | { claimed: false; reason: "completed" | "held" };

export async function claimWindow(
  store: ClaimStore,
  job: string,
  windowKey: string,
  opts: { now: Date; leaseMs: number; source: string }
): Promise<ClaimResult> {
  const { now, leaseMs, source } = opts;
  const leaseUntil = new Date(now.getTime() + leaseMs);

  // Settled windows are the overwhelmingly common case — most ticks find every
  // job already done — so answer those with a single indexed read.
  const existing = await store.get(job, windowKey);
  if (existing?.state === "completed") {
    return { claimed: false, reason: "completed" };
  }

  if (!existing) {
    const inserted = await store.insert({ job, windowKey, source, leaseUntil });
    if (inserted) return { claimed: true, attempt: 1, takeover: false };
    // Lost the insert race. The winner holds a fresh lease, so the takeover
    // below will correctly refuse — but go through it rather than assuming,
    // because the row we collided with may already be an expired corpse.
  }

  const changed = await store.takeOver(job, windowKey, now, leaseUntil);
  if (changed === 1) {
    return {
      claimed: true,
      attempt: (existing?.attempts ?? 1) + 1,
      takeover: true,
    };
  }
  return { claimed: false, reason: "held" };
}

export async function finishWindow(
  store: ClaimStore,
  job: string,
  windowKey: string,
  patch: FinishPatch
): Promise<void> {
  await store.finish(job, windowKey, patch);
}
