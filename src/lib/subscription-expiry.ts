import { usd } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { TransactionType, TransactionStatus } from "@/generated/prisma/client";
import { defaultPackage } from "@/lib/packages";
import { getSetting } from "@/lib/system-settings";
import { PLAN_DURATION_DAYS, planPriceUsd, type PlanDuration } from "@/lib/plan-pricing";
import { toNum } from "@/lib/money";
import { deliverToUser } from "@/lib/notify";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Global admin switch (System Settings → Money → Plans). Default on. */
export async function planAutoRenewEnabled(): Promise<boolean> {
  return (await getSetting<boolean>("plans.auto_renew_enabled", true).catch(() => true)) !== false;
}

/**
 * Which duration a subscription term was bought for, from its length. Terms
 * longer than ~13 months (LIFETIME, or odd admin-made rows) never auto-renew.
 */
function termDuration(startDate: Date, endDate: Date): PlanDuration | null {
  const days = (endDate.getTime() - startDate.getTime()) / DAY_MS;
  if (days <= 0 || days > 400) return null;
  if (days < 60) return "MONTHLY";
  if (days < 200) return "QUARTERLY";
  return "YEARLY";
}

/**
 * For each active subscription whose end date has passed:
 *   • autoRenew on (and allowed globally by `plans.auto_renew_enabled`) + the
 *     plan still on sale + the user still on it + enough CASH → charge the
 *     plan's CURRENT price for the same term length and extend the period.
 *     The charge is a compare-and-set on the period as read, and the ledger row
 *     (PURCHASE `sub_renew_<id>_<oldEnd>`, counted as subscription revenue in
 *     lib/finance/revenue.ts) is keyed on that same old value, so two
 *     overlapping sweeps can never both charge.
 *   • otherwise → deactivate the subscription and revert the user to the default
 *     package (only when their overall entitlement has actually lapsed).
 * Idempotent + safe to re-run. Returns a summary.
 */
