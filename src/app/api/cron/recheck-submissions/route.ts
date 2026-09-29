import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getJobMode } from "@/lib/scheduler/modes";
import { recheckPendingSocialSubmissions } from "@/lib/social-recheck";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Re-check social submissions that could not be read the first time.
 *
 * A pin or post is often not ready the instant it is published, so the first
 * verification says "couldn't read this" and the submission waits for a human.
 * Running this a minute or two later picks up the ones that have since become
 * readable and approves them. It NEVER rejects — see `lib/social-recheck`.
 *
 * NOTHING DEPENDS ON THIS BEING CALLED. The sweep is registered as a job in
 * `lib/scheduler/jobs` and runs off the platform's own traffic, with no cron
 * entry and no `CRON_SECRET`. This endpoint is kept for anyone who does want to
 * point an external pinger at it; it calls the same
 * `recheckPendingSocialSubmissions`, so there is one implementation.
 *
 * Two ways in, because this has to work whatever hosting is in front of it:
 *  - an external pinger, with `CRON_SECRET` as a bearer token or `?key=`
 *  - an admin, from the submissions screen, with `submissions.review`
 *
 * With no `CRON_SECRET` set the unauthenticated route is refused rather than
 * left open — an unauthenticated endpoint that pays people is not something to
 * default to on, and the scheduler no longer needs the endpoint at all.
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
  if (session?.user?.id && (await can(session.user.id, "submissions.approve"))) {
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
  if (via === "secret" && (await getJobMode("recheck-submissions")) === "manual") {
    return NextResponse.json({ ok: true, skipped: "manual-mode" });
  }
  const sp = req.nextUrl.searchParams;
  const summary = await recheckPendingSocialSubmissions({
    limit: Number(sp.get("limit")) || undefined,
    minAgeSec: Number(sp.get("minAgeSec")) || undefined,
    maxAgeHours: Number(sp.get("maxAgeHours")) || undefined,
  });
  return NextResponse.json({ ok: true, ...summary });
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
