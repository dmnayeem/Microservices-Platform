import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectivePackage } from "@/lib/packages";
import { listMissionsForUser } from "@/lib/missions";
import { TASK_VIEWER_SELECT } from "@/lib/task-visibility";

// GET /api/missions — active missions for the current user, with real progress.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Missions target on the same profile fields tasks do, so the same select.
  const [viewer, pkg] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: TASK_VIEWER_SELECT,
    }),
    getEffectivePackage(session.user.id).catch(() => null),
  ]);
  if (!viewer) return NextResponse.json({ missions: [] });

  const missions = await listMissionsForUser(viewer, pkg?.accessLevel ?? 0);
  return NextResponse.json({ missions });
}
