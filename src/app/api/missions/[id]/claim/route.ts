import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { getEffectivePackage } from "@/lib/packages";
import { claimMission } from "@/lib/missions";
import { TASK_VIEWER_SELECT } from "@/lib/task-visibility";

// POST /api/missions/:id/claim — claim a mission reward (or one tier of it).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Reward claim. Correctness comes from the unique ledger constraint; this
  // keeps a claim flood from being absorbed by the database.
  const limited = await enforceDbRateLimit(req, "claim", session.user.id, 30, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { tierThreshold?: number };

  const [viewer, pkg] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: TASK_VIEWER_SELECT,
    }),
    getEffectivePackage(session.user.id).catch(() => null),
  ]);
  if (!viewer) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const result = await claimMission(
    viewer,
    id,
    pkg?.accessLevel ?? 0,
    typeof body.tierThreshold === "number" ? body.tierThreshold : undefined
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
