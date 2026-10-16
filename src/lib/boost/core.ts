import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getSetting } from "@/lib/system-settings";
import { payPlatform, refundPlatform, getAdPointsPerUsd, InsufficientBalanceError } from "@/lib/ad-wallet";
import type { LedgerDb } from "@/lib/ledger";
import {
  BOOST_PRICING_KEY,
  boostEventPrice,
  normalizeBoostPricing,
  type BoostEventKind,
  type BoostPricing,
} from "@/lib/boost/pricing";

/**
 * Boosting a feed post (owner, 2026-10-16) — the money side, in one place.
 *
 *   create  → the whole budget is HELD from Ad Points or Ad Fund (payPlatform)
 *             and the boost waits for an admin (PENDING), unless review is off.
 *   approve → ACTIVE for `durationDays`.
 *   reject / cancel / end / budget used up / post deleted
 *           → `settle`: one compare-and-set to the final status, then the
 *             unspent part goes back to where it came from (refundPlatform).
 *   charge  → each counted event costs the admin's price for the viewer's
 *             country, taken from the held budget by ONE conditional UPDATE
 *             (status ACTIVE, not ended, budget left) — two events can never
 *             overspend, and nothing is charged after `settle` won the row.
 *
 * Money only moves through ad-wallet.ts. The refund is computed AFTER the
 * status CAS, inside the same transaction, from the row the CAS locked — so a
 * charge that committed first is counted, and one that comes later fails its
 * status check. `refundedPoints` makes a second settle a no-op.
 */

export type BoostStatus = "PENDING" | "ACTIVE" | "PAUSED" | "REJECTED" | "COMPLETED" | "CANCELLED";
export const BOOST_OPEN: BoostStatus[] = ["PENDING", "ACTIVE", "PAUSED"];

export async function getBoostPricing(): Promise<BoostPricing> {
  return normalizeBoostPricing(await getSetting<unknown>(BOOST_PRICING_KEY, null).catch(() => null));
}

const DAY = 24 * 3_600_000;

export type CreateBoostInput = {
  userId: string;
  postId: string;
  budgetPoints: number;
  durationDays: number;
  /** Ad-targeting shape (src/lib/ad-targeting.ts); null = everyone. */
  targeting: unknown;
  payFrom: "AD_POINTS" | "AD_FUND";
};

export async function createBoost(
  input: CreateBoostInput
): Promise<{ ok: true; id: string; status: BoostStatus } | { ok: false; error: string; status: number }> {
  const pricing = await getBoostPricing();
  const budget = Math.floor(input.budgetPoints);
  const days = Math.floor(input.durationDays);
  if (!(budget >= pricing.minBudget)) return { ok: false, error: `The smallest budget is ${pricing.minBudget} Ad Points.`, status: 400 };
  if (!(days >= 1 && days <= pricing.maxDays)) return { ok: false, error: `Choose 1 to ${pricing.maxDays} days.`, status: 400 };

  const post = await prisma.post.findUnique({
    where: { id: input.postId },
    select: { userId: true, isPublic: true, isHidden: true },
  });
  if (!post || post.userId !== input.userId) return { ok: false, error: "You can only boost your own post.", status: 403 };
  if (!post.isPublic || post.isHidden) return { ok: false, error: "Only a public, visible post can be boosted.", status: 400 };

  const open = await prisma.boostCampaign.count({ where: { postId: input.postId, status: { in: BOOST_OPEN } } });
  if (open > 0) return { ok: false, error: "This post already has a boost running or waiting for review.", status: 409 };

  const rate = await getAdPointsPerUsd();
  const live = !pricing.requireReview;
  try {
    const id = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const c = await tx.boostCampaign.create({
        data: {
          postId: input.postId,
          userId: input.userId,
          status: live ? "ACTIVE" : "PENDING",
          paidWith: input.payFrom,
          rate,
          budgetPoints: budget,
          targeting: (input.targeting ?? undefined) as Prisma.InputJsonValue | undefined,
          durationDays: days,
          ...(live ? { startsAt: now, endsAt: new Date(now.getTime() + days * DAY) } : {}),
        },
        select: { id: true },
      });
      await payPlatform(tx, {
        userId: input.userId,
        adPoints: budget,
        from: input.payFrom,
        reference: `boost_hold_${c.id}`,
        description: `Boost budget held — ${budget.toLocaleString()} Ad Points`,
        purpose: "boost",
        metadata: { boostId: c.id, postId: input.postId },
      });
      return c.id;
    });
    return { ok: true, id, status: live ? "ACTIVE" : "PENDING" };
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      return {
        ok: false,
        error: e.balance === "AD_POINTS" ? "Not enough Ad Points for this budget." : "Not enough Ad Fund for this budget.",
        status: 402,
      };
    }
    throw e;
  }
}

