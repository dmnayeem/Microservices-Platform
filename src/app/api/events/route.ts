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
  const pkg = await getEffectivePackage(session.user.id).catch(() => null);
  const events = await listEventsForUser(
    session.user.id,
    pkg?.accessLevel ?? 0
  );
  return NextResponse.json({ events });
}
