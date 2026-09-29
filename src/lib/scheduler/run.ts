import { after } from "next/server";
import {
  claimWindow,
  finishWindow,
  type ClaimStore,
} from "@/lib/scheduler/claim";
import { prismaClaimStore } from "@/lib/scheduler/prisma-store";
import {
  SCHEDULED_JOBS,
  findJob,
  windowKeyFor,
  type JobSource,
  type ScheduledJobDef,
} from "@/lib/scheduler/jobs";
import { getJobModes } from "@/lib/scheduler/modes";

/**
 * The scheduler itself: due work, driven by the platform's own traffic.
 *
 * Nothing here needs configuring. There is no environment variable, no Vercel
 * cron entry, no secret. `kickScheduler()` is called from the root layout, so
 * every page render is a potential tick — and `after()` means the work starts
 * only once the visitor's response has already been sent. A visitor never waits
 * for a payout, and a job that explodes is invisible to whoever happened to
 * trigger it.
 *
 * Cost control, in three layers:
 *   1. a per-instance cooldown, so a burst of page views is one tick;
 *   2. a `completed` short-circuit that costs a single indexed read per job;
 *   3. a hard cap on how many jobs one tick may actually execute.
 */

/** One tick per instance per this long, however much traffic arrives. */
const KICK_COOLDOWN_MS = 30_000;
/** Nothing is allowed to turn a single page view into a long chain of work. */
const MAX_JOBS_PER_TICK = 2;
/** A failed attempt hands its window back after this, instead of pinning it. */
const FAILURE_BACKOFF_MS = 60_000;

let lastKickAt = 0;

/**
 * Windows this instance already knows are settled (job → windowKey). A settled
 * window never reopens, so with ~20 jobs this spares a DB read per job per tick
 * for the rest of each window.
 */
const settledWindow = new Map<string, string>();

export interface TickLine {
  job: string;
  windowKey: string;
  outcome:
    | "ran"
    | "failed"
    | "already-settled"
    | "held-by-another-tick"
    | "over-budget"
    /** Set to Manual on /admin/scheduler — only "Run now" runs it. */
    | "manual-mode";
  attempt?: number;
  takeover?: boolean;
  durationMs?: number;
  summary?: string;
  error?: string;
}

export interface TickReport {
  at: string;
  lines: TickLine[];
}

async function runOne(
  store: ClaimStore,
  job: ScheduledJobDef,
  windowKey: string,
  now: Date,
  source: JobSource
): Promise<TickLine> {
  const claim = await claimWindow(store, job.name, windowKey, {
    now,
    leaseMs: job.leaseMs,
    source,
  });
  if (!claim.claimed) {
    return {
      job: job.name,
      windowKey,
      outcome:
        claim.reason === "completed"
          ? "already-settled"
          : "held-by-another-tick",
    };
  }

  const started = Date.now();
  try {
    const out = await job.run({ source });
    const durationMs = Date.now() - started;
    await finishWindow(store, job.name, windowKey, {
      ok: out.ok,
      durationMs,
      summary: out.summary,
      error: out.ok ? null : out.summary,
      result: out.result,
      retryAt: new Date(Date.now() + FAILURE_BACKOFF_MS),
    });
    return {
      job: job.name,
      windowKey,
      outcome: out.ok ? "ran" : "failed",
      attempt: claim.attempt,
      takeover: claim.takeover,
      durationMs,
      summary: out.summary,
    };
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    // Best effort: if this write is what died, the row stays `running` and the
    // lease expiring is what recovers it. That is the same path a killed tick
    // takes, and it is already correct.
    await finishWindow(store, job.name, windowKey, {
      ok: false,
      durationMs,
      summary: "Failed.",
      error: message,
      retryAt: new Date(Date.now() + FAILURE_BACKOFF_MS),
    }).catch(() => {});
    return {
      job: job.name,
      windowKey,
      outcome: "failed",
      attempt: claim.attempt,
      takeover: claim.takeover,
      durationMs,
      error: message,
    };
  }
}

