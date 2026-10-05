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
import {
  runSubscriptionReminders,
  summariseReminders,
} from "@/lib/company-finance/subscriptions";
import { expireDueTasks } from "@/lib/task-expiry";
import { runSubscriptionExpiry } from "@/lib/subscription-expiry";
import { runBadgeExpiry } from "@/lib/badges-server";
import {
  runCourseReminders,
  runFeaturedExpiry,
  runLiveClassTransitions,
} from "@/lib/course-cron";
import { pruneOldLogs } from "@/lib/log-retention";
import { runAdCampaignSweep, runAdReviewSla } from "@/lib/ad-campaign-cron";
import { closeDueAuctions } from "@/lib/marketplace-auctions";
import { releaseDueDeals } from "@/lib/marketplace-deal";
import { drawDueLotteries } from "@/lib/lottery-sweep";
import { runPreviousMonthReferralBonuses } from "@/lib/referral-bonus";
import { sweepStaleGameSessions } from "@/lib/game-cron";
import { releaseDueCpaHolds } from "@/lib/cpa/credit";

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

/**
 * Auto: runs on its schedule. Manual: runs only when an admin presses "Run now".
 * Chosen per job on /admin/scheduler (stored by `./modes`).
 */
export type JobMode = "auto" | "manual";

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
  /** Mode until an admin picks one. Omitted = "auto". */
  defaultMode?: JobMode;
  run(ctx: { source: JobSource }): Promise<JobOutcome>;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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
  {
    name: "finance-subscription-reminders",
    label: "Subscription renewal reminders",
    description:
      "Tells the finance team, and whoever is responsible for it, when a domain, hosting plan or other subscription on the company books is coming up for renewal (by default 30, 7 and 1 day before), and marks one that lapsed without auto-renew as Expired. Each reminder is sent once per due date and threshold: running it again sends nothing new. Does nothing until the subscriptions migration is applied.",
    intervalMs: DAY,
    leaseMs: 5 * MINUTE,
    async run() {
      const s = await runSubscriptionReminders();
      return { ok: true, summary: summariseReminders(s), result: s };
    },
  },
  // ── Moved here from Inngest ───────────────────────────────────────────────
  // These were written as Inngest crons, but Inngest was never reachable in
  // production, so none of them had ever run. Each is the same library call the
  // Inngest function makes (src/lib/inngest/functions.ts, left in place).
  // Counter-flush is deliberately NOT here: the ad and page-view buffers live in
  // each server's memory and already flush themselves on traffic, and a
  // scheduled window only ever reaches one server — it would add a DB row a
  // minute and flush almost nothing.
  {
    name: "task-expiry",
    label: "Expire past-deadline tasks",
    description:
      "Tasks with an end date are switched to Expired once that date passes, so they drop out of everyone’s task list. Nothing is paid or taken back — it only changes the task’s status, and a task that already expired is left alone.",
    intervalMs: HOUR,
    leaseMs: 5 * MINUTE,
    async run() {
      const r = await expireDueTasks();
      return {
        ok: true,
        summary: `Expired ${r.expired} task${r.expired === 1 ? "" : "s"}${r.drained ? "." : " — more left for the next run."}`,
        result: r,
      };
    },
  },
  {
    name: "subscription-expiry",
    label: "Renew or end subscriptions",
    description:
      "When a paid plan reaches its end date, this renews it from the member’s wallet if they turned auto-renew on and can afford it, and otherwise ends it and moves them back to the free plan. Without it, people keep a plan they stopped paying for. Hourly, so a plan ends within the hour rather than up to a day late.",
    intervalMs: HOUR,
    // The sweep stops itself after 45 seconds.
    leaseMs: 2 * MINUTE,
    async run() {
      const r = await runSubscriptionExpiry();
      return {
        ok: true,
        summary: `Renewed ${r.renewed}, ended ${r.expired}${r.drained ? "." : " — more left for the next run."}`,
        result: r,
      };
    },
  },
  {
    name: "badge-expiry",
    label: "Renew or end blue badges",
    description:
      "When a bought blue badge or badge style reaches the end of its month, this renews it from the member’s cash balance if auto-renew is on and they can afford it, and otherwise ends it (a lapsed style falls back to the plain blue badge). Badges an admin granted never end. Hourly.",
    intervalMs: HOUR,
    leaseMs: 2 * MINUTE,
    async run() {
      const r = await runBadgeExpiry();
      return {
        ok: true,
        summary: `Renewed ${r.renewed}, ended ${r.ended}${r.drained ? "." : " — more left for the next run."}`,
        result: r,
      };
    },
  },
  {
    name: "course-reminders",
    label: "Course reminders",
    description:
      "Sends a “pick up where you left off” notification to students who have not opened an unfinished course for a week. Each student gets at most one per course per week, however often this runs.",
    intervalMs: DAY,
    leaseMs: 5 * MINUTE,
    async run() {
      const r = await runCourseReminders();
      return {
        ok: true,
        summary: `Reminded ${r.reminded} of ${r.candidates} inactive students.`,
        result: r,
      };
    },
  },
  {
    name: "course-live-classes",
    label: "Live classes and featured courses",
    description:
      "Tells enrolled students an hour before a live class, marks classes Live when they start and Ended when they finish, and takes the Featured badge off courses whose featured period is over.",
    intervalMs: 15 * MINUTE,
    leaseMs: 5 * MINUTE,
    async run() {
      const [live, featured] = await Promise.all([
        runLiveClassTransitions(),
        runFeaturedExpiry(),
      ]);
      const r = { ...live, featuredCleared: featured.cleared };
      return {
        ok: true,
        summary: `Reminded ${r.remindersFired}, started ${r.started}, ended ${r.ended}, unfeatured ${r.featuredCleared}.`,
        result: r,
      };
    },
  },
  {
    name: "log-retention",
    label: "Clear out old logs",
    description:
      "Deletes old view logs, read notifications, audit entries and similar records once they pass the retention period in Settings, a batch at a time. Unread notifications and the daily totals the reports use are never deleted. A big backlog is cleared over several days rather than in one long run.",
    intervalMs: DAY,
    // Each table gets a 20-second budget, so a full run can take a few minutes.
    leaseMs: 10 * MINUTE,
    async run() {
      const r = await pruneOldLogs();
      const total = Object.values(r).reduce((a, b) => a + b, 0);
      return {
        ok: true,
        summary: `Deleted ${total.toLocaleString()} old rows.`,
        result: r,
      };
    },
  },
  {
    name: "ad-campaign-sweep",
    label: "End and refund ad campaigns",
    description:
      "Ends campaigns that have passed their end date and returns the unspent budget to the advertiser’s Ad Credit, pauses campaigns whose advertiser is no longer active or whose budget has run out, and warns advertisers when a campaign is nearly out of money or ends tomorrow. Without it, budgets stay locked inside finished campaigns. A refund is only ever paid once.",
    intervalMs: 15 * MINUTE,
    leaseMs: 5 * MINUTE,
    async run() {
      const r = await runAdCampaignSweep();
      const paused = (r.pausedNoBudget ?? 0) + (r.pausedAdvertiser ?? 0);
      return {
        ok: true,
        summary: `Ended ${r.ended} (refunded ${(r.refundedUsd ?? 0).toFixed(2)}), paused ${paused}, warned ${r.warned}.`,
        result: r,
      };
    },
  },
  {
    name: "ad-review-sla",
    label: "Ad review reminder",
    description:
      "Once a day, tells the ad reviewers if any ad has been waiting for approval for more than a day. At most one reminder per reviewer per day.",
    intervalMs: DAY,
    leaseMs: 5 * MINUTE,
    async run() {
      const r = await runAdReviewSla();
      return {
        ok: true,
        summary: `${r.stale} ad${r.stale === 1 ? "" : "s"} waiting over a day.`,
        result: r,
      };
    },
  },
  {
    name: "auction-sweep",
    label: "Close finished auctions",
    description:
      "Settles marketplace auctions whose end time has passed: the highest bidder pays and the seller is paid (or held, if the payout hold is on). If the winner can no longer afford it, the auction closes unsold. An auction is only ever settled once.",
    intervalMs: 15 * MINUTE,
    leaseMs: 5 * MINUTE,
    async run() {
      const r = await closeDueAuctions();
      const sold = r.results.filter((x) => x.outcome === "sold").length;
      return {
        ok: true,
        summary: `Closed ${r.processed} (${sold} sold)${r.hasMore ? " — more left for the next run." : "."}`,
        result: r,
      };
    },
  },
  {
    name: "deal-auto-release",
    label: "Auto-release delivered deals",
    description:
      "When a seller has delivered on an escrow deal and the buyer has neither released the money nor raised a problem by the auto-release time, this pays the seller. A deal is only ever released once, and a disputed deal is never touched.",
    intervalMs: 15 * MINUTE,
    leaseMs: 5 * MINUTE,
    async run() {
      const r = await releaseDueDeals();
      return {
        ok: true,
        summary: `Released ${r.released} of ${r.candidates} due deals.`,
        result: r,
      };
    },
  },
  {
    name: "lottery-draw",
    label: "Draw lotteries",
    description:
      "Draws every active lottery whose draw date has passed and pays the prizes you set up for it — from the ticket pool, or the fixed prizes. If too few tickets sold, it does what that lottery is set to do: refund, roll over, or draw anyway. A lottery can only be drawn once, and never before its draw date.",
    intervalMs: 15 * MINUTE,
    leaseMs: 5 * MINUTE,
    async run() {
      const r = await drawDueLotteries();
      return {
        ok: r.failed === 0,
        summary: `Drew ${r.drawn} of ${r.candidates} due lotter${r.candidates === 1 ? "y" : "ies"}${r.failed ? `; ${r.failed} could not be drawn (check their prizes)` : ""}.`,
        result: r,
      };
    },
  },
  {
    name: "referral-monthly-bonus",
    label: "Monthly referral bonus",
    description:
      "Pays referrers the monthly bonus for each invitee who stayed active through last month, as set in the referral bonus settings. Each invitee pays out at most once per month however many times this runs. Starts on Manual so you decide when it pays; on Auto it runs on the 1st to 3rd of each month only.",
    intervalMs: DAY,
    // The sweep has its own 4-minute budget.
    leaseMs: 5 * MINUTE,
    defaultMode: "manual",
    async run({ source }) {
      // On a schedule it only needs to run just after a month closes. A hand-run
      // is allowed any day — it always pays the month that just ended.
      if (source !== "manual" && new Date().getUTCDate() > 3) {
        return { ok: true, summary: "Not the start of a month — nothing to do." };
      }
      const r = await runPreviousMonthReferralBonuses();
      return {
        ok: true,
        summary: `Paid ${r.paid} bonus${r.paid === 1 ? "" : "es"} (${r.points.toLocaleString()} points), checked ${r.scanned} invitees${r.drained ? "." : " — more left, run it again."}`,
        result: r,
      };
    },
  },
  {
    name: "game-session-sweep",
    label: "Close abandoned game sessions",
    description:
      "Closes game sessions that stopped responding (a closed tab, a dead phone). A player can only have one game open at a time, so an abandoned session would block them from earning in any game. Nothing is paid here — points were already given while they played.",
    intervalMs: 15 * MINUTE,
    leaseMs: 5 * MINUTE,
    async run() {
      const r = await sweepStaleGameSessions();
      return {
        ok: true,
        summary: `Closed ${r.closed} abandoned session${r.closed === 1 ? "" : "s"}.`,
        result: r,
      };
    },
  },
  {
    name: "cpa-hold-release",
    label: "Pay held CPA offers",
    description:
      "Pays CPA offer conversions that were approved with a hold once the hold time has passed. Nothing is paid before approval, and each conversion is paid at most once however many times this runs.",
    intervalMs: 15 * MINUTE,
    leaseMs: 5 * MINUTE,
    async run() {
      const r = await releaseDueCpaHolds();
      return {
        ok: true,
        summary: `Paid ${r.released} of ${r.candidates} due CPA conversion${r.candidates === 1 ? "" : "s"}.`,
        result: r,
      };
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
