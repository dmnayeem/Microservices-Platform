import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { NotificationType } from "@/generated/prisma/client";
import {
  applySchema,
  buildWhere,
  MAX_PER_OPERATION,
} from "@/lib/follower-boost";

// POST /api/admin/users/[id]/boost-followers/apply
// Atomically:
//   1. resolve filter → list of source user ids (cap MAX_PER_OPERATION)
//   2. randomly pick `amount` ids from the matching pool
//   3. create FollowerBoostBatch
//   4. create Follow rows tagged with batchId
//   5. bump target.followersCount and source.followingCount
//   6. optionally fire one combined notification to target
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
    select: { id: true, name: true, username: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const raw = await req.json();
  const v = applySchema.safeParse(raw);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const { filter, amount, notifyTarget } = v.data;

  // Build exclusion list:
  //  1. Anyone who currently follows the target
  //  2. Anyone who was *ever* added to this target via a past boost batch
  //     (even if that batch was later reverted — admin doesn't want to
  //     re-add the same user twice via the boost tool).
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

  const where = buildWhere(filter, targetId, excludeIds);

  // Fetch the candidate pool. Cap at a generous ceiling to avoid pathological
  // filters returning millions of rows.
  const FETCH_CEILING = 50_000;

  const candidates = await prisma.user.findMany({
    where,
    select: { id: true },
    take: FETCH_CEILING,
  });

  // How many will we actually request? min(amount, pool, MAX_PER_OPERATION)
  const requested = Math.min(amount, candidates.length, MAX_PER_OPERATION);

  // Always randomize selection from the pool — fairness across reruns.
  const arr = candidates.map((u) => u.id);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const sourceIds = arr.slice(0, requested);

  if (sourceIds.length === 0) {
    return NextResponse.json({
      success: true,
      addedCount: 0,
      message: "No new candidates matched the filter",
    });
  }

  // Atomic apply
  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.followerBoostBatch.create({
      data: {
        targetUserId: targetId,
        criteria: filter as object,
        mode: "RANDOM", // kept for backward-compat with existing batches
        requestedCount: requested,
        addedCount: 0,
        // Persist the user ids we're about to add. Survives revert so future
        // boost runs can permanently exclude these users.
        sourceUserIds: sourceIds,
        notifyTarget,
        performedBy: session.user!.id,
      },
    });

    // Bulk insert Follow rows; skipDuplicates protects against any race.
    const created = await tx.follow.createMany({
      data: sourceIds.map((sId) => ({
        followerId: sId,
        followingId: targetId,
        boostBatchId: batch.id,
      })),
      skipDuplicates: true,
    });

    // Increment target's followers + each source's following counter
    await tx.user.update({
      where: { id: targetId },
      data: { followersCount: { increment: created.count } },
    });
    await tx.user.updateMany({
      where: { id: { in: sourceIds } },
      data: { followingCount: { increment: 1 } },
    });

    const finalBatch = await tx.followerBoostBatch.update({
      where: { id: batch.id },
      data: { addedCount: created.count },
    });

    if (notifyTarget && created.count > 0) {
      await tx.notification.create({
        data: {
          userId: targetId,
          type: NotificationType.SOCIAL,
          title: `+${created.count.toLocaleString()} new followers`,
          message: `Your follower count just grew by ${created.count.toLocaleString()}.`,
          data: { batchId: batch.id, count: created.count },
        },
      });
    }

    return { batch: finalBatch, addedCount: created.count };
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "FOLLOWER_BOOST_APPLIED",
      entity: "User",
      entityId: targetId,
      newData: {
        batchId: result.batch.id,
        amount,
        requestedCount: requested,
        addedCount: result.addedCount,
        notifyTarget,
        filter,
      },
    },
  });

  return NextResponse.json({
    success: true,
    batchId: result.batch.id,
    addedCount: result.addedCount,
    requestedCount: requested,
  });
}
