import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { creditPoints } from "@/lib/ledger";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { calculateLevel } from "@/lib/level";
import { TransactionType } from "@/generated/prisma";

/**
 * POST /api/achievements/[id]/claim — collect an unlocked achievement's reward.
 *
 * `Achievement.pointsReward` and `xpReward` were displayed on the achievements
 * page from the start but no code anywhere ever paid them: there was no claim
 * endpoint, and `UserAchievement` had no write path at all.
 *
 * A claim step rather than crediting on unlock. Every existing user has months
 * of history that the new unlock engine backfills the moment they load the
 * page; paying automatically would have credited all of it in one silent burst.
 * This way the user chooses to collect, and each collection is one visible,
 * idempotent action.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;
    const { id } = await params;

    const achievement = await prisma.achievement.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        isActive: true,
        pointsReward: true,
        xpReward: true,
      },
    });
    if (!achievement || !achievement.isActive) {
      return NextResponse.json({ error: "Achievement not found" }, { status: 404 });
    }

    const state = await prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId: id } },
      select: { isCompleted: true, claimedAt: true },
    });
    if (!state?.isCompleted) {
      return NextResponse.json(
        { error: "You have not unlocked this achievement yet." },
        { status: 400 }
      );
    }
    if (state.claimedAt) {
      return NextResponse.json(
        { error: "Already claimed.", alreadyClaimed: true },
        { status: 409 }
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Claim the row first. Two concurrent clicks — or a retry — both reach
        // the balance update otherwise, and the ledger's unique reference would
        // then abort the whole transaction rather than one losing cleanly.
        const claimed = await tx.userAchievement.updateMany({
          where: { userId, achievementId: id, isCompleted: true, claimedAt: null },
          data: { claimedAt: new Date() },
        });
        if (claimed.count === 0) throw new Error("ALREADY_CLAIMED");

        if (achievement.pointsReward > 0) {
          // `creditPoints` keeps `pointsBalance`, `totalEarnings` and the
          // `Transaction` row in step. The reference is deterministic, so
          // `@@unique([userId, reference])` is the backstop behind the CAS.
          await creditPoints(tx, {
            userId,
            points: achievement.pointsReward,
            type: TransactionType.BONUS,
            description: `Achievement unlocked — ${achievement.name}`,
            reference: `achievement_${id}`,
            metadata: { achievementId: id, xpReward: achievement.xpReward },
          });
        }

        // XP is not money and `creditPoints` does not handle it, so it is an
        // explicit write — including the level recompute, which several older
        // XP paths forgot and left users stuck below the level they had earned.
        if (achievement.xpReward > 0) {
          const u = await tx.user.update({
            where: { id: userId },
            data: { xp: { increment: achievement.xpReward } },
            select: { xp: true, level: true },
          });
          const newLevel = calculateLevel(u.xp);
          if (newLevel > u.level) {
            await tx.user.update({
              where: { id: userId },
              data: { level: newLevel },
            });
          }
        }
      });
    } catch (err) {
      if (
        (err instanceof Error && err.message === "ALREADY_CLAIMED") ||
        isDuplicateLedgerError(err)
      ) {
        return NextResponse.json(
          { error: "Already claimed.", alreadyClaimed: true },
          { status: 409 }
        );
      }
      throw err;
    }

    return NextResponse.json({
      success: true,
      pointsAwarded: achievement.pointsReward,
      xpAwarded: achievement.xpReward,
    });
  } catch (error) {
    console.error("Achievement claim failed:", error);
    return NextResponse.json({ error: "Failed to claim" }, { status: 500 });
  }
}
