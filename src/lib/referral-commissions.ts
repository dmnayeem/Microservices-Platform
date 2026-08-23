import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus, NotificationType } from "@/generated/prisma";
import { notifyUser } from "@/lib/notify";
import { getPointsPerUsd } from "@/lib/economy";
import { isDuplicateLedgerError } from "@/lib/idempotency";

/**
 * Process referral commissions for a user's task completion.
 *
 * Walks up the user's referral chain (up to 10 levels). Each upline user only
 * earns commission for levels their plan unlocks:
 *   - `Package.referralCommissionLevels === 0` → no commission at any level.
 *   - `referralCommissionLevels === N` → earns from L1..L_N only.
 *
 * Higher levels in the chain still earn (or skip) based on their own plan —
 * one ineligible upline does not stop commissions from flowing past them.
 */
export async function processReferralCommissions(
  userId: string,
  pointsEarned: number,
  taskId: string,
  /**
   * The submission this payout is for. It makes the ledger reference unique per
   * earning EVENT rather than per task — see the note on the reference below.
   * Optional only so an older caller can't silently break; every caller in the
   * app passes it.
   */
  submissionId?: string
) {
  try {
    const referralLevels = await prisma.referralLevel.findMany({
      where: { isActive: true },
      orderBy: { level: "asc" },
    });

    if (referralLevels.length === 0) {
      // Default L1 = 10% if admin hasn't seeded any levels.
      referralLevels.push({
        id: "1",
        level: 1,
        commissionType: "PERCENTAGE" as const,
        commissionValue: 10,
        commissionRate: 10,
        description: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const pointsPerUsd = await getPointsPerUsd();

    let currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { referredById: true },
    });

    // `referredById` is only ever set at registration, so a cycle should be
    // impossible — but an admin edit can create one, and walking a cycle pays
    // the same two accounts on every hop. Seeded with the earner so a
    // self-referral pays nobody.
    const visited = new Set<string>([userId]);

    for (let level = 1; level <= Math.min(10, referralLevels.length); level++) {
      if (!currentUser?.referredById) break;
      if (visited.has(currentUser.referredById)) {
        console.error(
          `[referral-commission] cycle detected at user=${currentUser.referredById} — stopping the walk`
        );
        break;
      }
      visited.add(currentUser.referredById);

      // A level with no active config is skipped, not fatal. `break` here meant
      // that deactivating level 1 while leaving 2 and 3 active silently stopped
      // every commission on the platform.
      const referrerConfig = referralLevels.find((r) => r.level === level);
      if (!referrerConfig) {
        const next = await prisma.user.findUnique({
          where: { id: currentUser.referredById },
          select: { referredById: true },
        });
        currentUser = next ? { referredById: next.referredById } : null;
        continue;
      }

      // Look up the upline's plan — they only earn this level if their plan
      // unlocks it (referralCommissionLevels >= level) and referrals are enabled.
      const upline = await prisma.user.findUnique({
        where: { id: currentUser.referredById },
        select: {
          id: true,
          referredById: true,
          package: {
            select: {
              referralCommissionLevels: true,
              referralsEnabled: true,
            },
          },
        },
      });

      const allowedLevels = upline?.package?.referralCommissionLevels ?? 0;
      const referralsOn = upline?.package?.referralsEnabled ?? false;
      const eligible = referralsOn && allowedLevels >= level;

      if (!eligible) {
        // Surfaces the exact reason a commission was skipped — invaluable
        // when admin reports "user X is still earning at level N" and we
        // need to verify the gate fired.
        console.log(
          `[referral-commission] skip user=${currentUser.referredById} level=${level} ` +
            `reason=${!referralsOn ? "referrals_disabled" : `plan_only_unlocks_${allowedLevels}`}`
        );
      }

      if (eligible) {
        let commission: number;
        if (referrerConfig.commissionType === "PERCENTAGE") {
          commission = Math.floor(pointsEarned * (referrerConfig.commissionValue / 100));
        } else {
          // FLAT_RATE commissionValue is denominated in USD → convert to points.
          commission = Math.floor(referrerConfig.commissionValue * pointsPerUsd);
        }

        if (commission > 0) {
          const uplineId = currentUser.referredById;
          // Keyed on the SUBMISSION, not the task.
          //
          // It used to be `referral_<user>_<task>_L<level>`, which is the same
          // string every time a user completes the same task — and repeatable
          // tasks, daily tasks and re-approvals all do that. The three writes
          // below were also three separate top-level calls in the wrong order:
          // the balance went up FIRST, then the ledger insert hit P2002 on
          // (userId, reference), and the throw escaped to the outer catch. So
          // every repeat completion credited real points with no ledger row —
          // silent, unauditable minting — and killed levels 2 and 3 on the way
          // out, even though their references would not have collided.
          const reference = submissionId
            ? `referral_${submissionId}_L${level}`
            : `referral_${userId}_${taskId}_L${level}`;

          try {
            await prisma.$transaction(async (tx) => {
              // Ledger first: it carries the unique constraint, so a replay
              // fails here — before any balance moves.
              await tx.transaction.create({
                data: {
                  userId: uplineId,
                  type: TransactionType.REFERRAL,
                  status: TransactionStatus.COMPLETED,
                  points: commission,
                  amount: commission / pointsPerUsd,
                  description: `Level ${level} referral commission (${
                    referrerConfig.commissionType === "PERCENTAGE"
                      ? `${referrerConfig.commissionValue}%`
                      : `$${referrerConfig.commissionValue}`
                  })`,
                  reference,
                  metadata: {
                    referredUserId: userId,
                    sourceTaskId: taskId,
                    sourceSubmissionId: submissionId ?? null,
                    level,
                    commissionType: referrerConfig.commissionType,
                    commissionValue: referrerConfig.commissionValue,
                  },
                },
              });
              await tx.user.update({
                where: { id: uplineId },
                data: {
                  pointsBalance: { increment: commission },
                  totalEarnings: { increment: commission / pointsPerUsd },
                },
              });
              await tx.referralEarning.create({
                data: {
                  userId: uplineId,
                  referredUserId: userId,
                  level,
                  amount: commission / pointsPerUsd,
                  sourceType: "TASK",
                  sourceId: taskId,
                },
              });
            });

            await notifyUser({
              userId: uplineId,
              type: NotificationType.REFERRAL,
              title: "Referral Commission!",
              message: `You earned ${commission} points from your level ${level} referral's activity!`,
              data: {
                commission,
                level,
                referredUserId: userId,
                commissionType: referrerConfig.commissionType,
                commissionValue: referrerConfig.commissionValue,
              },
              link: "/referrals",
            });
          } catch (err) {
            // Already paid for this submission at this level. Nothing moved —
            // the ledger insert is the first statement in the transaction.
            // Keep walking: the levels above have their own references.
            if (!isDuplicateLedgerError(err)) throw err;
            console.log(
              `[referral-commission] already paid user=${uplineId} level=${level} ref=${reference}`
            );
          }
        }
      }

      // Always continue up the chain — a free-tier upline doesn't block their
      // own upline from earning their (eligible) commission.
      currentUser = upline
        ? { referredById: upline.referredById }
        : null;
    }
  } catch (error) {
    console.error("Error processing referral commissions:", error);
    // Don't throw — referral errors shouldn't block the main task.
  }
}
