import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanFeature } from "@/lib/packages";
import {
  getOfferChainState,
  offerAllowsCountry,
  buildTrackingUrl,
} from "@/lib/offerwall";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/offerwall/offers/[id]/start — begin an offer: creates the click
// (subid) + a STARTED completion, then returns the tracking URL to open.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  if (!(await userCanFeature(userId, "offerwallTasks")))
    return NextResponse.json({ error: "Offerwall isn't enabled for your account." }, { status: 403 });

  const { id } = await params;
  const offer = await prisma.offerwallOffer.findUnique({ where: { id } });
  if (!offer || !offer.isActive)
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { country: true } });
  if (!offerAllowsCountry(offer.countries, user?.country))
    return NextResponse.json({ error: "This offer isn't available in your country." }, { status: 403 });

  // Sequential unlock within the category.
  const chain = await getOfferChainState(userId);
  if (chain.lockedOfferIds.has(id))
    return NextResponse.json({ error: "Complete the previous offer to unlock this one.", code: "OFFER_LOCKED" }, { status: 403 });

  // Already-completed one-time offers can't be restarted.
  const existing = await prisma.offerwallCompletion.findFirst({
    where: { userId, offerId: id, status: { in: ["APPROVED", "PENDING"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    if (existing.status === "APPROVED" && offer.oneTimePerUser)
      return NextResponse.json({ error: "You've already completed this offer." }, { status: 409 });
    // Resume an in-flight completion.
    const clickId = existing.clickId ?? existing.id;
    return NextResponse.json({
      completionId: existing.id,
      clickId,
      trackingUrl: buildTrackingUrl(offer.trackingUrlTemplate, userId, clickId),
      completionMode: offer.completionMode,
      instructions: offer.instructions,
      status: existing.status,
    });
  }

  const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || null;
  const click = await prisma.offerwallClick.create({ data: { userId, offerId: id, ip } });
  const completion = await prisma.offerwallCompletion.create({
    data: {
      userId,
      offerId: id,
      categoryId: offer.categoryId,
      status: "STARTED",
      points: offer.points,
      payoutUsd: offer.payoutUsd,
      providerId: offer.providerId,
      clickId: click.id,
    },
  });

  return NextResponse.json({
    completionId: completion.id,
    clickId: click.id,
    trackingUrl: buildTrackingUrl(offer.trackingUrlTemplate, userId, click.id),
    completionMode: offer.completionMode,
    instructions: offer.instructions,
    status: "STARTED",
  });
}
