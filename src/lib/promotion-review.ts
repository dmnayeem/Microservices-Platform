import "server-only";
import { NotificationType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { chargePlatform, refundPlatformPayment, type FoundPayment } from "@/lib/platform-pay";
import type { PaySource, PlatformQuote } from "@/lib/pay-source";
import type { PromoPackage } from "@/lib/promotion";
import { usd } from "@/lib/utils";

/**
 * Members' paid course / listing promotions go through admin review
 * (owner, 2026-10-17): "admin approves → it runs; admin rejects → the member is
 * told with the reason". The money and status side, in one place.
 *
 *   request → a PENDING `PromotionRequest` and the payment (Ad Points | Ad
 *             Fund, ledger reference `promo_course_<id>` /
 *             `promo_marketplace_<id>`) in ONE transaction. Nothing is featured
 *             yet. With `promotions.require_review` off, it is approved at once
 *             through the same `approvePromotion` an admin uses.
 *   approve → CAS PENDING → APPROVED, then the item is featured. The clock
 *             starts NOW (or where an existing feature ends), never at payment.
 *   reject / withdrawn item
 *           → CAS PENDING → REJECTED | CANCELLED, then the payment is given back
 *             in full to the balance it came from, in the same transaction.
 *             Only the caller that won the CAS refunds, and the refund
 *             reference is unique per member as a backstop — never twice.
 */

export const PROMOTION_REVIEW_KEY = "promotions.require_review";

export type PromotionKind = "COURSE" | "LISTING";
export type PromotionStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

const DAY = 86_400_000;

export async function promotionReviewRequired(): Promise<boolean> {
  return (await getSetting<unknown>(PROMOTION_REVIEW_KEY, true)) !== false;
}

/** The ledger reference (without its adpts_/adfund_ prefix) of a request's payment. */
export function promotionPayReference(kind: string, requestId: string): string {
  return `${kind === "COURSE" ? "promo_course" : "promo_marketplace"}_${requestId}`;
}

export function promotionItemLink(kind: string, itemId: string | null): string {
  if (!itemId) return kind === "COURSE" ? "/tutor/courses" : "/marketplace";
  return kind === "COURSE" ? `/courses/${itemId}` : `/marketplace/${itemId}`;
}

function itemNoun(kind: string): string {
  return kind === "COURSE" ? "course" : "listing";
}

function refundText(p: FoundPayment | null): string {
  if (!p) return "";
  return p.from === "AD_FUND"
    ? ` ${usd(p.usd)} was returned to your Ad Fund.`
    : ` ${p.adPoints.toLocaleString()} Ad Points were returned to you.`;
}

// ── create ────────────────────────────────────────────────────────────────────

export type RequestPromotionResult = {
  id: string;
  status: PromotionStatus;
  featuredUntil: Date | null;
};

/**
 * Create the request and take the payment. Throws PlatformPayError (from
 * chargePlatform) when the chosen balance is short — nothing is written then.
 */
export async function requestPromotion(opts: {
  kind: PromotionKind;
  itemId: string;
  itemTitle: string;
  userId: string;
  pkg: PromoPackage;
  quote: PlatformQuote;
  from: PaySource;
  returnTo: string;
}): Promise<RequestPromotionResult> {
  const review = await promotionReviewRequired();
  const id = await prisma.$transaction(async (tx) => {
    const r = await tx.promotionRequest.create({
      data: {
        kind: opts.kind,
        courseId: opts.kind === "COURSE" ? opts.itemId : null,
        listingId: opts.kind === "LISTING" ? opts.itemId : null,
        userId: opts.userId,
        packageId: opts.pkg.id,
        packageLabel: opts.pkg.label,
        days: opts.pkg.days,
        itemTitle: opts.itemTitle.slice(0, 200),
      },
      select: { id: true },
    });
    // CAS debit + its ledger row; a short balance throws and rolls the
    // request back with it.
    await chargePlatform(tx, {
      userId: opts.userId,
      quote: opts.quote,
      from: opts.from,
      description: `Promotion — ${opts.pkg.label} · "${opts.itemTitle}"`,
      reference: promotionPayReference(opts.kind, r.id),
      purpose: "promotion",
      metadata: {
        promotionRequestId: r.id,
        ...(opts.kind === "COURSE" ? { courseId: opts.itemId } : { listingId: opts.itemId }),
        packageId: opts.pkg.id,
        days: opts.pkg.days,
      },
      returnTo: opts.returnTo,
    });
    return r.id;
  });

  await writeAudit({
    actorId: opts.userId,
    action: "PROMOTION_REQUESTED",
    entity: "PromotionRequest",
    entityId: id,
    targetUserId: opts.userId,
    summary: `Paid to promote the ${itemNoun(opts.kind)} "${opts.itemTitle}" (${opts.pkg.label})${
      review ? " — waiting for review" : ""
    }`,
    meta: { kind: opts.kind, itemId: opts.itemId, packageId: opts.pkg.id, days: opts.pkg.days, paidWith: opts.from },
  }).catch(() => {});

  if (!review) {
    const r = await approvePromotion(id, null);
    if (r.ok) return { id, status: "APPROVED", featuredUntil: r.endsAt };
    return { id, status: r.code === "WITHDRAWN" ? "CANCELLED" : "PENDING", featuredUntil: null };
  }
  return { id, status: "PENDING", featuredUntil: null };
}

// ── decisions ─────────────────────────────────────────────────────────────────

export type ApproveResult =
  | { ok: true; endsAt: Date }
  | { ok: false; code: "NOT_FOUND" | "CHANGED" | "WITHDRAWN"; refund?: FoundPayment | null };

/**
 * Approve a PENDING request and feature the item from now. `actorId` null =
 * approved automatically (review switched off). An item that is no longer
 * published / active is not featured: the request is cancelled and refunded.
 */
export async function approvePromotion(id: string, actorId: string | null): Promise<ApproveResult> {
  const now = new Date();
  const out = await prisma.$transaction(async (tx): Promise<ApproveResult | { ok: false; code: "WITHDRAWN_PENDING" }> => {
    const r = await tx.promotionRequest.findUnique({
      where: { id },
      select: { status: true, kind: true, courseId: true, listingId: true, days: true },
    });
    if (!r) return { ok: false, code: "NOT_FOUND" };
    if (r.status !== "PENDING") return { ok: false, code: "CHANGED" };

    const item =
      r.kind === "COURSE"
        ? r.courseId
          ? await tx.course.findUnique({ where: { id: r.courseId }, select: { status: true, featuredUntil: true } })
          : null
        : r.listingId
          ? await tx.marketplaceListing.findUnique({ where: { id: r.listingId }, select: { status: true, featuredUntil: true } })
          : null;
    const eligible = !!item && item.status === (r.kind === "COURSE" ? "PUBLISHED" : "ACTIVE");
    if (!eligible) return { ok: false, code: "WITHDRAWN_PENDING" };

    // Stack on a feature that is still running, else start now.
    const base = item.featuredUntil && item.featuredUntil.getTime() > now.getTime() ? item.featuredUntil : now;
    const endsAt = new Date(base.getTime() + r.days * DAY);

    const won = await tx.promotionRequest.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewedById: actorId,
        reviewedAt: now,
        rejectReason: null,
        startsAt: base,
        endsAt,
      },
    });
    if (won.count !== 1) return { ok: false, code: "CHANGED" };

    if (r.kind === "COURSE") {
      await tx.course.update({ where: { id: r.courseId! }, data: { isFeatured: true, featuredUntil: endsAt } });
    } else {
      await tx.marketplaceListing.update({ where: { id: r.listingId! }, data: { isFeatured: true, featuredUntil: endsAt } });
    }
    return { ok: true, endsAt };
  });

  if (!out.ok && out.code === "WITHDRAWN_PENDING") {
    const c = await cancelPromotion(id, actorId, "it is no longer available");
    return { ok: false, code: "WITHDRAWN", refund: c?.refund ?? null };
  }
  if (!out.ok) return out as ApproveResult;

  const req = await prisma.promotionRequest.findUnique({
    where: { id },
    select: { userId: true, kind: true, courseId: true, listingId: true, itemTitle: true, packageLabel: true, days: true },
  });
  if (req) {
    const itemId = req.kind === "COURSE" ? req.courseId : req.listingId;
    await notifyUser({
      userId: req.userId,
      type: NotificationType.PROMOTION,
      title: "Your promotion is live",
      message: `"${req.itemTitle}" was approved and is featured until ${out.endsAt.toUTCString()}.`,
      link: promotionItemLink(req.kind, itemId),
      data: { promotionRequestId: id },
    }).catch(() => {});
    await writeAudit({
      actorId,
      action: actorId ? "PROMOTION_APPROVED" : "PROMOTION_AUTO_APPROVED",
      entity: "PromotionRequest",
      entityId: id,
      targetUserId: req.userId,
      summary: `${actorId ? "Approved" : "Auto-approved (review is off)"} the promotion of the ${itemNoun(req.kind)} "${
        req.itemTitle
      }" (${req.packageLabel}) — featured until ${out.endsAt.toISOString()}`,
      meta: { kind: req.kind, itemId, days: req.days, endsAt: out.endsAt.toISOString() },
    }).catch(() => {});
  }
  return out;
}

