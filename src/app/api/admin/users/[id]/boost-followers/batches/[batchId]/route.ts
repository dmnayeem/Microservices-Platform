import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/users/[id]/boost-followers/batches/[batchId]
// Undo a bulk-follow batch:
//   1. Find all Follow rows tagged with this batchId
//   2. Delete them
//   3. Decrement target.followersCount by N
//   4. Decrement each source.followingCount by 1
//   5. Mark the batch REVERTED
export async function DELETE(
  _req: Request,
  {
    params,
  }: { params: Promise<{ id: string; batchId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "users.edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: targetUserId, batchId } = await params;

  const batch = await prisma.followerBoostBatch.findUnique({
    where: { id: batchId },
  });
  if (!batch || batch.targetUserId !== targetUserId) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  if (batch.status === "REVERTED") {
    return NextResponse.json(
      { error: "This batch is already reverted" },
      { status: 400 }
    );
  }

  // Pull source IDs before deleting
  const followsToRemove = await prisma.follow.findMany({
    where: { boostBatchId: batchId },
    select: { followerId: true },
  });
  const sourceIds = followsToRemove.map((f) => f.followerId);

  const result = await prisma.$transaction(async (tx) => {
    const del = await tx.follow.deleteMany({
      where: { boostBatchId: batchId },
    });

    if (del.count > 0) {
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          followersCount: { decrement: del.count },
        },
      });
      if (sourceIds.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: sourceIds } },
          data: { followingCount: { decrement: 1 } },
        });
      }
    }

    const updatedBatch = await tx.followerBoostBatch.update({
      where: { id: batchId },
      data: {
        status: "REVERTED",
        revertedAt: new Date(),
        revertedBy: session.user!.id,
      },
    });

    return { removedCount: del.count, batch: updatedBatch };
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "FOLLOWER_BOOST_REVERTED",
      entity: "User",
      entityId: targetUserId,
      newData: {
        batchId,
        removedCount: result.removedCount,
      },
    },
  });

  return NextResponse.json({
    success: true,
    removedCount: result.removedCount,
  });
}
