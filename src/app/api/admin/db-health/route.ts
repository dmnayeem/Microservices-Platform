import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { readDbHealth } from "@/lib/db-health";

export const dynamic = "force-dynamic";

/**
 * Database health counters for this instance (see `src/lib/db-health.ts`).
 *
 * **Watch `retryAttempts` during the traffic ramp.** The retry extension hides a
 * struggling database by succeeding on attempt 2 or 3, so this number climbs
 * well before anything becomes user-visible. `degradedByLabel` then tells you
 * exactly which read started failing.
 *
 * Counters are per serverless instance and reset on restart, so read them as a
 * rate, and expect different numbers on consecutive calls (different instances).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "settings.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(readDbHealth(), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
