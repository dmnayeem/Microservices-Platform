import { assertPageVisible } from "@/lib/page-visibility-server";
import { planFeatureGate } from "@/lib/plan-gate";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEffectivePackage } from "@/lib/packages";
import { listEventsForUser } from "@/lib/events";

// GET /api/events — active events for the current user, with live progress.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Plan switch (Admin → Packages): this plan may not use it.
  const planGated = await planFeatureGate(session.user.id, "events");
  if (planGated) return planGated;
  // Super-admin page visibility: refuse when /events is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/events");
  if (pageHidden) return pageHidden;
  const pkg = await getEffectivePackage(session.user.id).catch(() => null);
  const events = await listEventsForUser(
    session.user.id,
    pkg?.accessLevel ?? 0
  );
  return NextResponse.json({ events });
}
