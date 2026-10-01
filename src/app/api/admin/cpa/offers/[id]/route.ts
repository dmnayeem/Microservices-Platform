import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { screenLinks } from "@/lib/link-safety";
import { getPointsPerUsd } from "@/lib/economy";
import {
  CPA_MANAGE,
  CPA_VIEW,
  cpaOfferData,
  cpaOfferPatchSchema,
  cpaOfferWarnings,
  requireCpaAdmin,
} from "@/lib/cpa/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const plain = <T extends { payoutUsd: unknown }>(o: T) => ({
  ...o,
  payoutUsd: o.payoutUsd == null ? null : Number(o.payoutUsd),
});

// GET /api/admin/cpa/offers/:id
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const gate = await requireCpaAdmin(CPA_VIEW);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const offer = await prisma.cpaOffer.findUnique({ where: { id } });
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  const rate = await getPointsPerUsd();
  return NextResponse.json({ offer: plain(offer), warnings: cpaOfferWarnings(offer, rate) });
}

// PATCH /api/admin/cpa/offers/:id — partial update. Targeting is replaced as a
// whole only when the body carries any targeting key.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const gate = await requireCpaAdmin(CPA_MANAGE);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = cpaOfferPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const before = await prisma.cpaOffer.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  const data = cpaOfferData(parsed.data, body);
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const offer = await prisma.cpaOffer.update({
    where: { id },
    data: data as Prisma.CpaOfferUpdateInput,
  });

  // Admin-entered: never refused, only flagged for a second look.
  const tracking = (data as Record<string, unknown>).trackingUrl;
  if (typeof tracking === "string") {
    await screenLinks(
      { urls: [tracking] },
      { userId: gate.userId, entityType: "cpa", entityId: id, enforcement: "never" }
    );
  }

  const changed = Object.keys(data).filter(
    (k) =>
      JSON.stringify((before as Record<string, unknown>)[k]) !==
      JSON.stringify((offer as Record<string, unknown>)[k])
  );
  await writeAudit({
    actorId: gate.userId,
    action: "CPA_OFFER_UPDATED",
    entity: "CpaOffer",
    entityId: id,
    summary: `Edited CPA offer "${offer.title}"${changed.length ? ` (${changed.join(", ")})` : ""}`,
    meta: {
      changed,
      before: Object.fromEntries(changed.map((k) => [k, (before as Record<string, unknown>)[k]])),
      after: Object.fromEntries(changed.map((k) => [k, (offer as Record<string, unknown>)[k]])),
    },
  });

  const rate = await getPointsPerUsd();
  return NextResponse.json({ offer: plain(offer), warnings: cpaOfferWarnings(offer, rate) });
}

// DELETE /api/admin/cpa/offers/:id — hard delete only when no conversion exists
// (conversions back real payments); otherwise the offer is ARCHIVED.
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const gate = await requireCpaAdmin(CPA_MANAGE);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const offer = await prisma.cpaOffer.findUnique({ where: { id } });
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  const conversions = await prisma.cpaConversion.count({ where: { offerId: id } });
  if (conversions > 0) {
    await prisma.cpaOffer.update({ where: { id }, data: { status: "ARCHIVED" } });
    await writeAudit({
      actorId: gate.userId,
      action: "CPA_OFFER_ARCHIVED",
      entity: "CpaOffer",
      entityId: id,
      summary: `Archived CPA offer "${offer.title}" (${conversions} conversions — kept)`,
      meta: { conversions, previousStatus: offer.status },
    });
    return NextResponse.json({ archived: true, conversions });
  }

  await prisma.cpaOffer.delete({ where: { id } });
  await writeAudit({
    actorId: gate.userId,
    action: "CPA_OFFER_DELETED",
    entity: "CpaOffer",
    entityId: id,
    summary: `Deleted CPA offer "${offer.title}"`,
    // The row is gone; the snapshot is the only record of what it was.
    meta: { snapshot: plain(offer) },
  });
  return NextResponse.json({ deleted: true });
}