/** Run whatever is due. Safe to call from anywhere, as often as you like. */
export async function runDueJobs(opts?: {
  source?: JobSource;
  now?: Date;
  only?: string | null;
  store?: ClaimStore;
}): Promise<TickReport> {
  const now = opts?.now ?? new Date();
  const source = opts?.source ?? "traffic";
  const store = opts?.store ?? prismaClaimStore;
  // Rarest first. A job that falls due hourly or daily claims its window once
  // and is a free no-op for the rest of it, so putting it first costs nothing —
  // whereas letting the every-minute jobs go first would spend the per-tick
  // budget on them on a quiet site and starve the daily ones indefinitely.
  // The sort is stable, so equal intervals keep their registry order.
  const jobs = (
    opts?.only
      ? SCHEDULED_JOBS.filter((j) => j.name === opts.only)
      : [...SCHEDULED_JOBS]
  ).sort((a, b) => b.intervalMs - a.intervalMs);
  // A job the owner set to Manual never runs on the schedule.
  const modes = await getJobModes();

  const lines: TickLine[] = [];
  let budget = MAX_JOBS_PER_TICK;
  let live: Set<string> | null = null;

  for (const job of jobs) {
    const windowKey = windowKeyFor(job, now);
    if (modes[job.name] === "manual") {
      lines.push({ job: job.name, windowKey, outcome: "manual-mode" });
      continue;
    }
    if (settledWindow.get(job.name) === windowKey) {
      lines.push({ job: job.name, windowKey, outcome: "already-settled" });
      continue;
    }
    if (budget <= 0) {
      lines.push({ job: job.name, windowKey, outcome: "over-budget" });
      continue;
    }
    // A hand-run of the same job may be in flight under its own window key.
    // Two copies of one sweep at once is the one overlap the window lock does
    // not cover, so wait for it. One read per tick, and only once something
    // is actually due.
    if (live === null) live = (await store.liveJobs?.(now)) ?? new Set();
    if (live.has(job.name)) {
      lines.push({ job: job.name, windowKey, outcome: "held-by-another-tick" });
      continue;
    }
    const line = await runOne(store, job, windowKey, now, source);
    if (line.outcome === "already-settled" || line.outcome === "ran") {
      settledWindow.set(job.name, windowKey);
    }
    // Only work that actually ran spends budget; a no-op costs one read.
    if (line.outcome === "ran" || line.outcome === "failed") budget -= 1;
    lines.push(line);
  }

  return { at: now.toISOString(), lines };
}

/**
 * Run one job by hand, from the admin screen.
 *
 * It claims a window of its own (`manual-<ms>`) rather than the scheduled one.
 * Two reasons: a hand-run must never be refused just because this hour's window
 * is already settled, and it must never seal a scheduled window it did not
 * actually settle. Running the real work twice is harmless — that is the entry
 * requirement for being in the registry at all.
 */
export async function runJobNow(
  name: string,
  opts?: { store?: ClaimStore }
): Promise<TickLine | { job: string; outcome: "unknown-job" }> {
  const job = findJob(name);
  if (!job) return { job: name, outcome: "unknown-job" };
  const now = new Date();
  const store = opts?.store ?? prismaClaimStore;
  const windowKey = `manual-${now.getTime()}`;
  // Runs whatever the job's mode is — Manual only stops the schedule. What it
  // will not do is start a second copy while one is still running (a scheduled
  // run, or another admin's click): two copies of a renewal sweep at once could
  // charge the same subscription twice.
  const live = (await store.liveJobs?.(now)) ?? new Set<string>();
  if (live.has(job.name)) {
    return {
      job: job.name,
      windowKey,
      outcome: "held-by-another-tick",
      summary: "Already running. Try again once it has finished.",
    };
  }
  return runOne(store, job, windowKey, now, "manual");
}

/**
 * Fire-and-forget the tick, after the response has been sent.
 *
 * Called from the root layout, so ordinary site traffic drives the schedule.
 * Every failure mode is swallowed on purpose: `after()` throws when there is no
 * request scope (a script, a unit test), and a job blowing up must never reach
 * the page a visitor is reading.
 */
export function kickScheduler(): void {
  // A production build renders pages; it must not start paying prize money.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const now = Date.now();
  if (now - lastKickAt < KICK_COOLDOWN_MS) return;
  lastKickAt = now;
  try {
    after(async () => {
      try {
        await runDueJobs({ source: "traffic" });
      } catch {
        /* a visitor must never learn that a background job failed */
      }
    });
  } catch {
    /* no request scope — nothing to schedule against */
  }
}
