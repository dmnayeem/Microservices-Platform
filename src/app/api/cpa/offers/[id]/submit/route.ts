import { assertPageVisible } from "@/lib/page-visibility-server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/require-active";
import { dbRateLimit } from "@/lib/rate-limit-db";
import { ownMediaKey } from "@/lib/media-url";
import {
  CPA_REASON_MESSAGES,
  checkCpaEligibility,
  cpaReasonMessage,
  getCpaRetryHours,
  loadCpaViewer,
} from "@/lib/cpa/eligibility";
import { profileGateResponse } from "@/lib/profile-gate-server";
import { CPA_PUBLIC_OFFER_SELECT } from "@/lib/cpa/public";
import { submitCpaConversion } from "@/lib/cpa/credit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  proofImages: z.array(z.string().max(1000)).max(5).optional(),
  proofText: z.string().max(2000).optional().nullable(),
});

// POST /api/cpa/offers/:id/submit  { proofImages?: string[≤5], proofText?: string }
//
// proofImages are the `url`s returned by PUT /api/upload with folder
// "task-proofs" (the task proof uploader) — and must be the caller's own
// uploads. The user must have pressed Start (a CpaClick) first — for a retry
// after a rejection, a Start made since the rejection.
// → { ok: true, conversionId, status: "PENDING", retried }
// → 409 { error, reason } — reason RETRY_LATER carries `retryAt` (ISO).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Super-admin page visibility: refuse when /cpa is hidden for this user.
  const pageHidden = await assertPageVisible(userId, "/cpa");
  if (pageHidden) return pageHidden;

  const active = await requireActiveUser(userId);
  if (!active.ok) return NextResponse.json({ error: active.message }, { status: active.httpStatus });

  const limited = await dbRateLimit(`cpa_submit:${userId}`, 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${limited.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const proofImages = [...new Set((parsed.data.proofImages ?? []).map((s) => s.trim()).filter(Boolean))];
  const proofText = parsed.data.proofText?.trim() || null;

  // Only screenshots this user uploaded through the proof uploader.
  const ownPrefix = `task-proofs/${userId}/`;
  if (proofImages.some((u) => !(ownMediaKey(u) ?? "").startsWith(ownPrefix))) {
    return NextResponse.json({ error: "Upload your screenshots with the uploader on this page." }, { status: 400 });
  }

  const { id } = await params;
  const viewer = await loadCpaViewer(userId);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const offer = await prisma.cpaOffer.findUnique({
    where: { id },
    select: { ...CPA_PUBLIC_OFFER_SELECT, payoutUsd: true },
  });
  if (!offer) return NextResponse.json({ error: CPA_REASON_MESSAGES.NOT_FOUND }, { status: 404 });

  if (offer.proofRequired && proofImages.length === 0) {
    return NextResponse.json({ error: "Add at least one screenshot as proof." }, { status: 400 });
  }
  if (!offer.proofRequired && proofImages.length === 0 && !proofText) {
    return NextResponse.json({ error: "Tell us what you did, or add a screenshot." }, { status: 400 });
  }

  // A signed postback may already have created this user's conversion; that
  // path attaches the proof. A REJECTED one goes through the full gate again
  // (the retry wait, caps, audience). Otherwise the full gate applies.
  const existing = await prisma.cpaConversion.findUnique({
    where: { offerId_userId: { offerId: id, userId } },
    select: { id: true, status: true, reviewedAt: true },
  });
  const retrying = existing?.status === "REJECTED";

  // The Start of THIS attempt: after a rejection, only a click made since.
  const click = await prisma.cpaClick.findFirst({
    where: {
      offerId: id,
      userId,
      ...(retrying && existing?.reviewedAt ? { createdAt: { gt: existing.reviewedAt } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!click) {
    if (retrying) {
      const gate = await checkCpaEligibility(offer, viewer);
      if (!gate.ok) {
        return NextResponse.json(
          { error: cpaReasonMessage(gate), reason: gate.reason, retryAt: gate.retryAt ?? null },
          { status: 409 }
        );
      }
    }
    // Never started: the profile gate applies here too (a user who already
    // started is mid-offer and is not stopped by a rule switched on since).
    const profileGated = await profileGateResponse(userId, "cpa");
    if (profileGated) return profileGated;
    return NextResponse.json({ error: "Start the offer first, then send your proof." }, { status: 409 });
  }

  if (!existing || retrying) {
    const gate = await checkCpaEligibility(offer, viewer);
    if (!gate.ok) {
      return NextResponse.json(
        { error: cpaReasonMessage(gate), reason: gate.reason, retryAt: gate.retryAt ?? null },
        { status: 409 }
      );
    }
  }

  const r = await submitCpaConversion({
    offerId: id,
    userId,
    points: offer.points,
    payoutUsd: offer.payoutUsd,
    clickId: click.id,
    proofImages,
    proofText,
    retryHours: await getCpaRetryHours(),
  });
  if (!r.ok) {
    if (r.reason === "RETRY_LATER") {
      return NextResponse.json(
        { error: cpaReasonMessage({ reason: "RETRY_LATER", retryAt: r.retryAt }), reason: "RETRY_LATER", retryAt: r.retryAt },
        { status: 409 }
      );
    }
    const reason = r.reason === "CAP" ? "TOTAL_CAP" : "ALREADY";
    return NextResponse.json({ error: CPA_REASON_MESSAGES[reason], reason }, { status: 409 });
  }
  return NextResponse.json({ ok: true, conversionId: r.conversionId, status: "PENDING", retried: r.retried });
}
