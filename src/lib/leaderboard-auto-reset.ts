import { prisma } from "@/lib/prisma";
import { getSetting, invalidateSettingsCache } from "@/lib/system-settings";
import {
  cycleKey,
  lastClosedWindowAnchor,
  runLeaderboardReset,
  type Period,
  type ResetOutcome,
} from "@/lib/leaderboard-reset";

/**
 * Close finished leaderboard cycles and pay the winners.
 *
 * This is the whole of what `lb_auto_reset` turns on. It lives in a library
 * rather than in the route because there are now two ways to reach it — the
 * in-process scheduler that runs off site traffic, and `/api/cron/
 * leaderboard-reset` for anyone who still wants to call an endpoint — and two
 * copies of a payout is exactly how a platform pays twice.
 *
 * ── Timezone: UTC, everywhere ──
 * `cycleKey` buckets on UTC, so a day is 00:00Z–00:00Z, a week is Monday
 * 00:00Z, and a month is the 1st at 00:00Z. That is 06:00 in Asia/Dhaka, which
 * is the honest trade: one fixed instant worldwide beats a local midnight that
 * drifts with DST and could bucket the same window under two different ids —
 * which is how you pay twice.
 *
 * ── Missed windows ──
 * It does not ask "when did I last run". Each call computes the most recently
 * CLOSED window from the calendar (`lastClosedWindowAnchor`) and tries to pay
 * it. So:
 *   - a deploy, an outage, or a platform nobody visited for two days delays the
 *     payout to the next call and never skips it;
 *   - every later call inside the same window is a no-op, because the cycle is
 *     sealed `completed` and short-circuits before any ranking query runs;
 *   - and if it did somehow reach the payout, the ledger's
 *     `@@unique([userId, reference])` would reject the second credit anyway.
 */

export interface AutoResetLine {
  period: Period;
  cycleId: string;
  status: string;
  paid?: number;
  skipped?: number;
  points?: number;
  xp?: number;
  gifts?: number;
  error?: string;
}

export interface AutoResetReport {
  ok: boolean;
  at: string;
  /** Set when `lb_auto_reset` is off. */
  skipped?: string;
  /** Set on the very first run ever. */
  firstRun?: boolean;
  sealedWithoutPayout?: string[];
  note?: string;
  ran: AutoResetLine[];
}

const PERIODS: Period[] = ["daily", "weekly", "monthly"];

/** Absent means never configured — do not start paying prizes on a default. */
export function autoResetOn(v: unknown): boolean {
  const unwrapped =
    v && typeof v === "object" && "v" in (v as object)
      ? (v as { v: unknown }).v
      : v;
  if (typeof unwrapped === "boolean") return unwrapped;
  if (unwrapped === "true") return true;
  return false;
}

/** One human line for the scheduler's admin screen. */
export function summariseAutoReset(r: AutoResetReport): string {
  if (r.skipped) return r.skipped;
  if (r.firstRun) {
    return `First run — sealed ${r.sealedWithoutPayout?.length ?? 0} already-closed window(s) WITHOUT paying.`;
  }
  const paid = r.ran.filter((l) => l.status === "paid");
  if (paid.length === 0) {
    const settled = r.ran.filter((l) => l.status === "already-settled").length;
    return settled === r.ran.length
      ? "Nothing due — every closed window is already settled."
      : r.ran.map((l) => `${l.period}: ${l.status}`).join(", ");
  }
  return paid
    .map(
      (l) =>
        `${l.period}: paid ${l.paid} winner(s), ${l.points ?? 0} pts / ${l.xp ?? 0} XP`
    )
    .join(" · ");
}

