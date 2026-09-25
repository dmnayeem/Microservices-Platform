import {
  runLeaderboardAutoReset,
  summariseAutoReset,
} from "@/lib/leaderboard-auto-reset";
import { recheckPendingSocialSubmissions } from "@/lib/social-recheck";
import {
  settleMagnificTasks,
  summariseSweep,
} from "@/lib/marketplace-studio-tasks";
import {
  releaseDuePayouts,
  summariseReleases,
} from "@/lib/marketplace-payouts";
import {
  runBroadcastSweep,
  summariseSweep as summariseBroadcasts,
} from "@/lib/broadcast";
import {
  generateRecurring,
  summariseRecurring,
} from "@/lib/company-finance/recurring";

/**
 * Everything the platform used to ask a cron to call.
 *
 * A job declares how often it is due and how long a single attempt may hold the
 * window before another tick is allowed to take it over. It does NOT implement
 * anything: every `run` here is a thin call into the same library the manual
 * admin button and the HTTP endpoint call, so there is exactly one copy of each
 * piece of work.
 *
 * The non-negotiable property of anything added to this list: running it twice
 * must be harmless. The scheduler guarantees one winner per window, but a tick
 * that is killed mid-flight WILL be retried once its lease expires.
 */

export type JobSource = "traffic" | "http" | "manual";

export interface JobOutcome {
  ok: boolean;
  /** One line the owner can read on /admin/scheduler. */
  summary: string;
  result?: unknown;
}

export interface ScheduledJobDef {
  name: string;
  label: string;
  /** Plain language, shown on the admin screen. */
  description: string;
  /** How often a window falls due. */
  intervalMs: number;
  /** How long one attempt owns its window before a takeover is allowed. */
  leaseMs: number;
  run(ctx: { source: JobSource }): Promise<JobOutcome>;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const SCHEDULED_JOBS: ScheduledJobDef[] = [
  {
    name: "leaderboard-reset",
    label: "Leaderboard payout",
    description:
      "Closes finished daily / weekly / monthly leaderboard cycles and pays the prize points, XP and gifts to the winners. Runs hourly rather than at midnight so a deploy or an outage across the boundary delays a payout but never skips one. Does nothing unless “automatic reset” is on.",
    intervalMs: HOUR,
    // Well under the hourly window, so a killed payout is picked up and
    // RESUMED inside the same window rather than waiting for the next one.
    leaseMs: 5 * MINUTE,
    async run() {
      const r = await runLeaderboardAutoReset();
      return { ok: r.ok, summary: summariseAutoReset(r), result: r };
    },
  },
  {
    name: "recheck-submissions",
    label: "Re-check social submissions",
    description:
      "Social posts are often not readable the instant they are published, so first verification says “couldn’t read this” and the submission waits for a human. This looks again a couple of minutes later and approves the ones that have since become readable. It never rejects.",
    intervalMs: 2 * MINUTE,
    // A sweep is capped at 25 submissions; two minutes is generous for it and
    // still shorter than the window, so a dead tick is retried, not skipped.
    leaseMs: 2 * MINUTE,
    async run() {
      const s = await recheckPendingSocialSubmissions();
      return {
        ok: true,
        summary: `Examined ${s.examined}, approved ${s.approved}, still unreadable ${s.stillUnreadable}.`,
        result: s,
      };
    },
  },
  {
    name: "magnific-tasks",
    label: "Finish AI generations",
    description:
      "Stock Studio starts a video generation and does not wait for it — a clip takes minutes. This checks the ones still rendering and, when one is ready, pulls it into our own storage and completes the listing. It has a hard deadline to respect: the provider's download link expires about an hour after the generation starts and re-asking does not renew it, so anything that misses the window is failed with a reason rather than retried against a dead link.",
    intervalMs: 2 * MINUTE,
    // Matches the sweep's own cap of a handful of downloads. Shorter than the
    // window, so a tick killed mid-download is retried inside the same window
    // instead of waiting two minutes — which matters when the result link is
    // on a clock.
    leaseMs: 2 * MINUTE,
    async run() {
      const s = await settleMagnificTasks();
      return { ok: true, summary: summariseSweep(s), result: s };
    },
  },
  {
    name: "marketplace-payouts",
    label: "Release held seller payouts",
    description:
      "When the payout hold is switched on, a marketplace sale parks the seller\u2019s share instead of paying it straight out, so a refund in the first few days reverses an untouched row rather than chasing money already withdrawn. This is what actually pays them once the hold expires \u2014 nothing else does, so if it stops running sellers stop being paid while the shop keeps taking money. Does nothing at all while the hold is switched off.",
    intervalMs: 15 * MINUTE,
    // A payout is due on a day boundary, not a minute one, so a quarter hour
    // of lateness is invisible; the lease only has to outlast a batch of
    // wallet writes.
    leaseMs: 5 * MINUTE,
    async run() {
      const s = await releaseDuePayouts();
      return { ok: true, summary: summariseReleases(s), result: s };
    },
  },
  {
    name: "broadcast-delivery",
    label: "Send broadcasts",
    description:
      "Delivers admin notifications and emails to their audience, a batch at a time, and starts the ones that were scheduled for later. Nothing else sends them — the Send button only writes the broadcast down. A send to a hundred thousand people is therefore just a slow one, not a request that times out halfway with no record of who was already written to. Email is paced by the daily cap and per-minute rate in Settings, because exceeding a provider's limit does not bounce one message, it gets the sending domain throttled — and that takes password resets down with it.",
    intervalMs: MINUTE,
    // Matches the window. A tick killed mid-batch is retried a minute later and
    // resumes from the recipient rows, so nothing is sent twice and nothing is
    // skipped.
    leaseMs: MINUTE,
    async run() {
      const s = await runBroadcastSweep({ maxMs: 45_000 });
      return { ok: true, summary: summariseBroadcasts(s), result: s };
    },
  },
  {
    name: "finance-recurring",
    label: "Write recurring bills",
    description:
      "Rent, internet, servers and any other cost set up as recurring get their entry for the month written as Pending, ready to be paid. It never marks anything paid — paying is a person's decision. Running it twice writes nothing twice: every entry carries a key for its template and month, and the database refuses a second one.",
    // Hourly is plenty for a monthly bill, and it means a deploy or an outage
    // across the month boundary delays the entry by an hour, not a month.
    intervalMs: HOUR,
    leaseMs: 5 * MINUTE,
    async run() {
      const s = await generateRecurring();
      return { ok: s.failed.length === 0, summary: summariseRecurring(s), result: s };
    },
  },
];

export function findJob(name: string): ScheduledJobDef | undefined {
  return SCHEDULED_JOBS.find((j) => j.name === name);
}

/**
 * The window key for a job at a given instant: the interval bucket it falls in.
 *
 * Note what this deliberately does NOT do — it does not enumerate the windows
 * that went by while nobody visited. After a two-day silence the first visitor
 * settles the CURRENT bucket only. That is correct because every job here is
 * written to catch up from present state rather than to replay history: the
 * leaderboard pays the most recently closed calendar window whenever it is
 * asked, and the re-check sweeps whatever is pending now.
 */
export function windowKeyFor(job: ScheduledJobDef, now: Date): string {
  const bucket = Math.floor(now.getTime() / job.intervalMs) * job.intervalMs;
  return new Date(bucket).toISOString();
}
