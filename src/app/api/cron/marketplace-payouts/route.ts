import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { releaseDuePayouts } from "@/lib/marketplace-payouts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Release seller payouts whose hold has expired.
 *
 * NOTHING DEPENDS ON THIS BEING CALLED. The sweep is registered as a job in
 * `lib/scheduler/jobs` and runs off the platform's own traffic, with no cron
 * entry and no `CRON_SECRET`. It exists for the case the traffic-driven
 * scheduler cannot cover on its own: this one pays people, so an owner who
 * wants a guarantee that it runs on a quiet day can point an external pinger
 * here rather than hoping someone visits.
 *
 * It calls the same `releaseDuePayouts` the scheduler and the admin button
 * call, so there is one implementation.
 *
 * Two ways in:
 *  - an external pinger, with `CRON_SECRET` as a bearer token or `?key=`
 *  - an admin with `marketplace.manage`
 *
 * With no `CRON_SECRET` set the unauthenticated route is refused rather than
 * left open — an endpoint that moves money into wallets is not something to
 * default to on.
 */
async function authorise(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const bearer = req.headers.get("authorization");
    const key = req.nextUrl.searchParams.get("key");
    if (bearer === `Bearer ${secret}` || key === secret) return true;
  }
  const session = await auth();
  if (session?.user?.id && (await can(session.user.id, "marketplace.manage"))) {
    return true;
  }
  return false;
}

async function run(req: NextRequest) {
  if (!(await authorise(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limit = Number(req.nextUrl.searchParams.get("limit")) || undefined;
  const summary = await releaseDuePayouts({ limit });
  return NextResponse.json({ ok: true, ...summary });
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