export async function runLeaderboardAutoReset(opts?: {
  /** Restrict to a single period. Used by the HTTP endpoint's `?period=`. */
  only?: Period | null;
  now?: Date;
}): Promise<AutoResetReport> {
  const now = opts?.now ?? new Date();

  if (!autoResetOn(await getSetting<unknown>("lb_auto_reset", null))) {
    return {
      ok: true,
      at: now.toISOString(),
      skipped: "lb_auto_reset is off",
      ran: [],
    };
  }

  // ── Nothing is paid for a window that closed before this existed ──
  //
  // `lb_auto_reset` has been TRUE in the live database since long before any
  // scheduler read it. Each run settles the most recently closed window, so
  // without this the very first run after deploy would pay out yesterday's
  // daily cycle, last week's and last month's — real points and real XP, for
  // periods during which nobody was competing under these rules and the owner
  // never chose to pay.
  //
  // So the first run records the moment the scheduler came alive and seals
  // those windows unpaid. Every later run behaves normally. Written with
  // `create`, not upsert: if two cold starts race, exactly one claims the
  // moment and the loser is a no-op rather than moving the line forward twice.
  const FIRST_RUN_KEY = "lb_auto_reset_live_since";
  const liveSince = await getSetting<string | null>(FIRST_RUN_KEY, null);
  if (!liveSince) {
    const sealed: string[] = [];
    for (const period of PERIODS) {
      const anchor = lastClosedWindowAnchor(period, now);
      const cycleId = `${cycleKey(period, anchor)}_${period}`;
      try {
        await prisma.systemSetting.create({
          data: {
            key: `lb_history_${cycleId}`,
            category: "leaderboard",
            value: {
              cycleId,
              period,
              completed: true,
              sealedWithoutPayout: true,
              reason:
                "Closed before automatic resets went live — not paid, on purpose.",
              sealedAt: now.toISOString(),
              winners: [],
            },
          },
        });
        sealed.push(cycleId);
      } catch {
        // Already claimed by a real payout or a racing cold start. Either way
        // this window is somebody else's to settle; leave it alone.
      }
    }
    await prisma.systemSetting.upsert({
      where: { key: FIRST_RUN_KEY },
      create: {
        key: FIRST_RUN_KEY,
        category: "leaderboard",
        value: now.toISOString(),
      },
      update: {},
    });
    invalidateSettingsCache();
    return {
      ok: true,
      at: now.toISOString(),
      firstRun: true,
      sealedWithoutPayout: sealed,
      note: "Windows that closed before automatic resets went live are sealed unpaid. The next window pays normally.",
      ran: [],
    };
  }

  const only = opts?.only ?? null;
  const periods = only ? PERIODS.filter((p) => p === only) : PERIODS;

  const ran: AutoResetLine[] = [];

  for (const period of periods) {
    const anchor = lastClosedWindowAnchor(period, now);
    const cycleId = `${cycleKey(period, anchor)}_${period}`;
    let out: ResetOutcome;
    try {
      out = await runLeaderboardReset({
        period,
        at: anchor,
        actorUserId: null,
        source: "cron",
      });
    } catch (err) {
      // One period failing must not stop the other two from being paid.
      ran.push({
        period,
        cycleId,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (out.alreadyCompleted) {
      ran.push({ period, cycleId: out.cycleId, status: "already-settled" });
    } else if (!out.ok && /switched off/.test(out.error ?? "")) {
      ran.push({ period, cycleId: out.cycleId, status: "switched-off" });
    } else if (!out.ok) {
      ran.push({
        period,
        cycleId: out.cycleId,
        status: "not-eligible",
        error: out.error,
      });
    } else {
      ran.push({
        period,
        cycleId: out.cycleId,
        status: out.paid > 0 ? "paid" : "nothing-to-pay",
        paid: out.paid,
        skipped: out.skipped,
        points: out.totalDistributed,
        xp: out.totalXp,
        gifts: out.giftsAwarded,
      });
    }
  }

  // A period that threw is a failure the scheduler must record, not hide.
  return { ok: !ran.some((l) => l.status === "error"), at: now.toISOString(), ran };
}
