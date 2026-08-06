import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/offerwall/offers/[id]/submit — submit proof for a PROOF offer.
// Body: { completionId, proofImages: string[] }. Moves STARTED → PENDING for
// admin review. POSTBACK/MANUAL offers don't use this (they credit elsewhere).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const completionId = String(body?.completionId ?? "");
  const proofImages: string[] = Array.isArray(body?.proofImages)
    ? body.proofImages.filter((s: unknown) => typeof s === "string")
    : [];

  const offer = await prisma.offerwallOffer.findUnique({ where: { id } });
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  if (offer.completionMode !== "PROOF")
    return NextResponse.json({ error: "This offer doesn't take a proof submission." }, { status: 400 });
  if (offer.proofScreenshot && proofImages.length === 0)
    return NextResponse.json({ error: "Upload a screenshot as proof." }, { status: 400 });

  const completion = await prisma.offerwallCompletion.findFirst({
    where: { id: completionId, userId, offerId: id },
  });
  if (!completion) return NextResponse.json({ error: "Start the offer first." }, { status: 404 });
  if (completion.status !== "STARTED")
    return NextResponse.json({ error: "Already submitted." }, { status: 409 });

  await prisma.offerwallCompletion.update({
    where: { id: completion.id },
    data: { status: "PENDING", proofImages },
  });

  return NextResponse.json({ ok: true, status: "PENDING" });
}
