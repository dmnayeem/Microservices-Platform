import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency, isDuplicateLedgerError } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { PaymentMethod, type Package } from "@/generated/prisma/client";
import { getPointsPerUsd } from "@/lib/economy";
import { lt, toNum, type MoneyInput } from "@/lib/money";
import { ownMediaKey } from "@/lib/media-url";
import { requireActiveUser } from "@/lib/require-active";
import { getConfiguredProviders } from "@/lib/payments";
import {
  PLAN_DURATION_DAYS,
  isFreePlan,
  planPriceUsd,
  proRateCreditUsd,
  roundCents,
  type PlanDuration,
} from "@/lib/plan-pricing";

const schema = z.object({
  packageId: z.string().min(1),
  duration: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "LIFETIME"]),
  method: z.enum(["POINTS", "CASH", "CARD", "BKASH", "NAGAD", "BINANCE", "BITGET"]),
  // Off-platform only: the payment's transaction id and a screenshot uploaded
  // with the proof uploader (an own key under task-proofs/<userId>/).
  transactionId: z.string().trim().max(120).optional(),
  proofUrl: z.string().trim().max(2000).optional(),
});

const OFF_PLATFORM = ["CARD", "BKASH", "NAGAD", "BINANCE", "BITGET"] as const;
const isOffPlatformMethod = (m: string) => (OFF_PLATFORM as readonly string[]).includes(m);

const DAY_MS = 86_400_000;

/** Card has no checkout of its own — offered only while a payment gateway is configured. */
async function cardAvailable(): Promise<boolean> {
  const providers = await getConfiguredProviders().catch(() => []);
  return providers.length > 0;
}

type PkgRow = Package;

interface UserSnap {
  cashBalance: MoneyInput;
  pointsBalance: number;
  packageId: string | null;
  packageExpiresAt: Date | null;
}

/**
 * What this purchase costs and what it does — the ONE computation behind both
 * the quote (GET) and the charge (POST).
 *
 *   • Same plan, still active  → extend from the current expiry.
 *   • Different plan, active   → start NOW (a cheaper plan never extends a
 *     dearer one), and — for wallet payments — the unused value of the current
 *     term is credited against the new price (see proRateCreditUsd).
 *   • No active plan           → start now.
 *
 * Off-platform requests get no credit: they are activated later by an admin,
 * by which time the current term has moved on.
 */
async function computeQuote(
  userId: string,
  pkg: PkgRow,
  duration: PlanDuration,
  method: string,
  user: UserSnap,
  now: Date
) {
  const priceUsd = planPriceUsd(
    { priceMonthly: toNum(pkg.priceMonthly), priceYearly: pkg.priceYearly == null ? null : toNum(pkg.priceYearly) },
    duration
  );
  if (priceUsd == null) return { error: "This plan isn't sold for that duration." as const };

  const hasPlan = !!user.packageId;
  const active =
    hasPlan && (user.packageExpiresAt == null || user.packageExpiresAt.getTime() > now.getTime());
  const samePlan = active && user.packageId === pkg.id;
  if (samePlan && user.packageExpiresAt == null) {
    return { error: "You already have this plan with no expiry date." as const };
  }

  let creditUsd = 0;
  let replacingSubId: string | null = null;
  if (active && !samePlan && !isOffPlatformMethod(method) && user.packageExpiresAt) {
    const current = await prisma.subscription.findFirst({
      where: { userId, packageId: user.packageId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, amount: true, startDate: true, endDate: true },
    });
    if (current) {
      replacingSubId = current.id;
      const termEnd =
        current.endDate.getTime() < user.packageExpiresAt.getTime()
          ? current.endDate
          : user.packageExpiresAt;
      creditUsd = proRateCreditUsd({
        paidUsd: toNum(current.amount),
        termStart: current.startDate,
        termEnd,
        now,
        capUsd: priceUsd,
      });
    }
  }

  const payUsd = roundCents(Math.max(0, priceUsd - creditUsd));
  const base =
    samePlan && user.packageExpiresAt && user.packageExpiresAt.getTime() > now.getTime()
      ? user.packageExpiresAt
      : now;
  const endDate = new Date(base.getTime() + PLAN_DURATION_DAYS[duration] * DAY_MS);
  return {
    priceUsd,
    creditUsd,
    payUsd,
    samePlan,
    switching: active && !samePlan,
    replacingSubId,
    termStart: base,
    endDate,
  };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * End every active subscription row of this user now: a still-running term is
 * cut to `now` (it was replaced), and auto-renew is switched off so the
 * renewal sweep never charges for a plan the user moved away from.
 */
async function endActiveTerms(tx: Tx, userId: string, now: Date) {
  await tx.subscription.updateMany({
    where: { userId, isActive: true, endDate: { gt: now } },
    data: { endDate: now },
  });
  await tx.subscription.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false, autoRenew: false },
  });
}

