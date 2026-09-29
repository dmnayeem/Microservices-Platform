import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus, NotificationType } from "@/generated/prisma";
import { notifyUser } from "@/lib/notify";
import { getPointsPerUsd } from "@/lib/economy";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { getSetting } from "@/lib/system-settings";
import {
  REFERRAL_COMMISSION_SOURCES_KEY,
  allTaskTypesOn,
  normalizeCommissionSources,
  taskTypeCommissionOn,
  type CommissionSourceKey,
} from "@/lib/referral-commission-sources";

/** The admin's commission-source switches (see referral-commission-sources.ts). */
export async function getCommissionSources(): Promise<Record<CommissionSourceKey, boolean>> {
  try {
    return normalizeCommissionSources(
      await getSetting<unknown>(REFERRAL_COMMISSION_SOURCES_KEY, null)
    );
  } catch {
    // A settings blip must not change who gets paid: fall back to the defaults,
    // which are exactly the behaviour before the setting existed.
    return normalizeCommissionSources(null);
  }
}

/** What one earning event is, for the commission rows it produces. */
interface CommissionEvent {
  /** `<base>_L<level>` is the ledger + accrual reference: unique per event. */
  referenceBase: string;
  sourceType: "TASK" | "CPA" | "OFFERWALL";
  sourceId: string | null;
  /** Appended to the ledger description, e.g. " · CPA offer". */
  label: string;
  metadata: Record<string, unknown>;
}

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
  // Commission sources (admin, Referrals → Commission levels). Every task type
  // is on by default — today's behaviour — and then no task lookup is needed.
  try {
    const sources = await getCommissionSources();
    if (!allTaskTypesOn(sources)) {
      const task = await prisma.task.findUnique({ where: { id: taskId }, select: { type: true } });
      if (!taskTypeCommissionOn(sources, task?.type)) {
        console.log(`[referral-commission] skip task=${taskId} type=${task?.type} reason=source_off`);
        return;
      }
    }
  } catch (error) {
    console.error("Error reading referral commission sources:", error);
    return;
  }
  await payReferralChain(userId, pointsEarned, {
    // Unchanged from before the sources existed, so an event paid under the
    // old code is still recognised as paid.
    referenceBase: submissionId ? `referral_${submissionId}` : `referral_${userId}_${taskId}`,
    sourceType: "TASK",
    sourceId: taskId,
    label: "",
    metadata: { source: "task", sourceTaskId: taskId, sourceSubmissionId: submissionId ?? null },
  });
}

/**
 * My Team commission on an approved (credited) CPA conversion — only when the
 * admin switched "cpa" on (off by default: CPA never paid commission). Keyed
 * on the conversion: `referral_cpa_<conversionId>_L<n>`, so a second call pays
 * nothing more. A conversion is credited at most once (credit.ts), so a retry
 * after a rejection cannot earn the upline twice either.
 */
export async function processCpaReferralCommissions(
  userId: string,
  pointsEarned: number,
  conversionId: string,
  offerId: string
) {
  try {
    if (!(await getCommissionSources()).cpa) return;
  } catch {
    return;
  }
  await payReferralChain(userId, pointsEarned, {
    referenceBase: `referral_cpa_${conversionId}`,
    sourceType: "CPA",
    sourceId: offerId,
    label: " · CPA offer",
    metadata: { source: "cpa", sourceConversionId: conversionId, sourceOfferId: offerId },
  });
}

/**
 * My Team commission on a credited offerwall completion — only when the admin
 * switched "offerwall" on (off by default). `eventKey` names the one credit it
 * is for (a completion id, or the callback's own key for a legacy wall
 * callback), so every path that credits the same completion shares one
 * reference: `referral_ow_<eventKey>_L<n>`.
 */
export async function processOfferwallReferralCommissions(
  userId: string,
  pointsEarned: number,
  eventKey: string,
  offerId: string | null
) {
  try {
    if (!(await getCommissionSources()).offerwall) return;
  } catch {
    return;
  }
  await payReferralChain(userId, pointsEarned, {
    referenceBase: `referral_ow_${eventKey}`,
    sourceType: "OFFERWALL",
    sourceId: offerId,
    label: " · offerwall",
    metadata: { source: "offerwall", sourceEventKey: eventKey, sourceOfferId: offerId },
  });
}

