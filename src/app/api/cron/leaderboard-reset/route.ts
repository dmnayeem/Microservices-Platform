import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getJobMode } from "@/lib/scheduler/modes";
import { runLeaderboardAutoReset } from "@/lib/leaderboard-auto-reset";
import type { Period } from "@/lib/leaderboard-reset";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Close finished leaderboard cycles and pay the winners — over HTTP.
 *
 * NOTHING DEPENDS ON THIS BEING CALLED. The platform schedules itself off its
 * own traffic (`lib/scheduler/run`, registered in `lib/scheduler/jobs`), which
 * is what the owner asked for: no cron entry, no `CRON_SECRET`, no dashboard.
 * This endpoint is kept because it already existed and is already authenticated
 * — anyone who does want to point an external pinger at it still can.
 *
 * Both paths call the same `lib/leaderboard-auto-reset`, which calls the same
 * `runLeaderboardReset`. Its idempotency rules (`lb_auto_reset` gate, the
 * first-run seal, the window-keyed cycle id, the frozen winner list, the unique
 * ledger reference per credit) are documented there and are unchanged: the UTC
 * bucketing, the missed-window catch-up and `lb_auto_reset_live_since` all live
 * in that file now.
 *
 * Authorised exactly like `/api/cron/recheck-submissions`: `CRON_SECRET` as a
 * bearer token or `?key=`, or a signed-in admin with `leaderboards.manage`.
 * With no `CRON_SECRET` set the unauthenticated route is refused rather than
 * left open — this endpoint moves real money. That refusal is safe precisely
 * because the scheduler no longer needs the endpoint.
 */
async function authorise(
  req: NextRequest
): Promise<"secret" | "admin" | null> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const bearer = req.headers.get("authorization");
    const key = req.nextUrl.searchParams.get("key");
    if (bearer === `Bearer ${secret}` || key === secret) return "secret";
  }
  const session = await auth();
  if (session?.user?.id && (await can(session.user.id, "leaderboards.manage"))) {
    return "admin";
  }
  return null;
}

async function run(req: NextRequest) {
  const via = await authorise(req);
  if (!via) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // A CRON_SECRET caller is a schedule, and the owner can switch this job to
  // Manual on /admin/scheduler. A signed-in admin calling it is a hand-run and
  // always goes through.
  if (via === "secret" && (await getJobMode("leaderboard-reset")) === "manual") {
    return NextResponse.json({ ok: true, skipped: "manual-mode" });
  }
  const only = req.nextUrl.searchParams.get("period") as Period | null;
  const report = await runLeaderboardAutoReset({ only });
  return NextResponse.json(report);
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