/**
 * Move a boost to a final (or paused) status and refund what was not spent.
 * Returns false when the boost was not in one of `from` (someone else won).
 */
async function settle(
  tx: LedgerDb,
  id: string,
  from: BoostStatus[],
  to: Extract<BoostStatus, "REJECTED" | "COMPLETED" | "CANCELLED">,
  extra: Prisma.BoostCampaignUpdateManyMutationInput = {}
): Promise<boolean> {
  const won = await tx.boostCampaign.updateMany({ where: { id, status: { in: from } }, data: { status: to, ...extra } });
  if (won.count === 0) return false;
  const c = await tx.boostCampaign.findUnique({
    where: { id },
    select: { userId: true, budgetPoints: true, spentPoints: true, refundedPoints: true, paidWith: true, rate: true, postId: true },
  });
  if (!c) return true;
  const back = c.budgetPoints - c.spentPoints - c.refundedPoints;
  if (back > 0) {
    await tx.boostCampaign.update({ where: { id }, data: { refundedPoints: { increment: back } } });
    await refundPlatform(tx, {
      userId: c.userId,
      adPoints: back,
      to: c.paidWith === "AD_FUND" ? "AD_FUND" : "AD_POINTS",
      rate: c.rate,
      reference: `boost_refund_${id}`,
      description: `Boost ${to.toLowerCase()} — ${back.toLocaleString()} unspent Ad Points returned`,
      purpose: "refund:boost",
      metadata: { boostId: id, postId: c.postId, status: to },
    });
  }
  return true;
}

export async function approveBoost(id: string, adminId: string): Promise<boolean> {
  const c = await prisma.boostCampaign.findUnique({ where: { id }, select: { durationDays: true, postId: true } });
  if (!c?.postId) return false;
  const now = new Date();
  const r = await prisma.boostCampaign.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: "ACTIVE",
      startsAt: now,
      endsAt: new Date(now.getTime() + c.durationDays * DAY),
      reviewedById: adminId,
      reviewedAt: now,
      rejectReason: null,
    },
  });
  return r.count === 1;
}

export async function rejectBoost(id: string, adminId: string, reason: string): Promise<boolean> {
  return prisma.$transaction((tx) =>
    settle(tx, id, ["PENDING", "ACTIVE", "PAUSED"], "REJECTED", {
      rejectReason: reason.slice(0, 500),
      reviewedById: adminId,
      reviewedAt: new Date(),
    })
  );
}

/** The owner stops it (or an admin on their behalf). */
export async function cancelBoost(id: string, userId: string | null): Promise<boolean> {
  if (userId) {
    const c = await prisma.boostCampaign.findUnique({ where: { id }, select: { userId: true } });
    if (!c || c.userId !== userId) return false;
  }
  return prisma.$transaction((tx) => settle(tx, id, ["PENDING", "ACTIVE", "PAUSED"], "CANCELLED"));
}

/** Pause / resume an ACTIVE boost (admin). No money moves. */
export async function setBoostPaused(id: string, paused: boolean): Promise<boolean> {
  const r = await prisma.boostCampaign.updateMany({
    where: { id, status: paused ? "ACTIVE" : "PAUSED" },
    data: { status: paused ? "PAUSED" : "ACTIVE" },
  });
  return r.count === 1;
}

const COUNTER: Record<BoostEventKind, string> = {
  IMPRESSION: "impressions",
  VIEW: "views",
  CLICK: "clicks",
  LIKE: "likes",
  COMMENT: "comments",
  SHARE: "shares",
};