async function loadUser(userId: string): Promise<UserSnap | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { cashBalance: true, pointsBalance: true, packageId: true, packageExpiresAt: true },
  });
}

// GET /api/packages/purchase?packageId=&duration=&method= — the quote the
// checkout shows: price, credit for the plan being replaced, what is charged.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const duration = (sp.get("duration") ?? "MONTHLY") as PlanDuration;
  if (!(duration in PLAN_DURATION_DAYS)) {
    return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
  }
  const method = sp.get("method") ?? "CASH";
  const packageId = sp.get("packageId") ?? "";
  const [pkg, user, pointsPerUsd, card] = await Promise.all([
    packageId ? prisma.package.findUnique({ where: { id: packageId } }) : null,
    loadUser(session.user.id),
    getPointsPerUsd(),
    cardAvailable(),
  ]);
  if (!pkg || !user) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }
  const q = await computeQuote(session.user.id, pkg, duration, method, user, new Date());
  if ("error" in q) return NextResponse.json({ error: q.error, cardAvailable: card }, { status: 400 });
  return NextResponse.json({
    priceUsd: q.priceUsd,
    creditUsd: q.creditUsd,
    payUsd: q.payUsd,
    payPoints: Math.ceil(q.payUsd * pointsPerUsd),
    samePlan: q.samePlan,
    switching: q.switching,
    endDate: q.endDate.toISOString(),
    cardAvailable: card,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const active = await requireActiveUser(session.user.id);
  if (!active.ok) {
    return NextResponse.json({ error: active.message }, { status: active.httpStatus });
  }
  return withIdempotency(request, session.user.id, async () => {
  const body = await request.json().catch(() => ({}));
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const userId = session.user.id;
  const pkg = await prisma.package.findUnique({
    where: { id: v.data.packageId },
  });
  if (!pkg) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }
  // A draft (isActive = false) is not for sale. The plans page already hid
  // it, but this route never checked, so its id alone was enough to buy it.
  // Someone already on the plan may still renew it.
  if (!pkg.isActive) {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { packageId: true } });
    if (me?.packageId !== pkg.id) {
      return NextResponse.json({ error: "This plan is not available." }, { status: 404 });
    }
  }

  const user = await loadUser(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const now = new Date();
  // Every write below is a compare-and-set on the plan state read HERE: if a
  // concurrent purchase (double click, second tab, replay with a fresh key)
  // changed it first, this one charges nothing and returns 409.
  const casWhere = {
    id: userId,
    packageId: user.packageId,
    packageExpiresAt: user.packageExpiresAt,
  };

  // Free plan (nothing to pay for any duration — one definition, shared with
  // the plans page via lib/plan-pricing): activate directly — no charge, no
  // payment step, no admin verification, no referral bonus.
  const free = isFreePlan({
    priceMonthly: toNum(pkg.priceMonthly),
    priceYearly: pkg.priceYearly == null ? null : toNum(pkg.priceYearly),
  });
  if (free) {
    const freeExpiry =
      pkg.validityDays && pkg.validityDays > 0
        ? new Date(now.getTime() + pkg.validityDays * DAY_MS)
        : null; // null = permanent (free plans usually never expire)
    // Subscription.endDate is non-null; for a permanent free plan use a far-future
    // sentinel — real access is governed by User.packageExpiresAt (null = forever).
    const subEnd = freeExpiry ?? new Date(now.getTime() + PLAN_DURATION_DAYS.LIFETIME * DAY_MS);
    try {
      await prisma.$transaction(async (tx) => {
        const cas = await tx.user.updateMany({
          where: casWhere,
          data: { packageId: pkg.id, packageExpiresAt: freeExpiry },
        });
        if (cas.count === 0) throw new Error("CONFLICT");
        // Leaving a plan ends its term now and stops its auto-renew, or the
        // renewal sweep would later charge for a plan the user left.
        await endActiveTerms(tx, userId, now);
        const subscription = await tx.subscription.create({
          data: {
            userId,
            packageId: pkg.id,
            startDate: now,
            endDate: subEnd,
            amount: 0,
            isActive: true,
            autoRenew: false,
          },
          select: { id: true },
        });
        await tx.transaction.create({
          data: {
            userId,
            type: "PURCHASE",
            status: "COMPLETED",
            amount: 0,
            points: 0,
            description: `${pkg.name} plan activated`,
            reference: `subscription_${subscription.id}`,
          },
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === "CONFLICT") {
        return NextResponse.json(
          { error: "Your plan changed while this was processing. Refresh and try again." },
          { status: 409 }
        );
      }
      throw err;
    }
    return NextResponse.json({
      success: true,
      activated: true,
      expiresAt: freeExpiry ? freeExpiry.toISOString() : null,
      checkoutUrl: null,
      message: `${pkg.name} activated`,
    });
  }

  const method = v.data.method;
  const isOffPlatform = isOffPlatformMethod(method);
  if (method === "CARD" && !(await cardAvailable())) {
    return NextResponse.json(
      { error: "Card payments aren't available right now. Pay with your wallet balance instead." },
      { status: 400 }
    );
  }

  // Off-platform: an admin verifies the payment, so it needs something to
  // verify — the transaction id and a screenshot uploaded with our uploader.
  const transactionId = v.data.transactionId?.trim() || null;
  const proofUrl = v.data.proofUrl?.trim() || null;
  if (isOffPlatform) {
    if (!transactionId || transactionId.length < 4) {
      return NextResponse.json(
        { error: "Enter the transaction ID of your payment." },
        { status: 400 }
      );
    }
    if (!proofUrl || !(ownMediaKey(proofUrl) ?? "").startsWith(`task-proofs/${userId}/`)) {
      return NextResponse.json(
        { error: "Upload a screenshot of your payment with the uploader on this page." },
        { status: 400 }
      );
    }
  }

  const q = await computeQuote(userId, pkg, v.data.duration, method, user, now);
  if ("error" in q) {
    return NextResponse.json({ error: q.error }, { status: 400 });
  }
  const { priceUsd, creditUsd, payUsd, samePlan, termStart, endDate } = q;
  const pointsPerUsd = await getPointsPerUsd();
  const totalPoints = Math.ceil(payUsd * pointsPerUsd);

  // Validate funds for non-redirect methods
  if (method === "CASH") {
    if (lt(user.cashBalance, payUsd)) {
      return NextResponse.json(
        {
          error: "Insufficient cash balance",
          details: `Need ${usd(payUsd)}, have ${usd(toNum(user.cashBalance))}`,
        },
        { status: 400 }
      );
    }
  } else if (method === "POINTS") {
    if (user.pointsBalance < totalPoints) {
      return NextResponse.json(
        {
          error: "Insufficient points",
          details: `Need ${totalPoints} pts, have ${user.pointsBalance} pts`,
        },
        { status: 400 }
      );
    }
  }

  // The ledger reference is derived from the plan state being replaced, so a
  // duplicate of the same purchase collides on @@unique([userId, reference])
  // even if it somehow got past the compare-and-set. With no prior expiry
  // there is nothing stable to derive it from; the CAS + row lock cover that.
  const onPlatformRef = (subId: string) =>
    user.packageExpiresAt
      ? `subscription_from_${user.packageExpiresAt.getTime()}`
      : `subscription_${subId}`;

  let activatedSubscriptionId: string | null = null;
  let activatedAmount = 0;
  try {
    await prisma.$transaction(async (tx) => {
      // Serialise this user's plan purchases: the pending-request check and
      // the plan CAS below then cannot interleave with a concurrent request.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      if (isOffPlatform) {
        // Don't let a user stack multiple off-platform (admin-verified)
        // requests. "Pending" is the PENDING ledger row written with the
        // request. Checked under the row lock, so two concurrent requests
        // can no longer both pass it.
        const pending = await tx.transaction.findFirst({
          where: { userId, status: "PENDING", reference: { startsWith: "subscription_" } },
          select: { id: true },
        });
        if (pending) throw new Error("PENDING_EXISTS");
      } else {
        const cas = await tx.user.updateMany({
          where: casWhere,
          data: { packageId: pkg.id, packageExpiresAt: endDate },
        });
        if (cas.count === 0) throw new Error("CONFLICT");
        // Debits use an atomic CAS (`balance >= amount`) so a concurrent
        // double-submit can't overspend (the pre-checks above are check-then-act).
        if (method === "CASH" && payUsd > 0) {
          const debit = await tx.user.updateMany({
            where: { id: userId, cashBalance: { gte: payUsd } },
            data: { cashBalance: { decrement: payUsd } },
          });
          if (debit.count === 0) throw new Error("INSUFFICIENT");
        } else if (method === "POINTS" && totalPoints > 0) {
          const debit = await tx.user.updateMany({
            where: { id: userId, pointsBalance: { gte: totalPoints } },
            data: { pointsBalance: { decrement: totalPoints } },
          });
          if (debit.count === 0) throw new Error("INSUFFICIENT");
        }
      }

      // Carry the user's auto-renew choice over when extending the same plan.
      const carriedAutoRenew =
        !isOffPlatform && samePlan
          ? !!(await tx.subscription.findFirst({
              where: { userId, packageId: pkg.id, isActive: true, autoRenew: true },
              select: { id: true },
            }))
          : false;

      if (!isOffPlatform) {
        // The new row replaces every other active one: end their terms now and
        // stop their auto-renew, or the renewal sweep would later charge for a
        // plan that was extended or switched away from.
        await endActiveTerms(tx, userId, now);
      }

      const subscription = await tx.subscription.create({
        data: {
          userId,
          packageId: pkg.id,
          // A same-plan extension's term starts where the current one ends,
          // so every row spans exactly one bought term (the renewal sweep
          // reads the length to know which duration to renew).
          startDate: isOffPlatform ? now : termStart,
          endDate,
          // What was actually paid (after any credit). Revenue sums this.
          amount: isOffPlatform ? priceUsd : payUsd,
          paymentMethod:
            method === "BKASH"
              ? PaymentMethod.BKASH
              : method === "NAGAD"
                ? PaymentMethod.NAGAD
                : method === "BINANCE"
                  ? PaymentMethod.BINANCE
                  : method === "BITGET"
                    ? PaymentMethod.BITGET
                  : null,
          transactionId: isOffPlatform ? transactionId : null,
          proofUrl: isOffPlatform ? proofUrl : null,
          isActive: !isOffPlatform,
          autoRenew: carriedAutoRenew,
        },
        select: { id: true },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: "PURCHASE",
          status: isOffPlatform ? "PENDING" : "COMPLETED",
          amount: isOffPlatform ? priceUsd : payUsd,
          points: method === "POINTS" ? totalPoints : 0,
          description:
            `${pkg.name} subscription (${v.data.duration})` +
            (creditUsd > 0 ? ` — ${usd(creditUsd)} credit from your previous plan` : ""),
          reference: isOffPlatform ? `subscription_${subscription.id}` : onPlatformRef(subscription.id),
          metadata: {
            subscriptionId: subscription.id,
            packageId: pkg.id,
            duration: v.data.duration,
            method,
            priceUsd,
            creditUsd,
            payUsd: isOffPlatform ? priceUsd : payUsd,
            ...(isOffPlatform ? { transactionId, proofUrl } : {}),
          },
        },
      });

      // Only an immediately-activated (on-platform) purchase triggers the
      // referrer bonus; off-platform stays pending admin verification.
      if (!isOffPlatform) {
        activatedSubscriptionId = subscription.id;
        activatedAmount = payUsd;
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400 }
      );
    }
    if (err instanceof Error && err.message === "PENDING_EXISTS") {
      return NextResponse.json(
        { error: "You already have a pending subscription request awaiting verification." },
        { status: 400 }
      );
    }
    if ((err instanceof Error && err.message === "CONFLICT") || isDuplicateLedgerError(err)) {
      return NextResponse.json(
        { error: "Your plan changed while this was processing. Refresh and try again." },
        { status: 409 }
      );
    }
    throw err;
  }

  // Referral subscription bonus — pay the referrer when their invitee first
  // pays for a plan. Never for $0. Best-effort; once per invitee.
  if (activatedSubscriptionId && activatedAmount > 0) {
    try {
      const { awardReferralSubscriptionBonus } = await import(
        "@/lib/referral-bonus"
      );
      await awardReferralSubscriptionBonus(userId, activatedSubscriptionId);
    } catch {
      /* never block the purchase on the bonus */
    }
  }

  return NextResponse.json({
    success: true,
    activated: !isOffPlatform,
    expiresAt: endDate.toISOString(),
    chargedUsd: isOffPlatform ? priceUsd : payUsd,
    creditUsd,
    checkoutUrl: null, // No redirect — admin verification required for off-platform methods
    message: isOffPlatform
      ? "Order created. Admin will verify and activate your subscription shortly."
      : `${pkg.name} activated until ${endDate.toLocaleDateString()}`,
  });
  });
}
