// Take back My Team (upline) commissions when the earning they were paid on is
// reversed — a CPA chargeback, an offerwall chargeback.
//
// Commissions are written by referral-commissions.ts under
// `<referenceBase>_L<level>` (e.g. `referral_cpa_<conversionId>_L1`,
// `referral_ow_<completionId>_L2`). Before this existed a reversed conversion
// clawed back the earner's points but every upline kept the commission paid on
// it, so the same chargeback could be farmed through a referral chain.
//
// Each paid commission row gets one PENALTY row under `<reference>_clawback`.
// The ledger's @@unique([userId, reference]) makes a replayed reversal a no-op.
// The deduction is clamped to the upline's current balance (a negative balance
// breaks every `gte` guard) and NEVER lowers totalEarnings — deductions never
// touch lifetime earnings (same rule as the leaderboard prize correction).
import { prisma } from "@/lib/prisma";
import { isDuplicateLedgerError } from "@/lib/idempotency";

export interface ReferralClawbackResult {
  rows: number;
  owed: number;
  clawedBack: number;
}

export async function clawbackReferralCommissions(
  referenceBase: string,
  reason: string
): Promise<ReferralClawbackResult> {
  const out: ReferralClawbackResult = { rows: 0, owed: 0, clawedBack: 0 };
  try {
    const paid = await prisma.transaction.findMany({
      where: {
        type: "REFERRAL",
        reference: { startsWith: `${referenceBase}_L` },
        points: { gt: 0 },
      },
      select: { userId: true, reference: true, points: true },
      take: 50,
    });
    for (const row of paid) {
      if (!row.reference || !/_L\d+$/.test(row.reference)) continue;
      const owed = Math.abs(row.points);
      try {
        const clawed = await prisma.$transaction(async (tx) => {
          const holder = await tx.user.findUnique({
            where: { id: row.userId },
            select: { pointsBalance: true },
          });
          const take = Math.max(0, Math.min(holder?.pointsBalance ?? 0, owed));
          // The ledger row first: its unique reference makes a replay throw
          // before any balance moves.
          await tx.transaction.create({
            data: {
              userId: row.userId,
              type: "PENALTY",
              status: "COMPLETED",
              points: -take,
              amount: 0,
              description: `Referral commission reversed: ${reason}`.slice(0, 250),
              reference: `${row.reference}_clawback`,
              metadata: {
                kind: "referral_clawback",
                commissionReference: row.reference,
                owed,
                clawedBack: take,
                shortfall: owed - take,
              },
            },
          });
          if (take > 0) {
            await tx.user.update({
              where: { id: row.userId },
              data: { pointsBalance: { decrement: take } },
            });
          }
          return take;
        });
        out.rows++;
        out.owed += owed;
        out.clawedBack += clawed;
      } catch (err) {
        if (!isDuplicateLedgerError(err)) throw err; // already clawed back
      }
    }
  } catch (err) {
    // Never block the reversal that called this; it is logged for follow-up.
    console.error(`[referral-clawback] failed for ${referenceBase}:`, err);
  }
  return out;
}
