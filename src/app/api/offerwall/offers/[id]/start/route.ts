import { assertPageVisible } from "@/lib/page-visibility-server";
import { NextRequest, NextResponse } from "next/server";
import { syncCountryMode } from "@/lib/country-mode";
import { effectiveCountry } from "@/lib/effective-country";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCanFeature } from "@/lib/packages";
import {
  getOfferChainState,
  offerAllowsCountry,
  buildTrackingUrl,
  OFFER_DAILY_COUNTED,
  offerDayStart,
} from "@/lib/offerwall";
import { profileGateResponse } from "@/lib/profile-gate-server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/offerwall/offers/[id]/start — begin an offer: creates the click
// (subid) + a STARTED completion, then returns the tracking URL to open.
export async function POST(request: NextRequest, { params }: RouteParams) {
  await syncCountryMode(); // country targeting: profile+IP or IP only
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Super-admin page visibility: refuse when /offerwalls is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/offerwalls");
  if (pageHidden) return pageHidden;
  const userId = session.user.id;
  // "offerwalls" is also locked by "tasks". Resuming an offer already started
  // (a STARTED/PENDING completion) is not a new start, so it is let through.
  const { id: gateOfferId } = await params;
  const profileGated = await profileGateResponse(userId, "offerwalls", async () =>
    !!(await prisma.offerwallCompletion.findFirst({
      where: { userId, offerId: gateOfferId, status: { in: ["STARTED", "PENDING"] } },
      select: { id: true },
    }))
  );
  if (profileGated) return profileGated;

  if (!(await userCanFeature(userId, "offerwallTasks")))
    return NextResponse.json({ error: "Offerwall isn't enabled for your account." }, { status: 403 });

  const { id } = await params;
  const offer = await prisma.offerwallOffer.findUnique({ where: { id } });
  if (!offer || !offer.isActive)
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { country: true, lastCountry: true, signupCountry: true },
  });
  // Same country the catalog listed the offer for (profile, else IP).
  if (!offerAllowsCountry(offer.countries, effectiveCountry(user)))
    return NextResponse.json({ error: "This offer isn't available in your country." }, { status: 403 });

  // Sequential unlock within the category.
  const chain = await getOfferChainState(userId);
  if (chain.lockedOfferIds.has(id))
    return NextResponse.json({ error: "Complete the previous offer to unlock this one.", code: "OFFER_LOCKED" }, { status: 403 });

  const ip = (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || null;

  // Everything below runs under a lock on the user's row, so two concurrent
  // "Start" taps cannot both pass the one-time / daily-limit checks and both
  // insert (the old check-then-create raced, and every tap also minted a fresh
  // STARTED completion instead of resuming the open one).
  type Outcome =
    | { kind: "resume"; completionId: string; clickId: string; status: string }
    | { kind: "created"; completionId: string; clickId: string }
    | { kind: "done" }
    | { kind: "daily" };
  const outcome: Outcome = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      // Resume an in-flight completion (STARTED, or PENDING = submitted/held).
      const open = await tx.offerwallCompletion.findFirst({
        where: { userId, offerId: id, status: { in: ["STARTED", "PENDING"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, clickId: true, status: true },
      });
      if (open) {
        return { kind: "resume", completionId: open.id, clickId: open.clickId ?? open.id, status: open.status };
      }

      // Already-completed one-time offers can't be restarted.
      if (offer.oneTimePerUser) {
        const done = await tx.offerwallCompletion.findFirst({
          where: { userId, offerId: id, status: "APPROVED" },
          select: { id: true },
        });
        if (done) return { kind: "done" };
      }

      // Per-user daily limit for this offer (UTC day).
      if (offer.dailyLimit && offer.dailyLimit > 0) {
        const today = await tx.offerwallCompletion.count({
          where: {
            userId,
            offerId: id,
            status: { in: OFFER_DAILY_COUNTED },
            createdAt: { gte: offerDayStart() },
          },
        });
        if (today >= offer.dailyLimit) return { kind: "daily" };
      }

      const click = await tx.offerwallClick.create({ data: { userId, offerId: id, ip } });
      const completion = await tx.offerwallCompletion.create({
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
      return { kind: "created", completionId: completion.id, clickId: click.id };
    },
    { timeout: 15_000, maxWait: 10_000 }
  );

  if (outcome.kind === "done")
    return NextResponse.json({ error: "You've already completed this offer." }, { status: 409 });
  if (outcome.kind === "daily")
    return NextResponse.json(
      { error: "You've reached today's limit for this offer. Try again tomorrow.", code: "OFFER_DAILY_LIMIT" },
      { status: 429 }
    );

  return NextResponse.json({
    completionId: outcome.completionId,
    clickId: outcome.clickId,
    trackingUrl: buildTrackingUrl(offer.trackingUrlTemplate, userId, outcome.clickId),
    completionMode: offer.completionMode,
    instructions: offer.instructions,
    status: outcome.kind === "resume" ? outcome.status : "STARTED",
  });
}
