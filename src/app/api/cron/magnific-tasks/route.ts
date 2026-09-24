import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { settleMagnificTasks } from "@/lib/marketplace-studio-tasks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Finish AI generations that the Stock Studio started and did not wait for.
 *
 * NOTHING DEPENDS ON THIS BEING CALLED. The sweep is registered as a job in
 * `lib/scheduler/jobs` and runs off the platform's own traffic, with no cron
 * entry and no `CRON_SECRET`. This endpoint exists for the one case the
 * traffic-driven scheduler cannot cover: a site quiet enough that no page is
 * rendered for the best part of an hour, which is exactly how long a result
 * link survives. Point an external pinger here and even a silent night still
 * collects its generations.
 *
 * It calls the same `settleMagnificTasks` the scheduler and the admin button
 * call, so there is one implementation.
 *
 * Two ways in:
 *  - an external pinger, with `CRON_SECRET` as a bearer token or `?key=`
 *  - an admin with `marketplace.manage`
 *
 * With no `CRON_SECRET` set the unauthenticated route is refused rather than
 * left open — this one spends nothing, but an open endpoint that issues
 * outbound requests is still not something to default to on.
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
  const summary = await settleMagnificTasks({ limit });
  return NextResponse.json({ ok: true, ...summary });
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
