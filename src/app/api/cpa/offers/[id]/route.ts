import { assertPageVisible } from "@/lib/page-visibility-server";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  checkCpaEligibility,
  cpaReasonMessage,
  loadCpaViewer,
} from "@/lib/cpa/eligibility";
import { CPA_MY_CONVERSION_SELECT, CPA_PUBLIC_OFFER_SELECT, toPublicCpaOffer } from "@/lib/cpa/public";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/cpa/offers/:id — one offer for the offer page.
// { offer, available, reason, message, retryAt, my, hasStarted }
// A REJECTED `my` with `available` true may be tried again now; with reason
// RETRY_LATER it may from `retryAt`.
// 404 unless the user may do it or already has a conversion on it.
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Super-admin page visibility: refuse when /cpa is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/cpa");
  if (pageHidden) return pageHidden;
  const viewer = await loadCpaViewer(session.user.id);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [offer, my] = await Promise.all([
    prisma.cpaOffer.findUnique({ where: { id }, select: CPA_PUBLIC_OFFER_SELECT }),
    prisma.cpaConversion.findUnique({
      where: { offerId_userId: { offerId: id, userId: viewer.id } },
      select: CPA_MY_CONVERSION_SELECT,
    }),
  ]);
  // "Started" means started THIS attempt: after a rejection only a click made
  // since then counts, so a retry begins with Start again.
  const click = await prisma.cpaClick.findFirst({
    where: {
      offerId: id,
      userId: viewer.id,
      ...(my?.status === "REJECTED" && my.reviewedAt ? { createdAt: { gt: my.reviewedAt } } : {}),
    },
    select: { id: true },
  });
  if (!offer || (offer.status === "DRAFT" && !my)) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  const gate = await checkCpaEligibility(offer, viewer);
  if (!gate.ok && !my && gate.reason !== "DAILY_CAP") {
    return NextResponse.json(
      { error: cpaReasonMessage(gate), reason: gate.reason },
      { status: 404 }
    );
  }
  return NextResponse.json({
    offer: toPublicCpaOffer(offer),
    available: gate.ok,
    reason: gate.ok ? null : gate.reason,
    message: gate.ok ? null : cpaReasonMessage(gate),
    retryAt: !gate.ok && gate.retryAt ? gate.retryAt.toISOString() : null,
    my,
    /** True once the user has pressed Start (a click exists) — submit needs it. */
    hasStarted: !!click,
  });
}
