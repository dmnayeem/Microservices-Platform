import { prisma } from "@/lib/prisma";
import { getPointsPerUsd, getPointsConvertThreshold, pointsToUsd } from "@/lib/economy";
import { toNum } from "@/lib/money";

export type ConvertResult =
  | { ok: true; pointsConverted: number; cashAdded: number; newCash: number }
  | { ok: false; reason: "BELOW_THRESHOLD" | "CONFLICT"; threshold: number; points: number };

/**
 * Convert a user's ENTIRE points balance into withdrawable cash, once they hold
 * at least the admin-configured threshold. Points-type income (tasks, referral,
 * social, daily) accumulates as points; this is the single gate that moves it
 * into the main cash balance so it can be withdrawn.
 *
 * Atomic + no-race: reads the current points, then CAS-updates on the exact
 * value — a concurrent earn/spend changes the row and the update matches 0 rows,
 * returning CONFLICT so the caller can retry. `totalEarnings` is NOT touched
 * (points were already mirrored there when earned).
 */
export async function convertAllPointsToCash(userId: string): Promise<ConvertResult> {
  const [rate, threshold] = await Promise.all([
    getPointsPerUsd(),
    getPointsConvertThreshold(),
  ]);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pointsBalance: true },
  });
  const points = user?.pointsBalance ?? 0;

  if (points < threshold) {
    return { ok: false, reason: "BELOW_THRESHOLD", threshold, points };
  }

  const usd = Math.round(pointsToUsd(points, rate) * 100) / 100;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // CAS on the exact points value read — blocks concurrent double-convert
      // and keeps the credited cash matched to the debited points.
      const moved = await tx.user.updateMany({
        where: { id: userId, pointsBalance: points },
        data: {
          pointsBalance: { decrement: points },
          cashBalance: { increment: usd },
        },
      });
      if (moved.count === 0) throw new Error("CONFLICT");

      await tx.transaction.create({
        data: {
          userId,
          type: "POINTS_CONVERSION",
          status: "COMPLETED",
          points: -points,
          amount: usd,
          description: `Converted ${points.toLocaleString()} points to $${usd.toFixed(2)}`,
          reference: `convert_${userId}_${Date.now()}`,
        },
      });

      const updated = await tx.user.findUnique({
        where: { id: userId },
        select: { cashBalance: true },
      });
      return updated;
    });

    return {
      ok: true,
      pointsConverted: points,
      cashAdded: usd,
      newCash: toNum(result?.cashBalance),
    };
  } catch (e) {
    if (e instanceof Error && e.message === "CONFLICT") {
      return { ok: false, reason: "CONFLICT", threshold, points };
    }
    throw e;
  }
}