/**
 * Count and charge one event on a boost. Idempotent per viewer: IMPRESSION and
 * VIEW once per viewer per day, everything else once per viewer per boost. The
 * boost owner's own activity is never charged. Returns what happened.
 */
export async function chargeBoostEvent(opts: {
  campaignId: string;
  viewerId: string;
  kind: BoostEventKind;
  country: string | null;
}): Promise<"charged" | "duplicate" | "not_charged" | "inactive" | "exhausted"> {
  const pricing = await getBoostPricing();
  const price = boostEventPrice(pricing, opts.kind, opts.country);
  if (price === null) return "not_charged";
  const c = await prisma.boostCampaign.findUnique({
    where: { id: opts.campaignId },
    select: { userId: true, status: true },
  });
  if (!c || c.status !== "ACTIVE") return "inactive";
  if (c.userId === opts.viewerId) return "not_charged";

  const day = new Date().toISOString().slice(0, 10);
  const perDay = opts.kind === "IMPRESSION" || opts.kind === "VIEW";
  const dedupeKey = `${opts.campaignId}:${opts.viewerId}:${opts.kind}${perDay ? `:${day}` : ""}`;
  const col = Prisma.raw(`"${COUNTER[opts.kind]}"`);

  try {
    const res = await prisma.$transaction(async (tx) => {
      await tx.boostEvent.create({
        data: {
          campaignId: opts.campaignId,
          viewerId: opts.viewerId,
          kind: opts.kind,
          country: opts.country,
          costPoints: price,
          dedupeKey,
        },
      });
      const n = await tx.$executeRaw`
        UPDATE "BoostCampaign"
        SET "spentPoints" = "spentPoints" + ${price}, ${col} = ${col} + 1, "updatedAt" = NOW()
        WHERE id = ${opts.campaignId} AND status = 'ACTIVE'
          AND ("endsAt" IS NULL OR "endsAt" > NOW())
          AND "spentPoints" + ${price} <= "budgetPoints" - "refundedPoints"`;
      if (n !== 1) throw new Error("NO_BUDGET");
      return "charged" as const;
    });
    return res;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "duplicate";
    if (e instanceof Error && e.message === "NO_BUDGET") {
      // Out of budget (or ended): close it and return the remainder.
      await prisma.$transaction((tx) => settle(tx, opts.campaignId, ["ACTIVE", "PAUSED"], "COMPLETED"));
      return "exhausted";
    }
    throw e;
  }
}

/**
 * Scheduler sweep: end boosts whose time is up, and close (refunding) boosts
 * whose post was deleted. Safe to run any number of times.
 */
export async function sweepBoosts(): Promise<{ completed: number; orphaned: number }> {
  const now = new Date();
  const ended = await prisma.boostCampaign.findMany({
    where: { status: { in: ["ACTIVE", "PAUSED"] }, endsAt: { lt: now } },
    select: { id: true },
    take: 500,
  });
  let completed = 0;
  for (const b of ended) {
    if (await prisma.$transaction((tx) => settle(tx, b.id, ["ACTIVE", "PAUSED"], "COMPLETED"))) completed++;
  }
  const orphans = await prisma.boostCampaign.findMany({
    where: { status: { in: BOOST_OPEN }, postId: null },
    select: { id: true },
    take: 500,
  });
  let orphaned = 0;
  for (const b of orphans) {
    if (await prisma.$transaction((tx) => settle(tx, b.id, BOOST_OPEN, "CANCELLED"))) orphaned++;
  }
  return { completed, orphaned };
}

/** Call before hiding / making private / deleting a post: closes its boosts with a refund. */
export async function cancelBoostsForPost(postId: string): Promise<number> {
  const open = await prisma.boostCampaign.findMany({ where: { postId, status: { in: BOOST_OPEN } }, select: { id: true } });
  let n = 0;
  for (const b of open) if (await prisma.$transaction((tx) => settle(tx, b.id, BOOST_OPEN, "CANCELLED"))) n++;
  return n;
}
