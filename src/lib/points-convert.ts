import { usd as formatUsd } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { getPointsPerUsd, getPointsConvertThreshold, pointsToUsd } from "@/lib/economy";
import { toNum } from "@/lib/money";

export type ConvertResult =
  | { ok: true; pointsConverted: number; cashAdded: number; newCash: number }
  | {
      ok: false;
      reason: "BELOW_THRESHOLD" | "CONFLICT" | "TOO_SMALL" | "INSUFFICIENT";
      threshold: number;
      points: number;
      min?: number;
    };

/**
 * Convert points into withdrawable cash. Pass `requestedPoints` to convert a
 * partial amount; omit it to convert the entire balance. Requires the user to
 * hold at least the admin-configured threshold, and the converted chunk must be
 * ≥ `pointsPerUsd` (i.e. worth ≥ $1). Points-type income (tasks, referral,
 * social, daily) accumulates as points; this is the gate that moves it into the
 * main cash balance so it can be withdrawn.
 *
 * Atomic + no-overdraft: a CAS decrement (`pointsBalance >= amount`) keeps the
 * credited cash matched to the debited points; a concurrent drain matches 0 rows
 * → CONFLICT. `totalEarnings` is NOT touched (points were mirrored there when earned).
 */
export async function convertPointsToCash(
  userId: string,
  requestedPoints?: number
): Promise<ConvertResult> {
  const [rate, threshold] = await Promise.all([
    getPointsPerUsd(),
    getPointsConvertThreshold(),
  ]);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pointsBalance: true },
  });
  const balance = user?.pointsBalance ?? 0;
  const minConvert = Math.max(1, Math.ceil(rate)); // ≥ $1 worth of points

  if (balance < threshold) {
    return { ok: false, reason: "BELOW_THRESHOLD", threshold, points: balance };
  }

  // Default to the whole balance; otherwise the requested (floored) amount.
  const amount = requestedPoints == null ? balance : Math.floor(requestedPoints);
  if (amount > balance) {
    return { ok: false, reason: "INSUFFICIENT", threshold, points: balance };
  }
  if (amount < minConvert) {
    return { ok: false, reason: "TOO_SMALL", threshold, points: balance, min: minConvert };
  }

  // Rounded DOWN to the cent, never half-up.
  //
  // With `Math.round`, converting at rate 1000 in 1005-point chunks produced
  // $1.005 → $1.01: half a cent of free cash per chunk, and `minConvert` is
  // exactly 1000, so 1005 is a legal chunk. Repeating it across a balance
  // minted roughly 0.5% out of nothing. The platform must never round a
  // user's favour on a conversion boundary.
  const usd = Math.floor(pointsToUsd(amount, rate) * 100) / 100;
  if (usd <= 0) {
    return { ok: false, reason: "TOO_SMALL", threshold, points: balance, min: minConvert };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const moved = await tx.user.updateMany({
        where: { id: userId, pointsBalance: { gte: amount } },
        data: {
          pointsBalance: { decrement: amount },
          cashBalance: { increment: usd },
        },
      });
      if (moved.count === 0) throw new Error("CONFLICT");

      await tx.transaction.create({
        data: {
          userId,
          type: "POINTS_CONVERSION",
          status: "COMPLETED",
          points: -amount,
          amount: usd,
          description: `Converted ${amount.toLocaleString()} points to ${formatUsd(usd)}`,
          // Per-occurrence by design. A user may convert points to cash
          // twice in a session, for the same amount, quite legitimately.
          // A deterministic key would make `Transaction @@unique([userId, reference])`
          // reject the second one, so this stays keyed on the instant it happened.
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
      pointsConverted: amount,
      cashAdded: usd,
      newCash: toNum(result?.cashBalance),
    };
  } catch (e) {
    if (e instanceof Error && e.message === "CONFLICT") {
      return { ok: false, reason: "CONFLICT", threshold, points: balance };
    }
    throw e;
  }
}

/** Back-compat wrapper — converts the entire balance. */
export async function convertAllPointsToCash(userId: string): Promise<ConvertResult> {
  return convertPointsToCash(userId);
}