/**
 * PENDING → `to`, then the payment back in full, in one transaction. Null when
 * the request was not PENDING (someone else decided first) — nothing refunded.
 */
async function settleWithRefund(
  id: string,
  to: "REJECTED" | "CANCELLED",
  actorId: string | null,
  reason: string
): Promise<{ refund: FoundPayment | null; userId: string; kind: string; itemId: string | null; itemTitle: string } | null> {
  return prisma.$transaction(async (tx) => {
    const won = await tx.promotionRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: to, rejectReason: reason.slice(0, 500), reviewedById: actorId, reviewedAt: new Date() },
    });
    if (won.count !== 1) return null;
    const r = await tx.promotionRequest.findUnique({
      where: { id },
      select: { userId: true, kind: true, courseId: true, listingId: true, itemTitle: true },
    });
    if (!r) return null;
    const payReference = promotionPayReference(r.kind, id);
    const refund = await refundPlatformPayment(tx, {
      userId: r.userId,
      payReference,
      refundReference: `${payReference}_refund`,
      description: `Promotion ${to === "REJECTED" ? "rejected" : "cancelled"} — refund · "${r.itemTitle}"`,
      purpose: "refund:promotion",
      metadata: { promotionRequestId: id, status: to },
    });
    return {
      refund,
      userId: r.userId,
      kind: r.kind,
      itemId: r.kind === "COURSE" ? r.courseId : r.listingId,
      itemTitle: r.itemTitle,
    };
  });
}