/** Walk the upline and pay each eligible level for one earning event. */
async function payReferralChain(userId: string, pointsEarned: number, ev: CommissionEvent) {
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

    // Walk to the DEEPEST active level, not to the number of active levels:
    // with only levels 1 and 5 on, the count is 2, so level 5 never paid.
    const deepest = Math.min(10, Math.max(...referralLevels.map((r) => r.level)));
    for (let level = 1; level <= deepest; level++) {
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
        // Exact commission in THOUSANDTHS of a point, floored (never rounded
        // up). Flooring whole points instead paid 0 on every small task — a 3%
        // cut of 30 pts is 0.9 — so no commission was ever paid. The fraction
        // now accrues on the upline and whole points are paid once it reaches
        // 1000. `round6` strips float noise (0.1 * 3 = 0.30000000000000004)
        // before the floor so a 999.9999999 does not lose a milli-point.
        const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
        const milli =
          referrerConfig.commissionType === "PERCENTAGE"
            ? Math.floor(round6(pointsEarned * referrerConfig.commissionValue * 10))
            : // FLAT_RATE commissionValue is denominated in USD → convert to points.
              Math.floor(round6(referrerConfig.commissionValue * pointsPerUsd * 1000));

        if (milli > 0) {
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
          const reference = `${ev.referenceBase}_L${level}`;

          try {
            const commission = await prisma.$transaction(async (tx) => {
              // Accrual first: its unique (userId, reference) makes a replay
              // fail here — before the carry or any balance moves — even for
              // an event that pays no whole point and so writes no ledger row.
              await tx.referralCommissionAccrual.create({
                data: { userId: uplineId, reference, milli },
              });
              // Paid under the pre-carry code (same reference)? Then this event
              // is settled; recording its fraction again would pay it twice.
              const settled = await tx.transaction.findUnique({
                where: { userId_reference: { userId: uplineId, reference } },
                select: { id: true },
              });
              if (settled) return 0;

              // The increment takes the row lock, so a concurrent commission
              // for the same upline waits and then reads this carry.
              const { referralCommissionCarryMilli: carry } = await tx.user.update({
                where: { id: uplineId },
                data: { referralCommissionCarryMilli: { increment: milli } },
                select: { referralCommissionCarryMilli: true },
              });
              const payout = Math.floor(carry / 1000);
              if (payout <= 0) return 0;

              // Ledger next: it carries the unique constraint too.
              await tx.transaction.create({
                data: {
                  userId: uplineId,
                  type: TransactionType.REFERRAL,
                  status: TransactionStatus.COMPLETED,
                  points: payout,
                  amount: payout / pointsPerUsd,
                  description: `Level ${level} referral commission (${
                    referrerConfig.commissionType === "PERCENTAGE"
                      ? `${referrerConfig.commissionValue}%`
                      : `$${referrerConfig.commissionValue}`
                  })${ev.label}`,
                  reference,
                  metadata: {
                    referredUserId: userId,
                    ...ev.metadata,
                    level,
                    commissionType: referrerConfig.commissionType,
                    commissionValue: referrerConfig.commissionValue,
                    // This event's exact share, and the carry it closed out.
                    commissionMilli: milli,
                    carryMilliBefore: carry - milli,
                  },
                },
              });
              await tx.user.update({
                where: { id: uplineId },
                data: {
                  referralCommissionCarryMilli: { decrement: payout * 1000 },
                  pointsBalance: { increment: payout },
                  totalEarnings: { increment: payout / pointsPerUsd },
                },
              });
              await tx.referralCommissionAccrual.update({
                where: { userId_reference: { userId: uplineId, reference } },
                data: { paidPoints: payout },
              });
              await tx.referralEarning.create({
                data: {
                  userId: uplineId,
                  referredUserId: userId,
                  level,
                  amount: payout / pointsPerUsd,
                  sourceType: ev.sourceType,
                  sourceId: ev.sourceId,
                },
              });
              return payout;
            });

            if (commission > 0) {
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
            }
          } catch (err) {
            // Already accrued/paid for this submission at this level. Nothing
            // moved — the accrual insert is the first statement in the
            // transaction. Keep walking: the levels above have their own
            // references.
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
