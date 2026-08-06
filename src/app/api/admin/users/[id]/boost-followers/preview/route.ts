import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  filterSchema,
  buildWhere,
  MAX_PER_OPERATION,
} from "@/lib/follower-boost";

// POST /api/admin/users/[id]/boost-followers/preview
// Returns the count of users matching the filter and a small sample for
// admin to spot-check before applying.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "users.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: targetId } = await params;
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const v = filterSchema.safeParse(body.filter ?? {});
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid filter", details: v.error.issues },
      { status: 400 }
    );
  }

  // Build exclusion list (must match the apply endpoint exactly so the count
  // and sample shown to admin reflect the *real* eligible pool):
  //  1. Anyone who currently follows the target.
  //  2. Anyone who was ever added to this target via a past boost batch
  //     (even if that batch was later reverted — admin doesn't want the
  //     boost tool to re-target the same user twice).
  const [existingFollows, pastBatches] = await Promise.all([
    prisma.follow.findMany({
      where: { followingId: targetId },
      select: { followerId: true },
    }),
    prisma.followerBoostBatch.findMany({
      where: { targetUserId: targetId },
      select: { sourceUserIds: true },
    }),
  ]);
  const excludeSet = new Set<string>();
  for (const f of existingFollows) excludeSet.add(f.followerId);
  for (const b of pastBatches) {
    for (const id of b.sourceUserIds) excludeSet.add(id);
  }
  const excludeIds = Array.from(excludeSet);

  const where = buildWhere(v.data, targetId, excludeIds);

  const [matchingCount, sample] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        username: true,
        avatar: true,
        country: true,
        city: true,
        gender: true,
        package: { select: { slug: true, name: true } },
        level: true,
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    matchingCount,
    cap: MAX_PER_OPERATION,
    sample,
  });
}