/** Admin rejection. `reason` is shown to the member and is required. */
export async function rejectPromotion(id: string, actorId: string, reason: string) {
  const done = await settleWithRefund(id, "REJECTED", actorId, reason);
  if (!done) return null;
  await notifyUser({
    userId: done.userId,
    type: NotificationType.PROMOTION,
    title: "Your promotion was not approved",
    message: `"${done.itemTitle}" — reason: ${reason}.${refundText(done.refund)}`,
    link: promotionItemLink(done.kind, done.itemId),
    data: { promotionRequestId: id, reason },
  }).catch(() => {});
  await writeAudit({
    actorId,
    action: "PROMOTION_REJECTED",
    entity: "PromotionRequest",
    entityId: id,
    targetUserId: done.userId,
    summary: `Rejected the promotion of the ${itemNoun(done.kind)} "${done.itemTitle}" — ${reason}${
      done.refund ? ` · refunded ${done.refund.from === "AD_FUND" ? usd(done.refund.usd) : `${done.refund.adPoints.toLocaleString()} Ad Points`}` : ""
    }`,
    meta: { kind: done.kind, itemId: done.itemId, reason, refund: done.refund ?? null },
  }).catch(() => {});
  return done;
}

/**
 * The item went away (unpublished, suspended, sold, deleted) before a decision.
 * `why` completes "…was cancelled because <why>".
 */
export async function cancelPromotion(id: string, actorId: string | null, why: string) {
  const reason = `${why.charAt(0).toUpperCase()}${why.slice(1)}.`;
  const done = await settleWithRefund(id, "CANCELLED", actorId, reason);
  if (!done) return null;
  await notifyUser({
    userId: done.userId,
    type: NotificationType.PROMOTION,
    title: "Your promotion was cancelled",
    message: `The promotion of "${done.itemTitle}" was cancelled because ${why}.${refundText(done.refund)}`,
    link: promotionItemLink(done.kind, done.itemId),
    data: { promotionRequestId: id, reason },
  }).catch(() => {});
  await writeAudit({
    actorId,
    action: "PROMOTION_CANCELLED",
    entity: "PromotionRequest",
    entityId: id,
    targetUserId: done.userId,
    summary: `Cancelled the promotion of the ${itemNoun(done.kind)} "${done.itemTitle}" — ${why} (payment refunded)`,
    meta: { kind: done.kind, itemId: done.itemId, refund: done.refund ?? null },
  }).catch(() => {});
  return done;
}

/**
 * Cancel and refund every PENDING request whose course is no longer published
 * or whose listing is no longer active (or was deleted). One sweep instead of a
 * hook in each of the many places an item can leave sale; it runs with the
 * featured-expiry job and whenever the admin queue is opened, and approval
 * re-checks the item itself, so a withdrawn item is never featured.
 */
export async function cancelWithdrawnPromotions(limit = 200): Promise<{ cancelled: number }> {
  const pending = await prisma.promotionRequest.findMany({
    where: { status: "PENDING" },
    select: { id: true, kind: true, courseId: true, listingId: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  if (pending.length === 0) return { cancelled: 0 };

  const courseIds = [...new Set(pending.map((p) => p.courseId).filter((x): x is string => !!x))];
  const listingIds = [...new Set(pending.map((p) => p.listingId).filter((x): x is string => !!x))];
  const [courses, listings] = await Promise.all([
    courseIds.length
      ? prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, status: true } })
      : Promise.resolve([]),
    listingIds.length
      ? prisma.marketplaceListing.findMany({ where: { id: { in: listingIds } }, select: { id: true, status: true } })
      : Promise.resolve([]),
  ]);
  const courseStatus = new Map(courses.map((c) => [c.id, String(c.status)]));
  const listingStatus = new Map(listings.map((l) => [l.id, String(l.status)]));

  let cancelled = 0;
  for (const p of pending) {
    const isCourse = p.kind === "COURSE";
    const itemId = isCourse ? p.courseId : p.listingId;
    const status = itemId ? (isCourse ? courseStatus.get(itemId) : listingStatus.get(itemId)) : undefined;
    if (status === (isCourse ? "PUBLISHED" : "ACTIVE")) continue;
    const why = !status
      ? `the ${itemNoun(p.kind)} was deleted`
      : isCourse
        ? "the course is no longer published"
        : "the listing is no longer active";
    try {
      if (await cancelPromotion(p.id, null, why)) cancelled++;
    } catch (e) {
      console.error("[promotion-review] cancel failed", p.id, e);
    }
  }
  return { cancelled };
}