/** One batch. `runSubscriptionExpiry` below drives this until the queue drains. */
async function runSubscriptionExpiryBatch(): Promise<{
  processed: number;
  renewed: number;
  expired: number;
}> {
  const now = new Date();
  const due = await prisma.subscription.findMany({
    where: { isActive: true, endDate: { lte: now } },
    take: 100,
  });

  // Subscription has no `user` relation — batch-load balance + entitlement expiry.
  const balanceById = new Map<string, number>();
  const expiresById = new Map<string, Date | null>();
  const planById = new Map<string, string | null>();
  if (due.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: due.map((s) => s.userId) } },
      select: { id: true, cashBalance: true, packageExpiresAt: true, packageId: true, status: true },
    });
    for (const u of users) {
      // A banned / suspended account is never charged by a background job.
      const blocked = u.status === "BANNED" || u.status === "SUSPENDED";
      balanceById.set(u.id, blocked ? -1 : toNum(u.cashBalance));
      expiresById.set(u.id, u.packageExpiresAt);
      planById.set(u.id, u.packageId);
    }
  }

  const renewAllowed = due.some((s) => s.autoRenew) ? await planAutoRenewEnabled() : false;
  const pkgIds = [
    ...new Set(due.filter((s) => s.autoRenew && s.packageId).map((s) => s.packageId as string)),
  ];
  const pkgRows =
    renewAllowed && pkgIds.length
      ? await prisma.package.findMany({
          where: { id: { in: pkgIds } },
          select: { id: true, name: true, isActive: true, priceMonthly: true, priceYearly: true },
        })
      : [];
  const pkgById = new Map(pkgRows.map((p) => [p.id, p]));

  const fallback = await defaultPackage();

  let renewed = 0;
  let expired = 0;

  for (const sub of due) {
    const pkg = sub.packageId ? pkgById.get(sub.packageId) : undefined;
    const duration = termDuration(sub.startDate, sub.endDate);
    const price =
      pkg && duration
        ? planPriceUsd(
            {
              priceMonthly: toNum(pkg.priceMonthly),
              priceYearly: pkg.priceYearly == null ? null : toNum(pkg.priceYearly),
            },
            duration
          )
        : null;

    if (
      renewAllowed &&
      sub.autoRenew &&
      pkg &&
      pkg.isActive &&
      duration &&
      price != null &&
      price > 0 &&
      // Only the plan the user is actually on renews.
      planById.get(sub.userId) === sub.packageId &&
      (balanceById.get(sub.userId) ?? 0) >= price
    ) {
      const newEnd = new Date(now.getTime() + PLAN_DURATION_DAYS[duration] * DAY_MS);
      try {
        await prisma.$transaction(async (tx) => {
          // Claim THIS period first: only the run that moves `endDate` off the
          // value it read may debit.
          const claim = await tx.subscription.updateMany({
            where: { id: sub.id, isActive: true, autoRenew: true, endDate: sub.endDate },
            // startDate moves too, so the row always spans exactly one term
            // (termDuration() reads the length to know what to renew next time).
            data: { startDate: now, endDate: newEnd },
          });
          if (claim.count === 0) throw new Error("ALREADY_RENEWED");
          const debit = await tx.user.updateMany({
            where: { id: sub.userId, packageId: sub.packageId, cashBalance: { gte: price } },
            data: { cashBalance: { decrement: price }, packageExpiresAt: newEnd },
          });
          if (debit.count === 0) throw new Error("INSUFFICIENT");
          await tx.transaction.create({
            data: {
              userId: sub.userId,
              type: TransactionType.PURCHASE,
              status: TransactionStatus.COMPLETED,
              amount: price,
              points: 0,
              description: `${pkg.name} plan auto-renewal (${duration.toLowerCase()})`,
              reference: `sub_renew_${sub.id}_${sub.endDate.getTime()}`,
              metadata: {
                subscriptionId: sub.id,
                packageId: sub.packageId,
                duration,
                priceUsd: price,
              },
            },
          });
        });
        renewed++;
        void deliverToUser({
          userId: sub.userId,
          title: "Subscription renewed",
          message: `Your ${pkg.name} plan was auto-renewed for ${usd(price)}.`,
          link: "/my-package",
        });
        continue;
      } catch (e) {
        // Another run already renewed this period — nothing left to do.
        if (e instanceof Error && e.message === "ALREADY_RENEWED") continue;
        // Balance moved / race / duplicate — fall through and expire instead.
      }
    }

    const entitlement = expiresById.get(sub.userId);
    const stillEntitled =
      entitlement != null && entitlement.getTime() > now.getTime();
    // Conditional on the period as read: an overlapping run may have just
    // renewed (and charged for) this subscription — ending it now would take
    // the plan away from someone who paid for it.
    const ended = await prisma.$transaction(async (tx) => {
      const off = await tx.subscription.updateMany({
        where: { id: sub.id, isActive: true, endDate: sub.endDate },
        data: { isActive: false },
      });
      if (off.count === 0) return false;
      if (!stillEntitled) {
        await tx.user.update({
          where: { id: sub.userId },
          data: { packageId: fallback?.id ?? null, packageExpiresAt: null },
        });
      }
      return true;
    });
    if (!ended) continue;
    expired++;
    void deliverToUser({
      userId: sub.userId,
      title: "Subscription expired",
      message: sub.autoRenew
        ? "Your premium plan has ended — it could not auto-renew (not enough cash in your wallet, or the plan is no longer sold). Renew any time to restore your benefits."
        : "Your premium plan has ended. Renew any time to restore your benefits.",
      link: "/packages",
    });
  }

  return { processed: due.length, renewed, expired };
}

/** How many rows one batch takes — must match the `take` above. */
const BATCH = 100;
/** Safety stop, plus a wall-clock budget so one run can't hang forever. */
const MAX_BATCHES = 100;
const BUDGET_MS = 45_000;

/**
 * Expire or renew every due subscription.
 *
 * This used to be a single `take: 100` pass per day. If more than 100 expired in
 * a day the backlog grew permanently and those users kept a plan they had
 * stopped paying for — a revenue leak that gets worse as the userbase grows, and
 * one that looks like a working cron the whole time. Now it loops until drained.
 */
export async function runSubscriptionExpiry(): Promise<{
  processed: number;
  renewed: number;
  expired: number;
  batches: number;
  drained: boolean;
}> {
  let processed = 0;
  let renewed = 0;
  let expired = 0;
  let batches = 0;
  let drained = false;
  const deadline = Date.now() + BUDGET_MS;

  for (let i = 0; i < MAX_BATCHES; i++) {
    const r = await runSubscriptionExpiryBatch();
    batches++;
    processed += r.processed;
    renewed += r.renewed;
    expired += r.expired;
    if (r.processed < BATCH) {
      drained = true;
      break;
    }
    if (Date.now() >= deadline) break;
  }
  return { processed, renewed, expired, batches, drained };
}
