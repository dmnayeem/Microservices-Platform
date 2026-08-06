import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// GET /api/admin/users/[id]/boost-followers/batches
// List all bulk-follow batches for a target user, newest first.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "users.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: targetUserId } = await params;
  const batches = await prisma.followerBoostBatch.findMany({
    where: { targetUserId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ batches });
}
