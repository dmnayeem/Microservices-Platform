import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { estimateAudience } from "@/lib/ad-audience";
import { AD_STATUS } from "@/lib/ad-review";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Everything a reviewer needs to decide, in one call. The old queue row showed a
 * thumbnail, a title and a placement — not the destination URL, not the full
 * copy, not who submitted it or what they'd submitted before. You cannot review
 * an ad without those, so this endpoint gathers them.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const ad = await prisma.ad.findUnique({
    where: { id },
    include: {
      campaign: {
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          budget: true,
          spentTotal: true,
          isHouse: true,
          startAt: true,
          endAt: true,
          advertiserId: true,
        },
      },
      placement: { select: { id: true, name: true, isActive: true } },
      reviews: true,
    },
  });
  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 });

  // Newest decision first. Sorted here rather than in the include so the
  // relation payload keeps its inferred type under the Accelerate extension.
  const reviews = [...ad.reviews]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20);

  const advertiserId = ad.submittedById ?? ad.campaign.advertiserId;

  // Identities are resolved by id (no FK on submittedById/reviewedById/actorId —
  // those users can be deleted).
  const userIds = Array.from(
    new Set(
      [
        ad.submittedById,
        ad.reviewedById,
        ad.campaign.advertiserId,
        ...reviews.map((r) => r.actorId),
      ].filter((x): x is string => !!x)
    )
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          status: true,
          role: true,
          createdAt: true,
          adCreditBalance: true,
        },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  const [siblings, history, reach] = await Promise.all([
    // Every row of the same submission — one creative fanned across N spaces.
    ad.creativeGroupId
      ? prisma.ad.findMany({
          where: { creativeGroupId: ad.creativeGroupId },
          select: { id: true, status: true, placement: { select: { name: true } } },
        })
      : Promise.resolve([]),
    // This advertiser's track record: are we looking at a repeat offender?
    advertiserId
      ? (prisma.ad.groupBy({
          by: ["status"],
          where: { OR: [{ submittedById: advertiserId }, { campaign: { advertiserId } }] },
          _count: { _all: true },
        }) as unknown as Promise<{ status: string; _count: { _all: number } }[]>)
      : Promise.resolve([] as { status: string; _count: { _all: number } }[]),
    estimateAudience(ad.targeting).catch(() => null),
  ]);

  const historyByStatus = Object.fromEntries(
    history.map((h) => [h.status, h._count._all])
  ) as Record<string, number>;

  const advertiser = advertiserId ? byId.get(advertiserId) ?? null : null;

  return NextResponse.json({
    ad: {
      ...ad,
      campaign: {
        ...ad.campaign,
        budget: toNum(ad.campaign.budget),
        spentTotal: toNum(ad.campaign.spentTotal),
      },
    },
    siblings,
    submittedBy: ad.submittedById ? byId.get(ad.submittedById) ?? null : null,
    reviewedBy: ad.reviewedById ? byId.get(ad.reviewedById) ?? null : null,
    advertiser: advertiser
      ? { ...advertiser, adCreditBalance: toNum(advertiser.adCreditBalance) }
      : null,
    advertiserHistory: {
      approved:
        (historyByStatus[AD_STATUS.ACTIVE] ?? 0) + (historyByStatus[AD_STATUS.PAUSED] ?? 0),
      rejected: historyByStatus[AD_STATUS.REJECTED] ?? 0,
      pending: historyByStatus[AD_STATUS.PENDING] ?? 0,
      changesRequested: historyByStatus[AD_STATUS.CHANGES_REQUESTED] ?? 0,
    },
    reviews: reviews.map((r) => ({
      ...r,
      actor: r.actorId ? byId.get(r.actorId) ?? null : null,
    })),
    reach,
  });
}
