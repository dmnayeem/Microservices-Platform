import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { clearRateCardCache } from "@/lib/ad-rate-card";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ALLOWED = ["PENDING_PAYMENT", "ACTIVE", "ENDED", "CANCELLED"] as const;

/**
 * Change a booking's status, dates or terms.
 *
 * Activating is the moment the space actually changes hands — until then a
 * `PENDING_PAYMENT` booking is a note to self and `getActiveBooking` ignores it,
 * so an unpaid agreement cannot hold a space hostage.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const existing = await prisma.adSlotBooking.findUnique({
    where: { id },
    include: {
      placement: { select: { name: true } },
      campaign: { select: { title: true, advertiserId: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!ALLOWED.includes(body.status)) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.billClicks !== undefined) data.billClicks = Boolean(body.billClicks);
  if (body.exclusive !== undefined) data.exclusive = Boolean(body.exclusive);
  if (body.note !== undefined) data.note = body.note ? String(body.note).slice(0, 500) : null;
  if (body.priceUsd !== undefined) {
    const v = Number(body.priceUsd);
    if (!Number.isFinite(v) || v < 0 || v > 1_000_000) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
    }
    data.priceUsd = v;
  }
  for (const key of ["startAt", "endAt"] as const) {
    if (body[key] !== undefined) {
      const d = new Date(String(body[key]));
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
      }
      data[key] = d;
    }
  }
  const start = (data.startAt as Date) ?? existing.startAt;
  const end = (data.endAt as Date) ?? existing.endAt;
  if (end <= start) {
    return NextResponse.json(
      { error: "The end date must be after the start date." },
      { status: 400 }
    );
  }

  // Activating an exclusive booking is the point at which a clash becomes a
  // real problem — two clients both told the space is theirs. Checked here as
  // well as at create, because dates and exclusivity can both be edited after.
  const willBeActive = (data.status ?? existing.status) === "ACTIVE";
  const willBeExclusive = (data.exclusive ?? existing.exclusive) === true;
  if (willBeActive && willBeExclusive) {
    const clash = await prisma.adSlotBooking.findFirst({
      where: {
        id: { not: id },
        placementId: existing.placementId,
        exclusive: true,
        status: "ACTIVE",
        startAt: { lte: end },
        endAt: { gte: start },
      },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: "Another active exclusive booking already covers that period.", conflictId: clash.id },
        { status: 409 }
      );
    }
  }

  const booking = await prisma.adSlotBooking.update({ where: { id }, data });
  // Activating or ending a booking changes what serves — drop the memo.
  clearRateCardCache();

  await writeAudit({
    actorId: session.user.id,
    action: "AD_SLOT_BOOKING_UPDATED",
    entity: "AdSlotBooking",
    entityId: id,
    targetUserId: existing.campaign?.advertiserId ?? null,
    summary: `${existing.placement?.name ?? "Space"} booking for "${existing.campaign?.title ?? "—"}" → ${booking.status}`,
    meta: { fields: Object.keys(data) },
  });

  return NextResponse.json({ booking });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.adSlotBooking.findUnique({
    where: { id },
    include: {
      placement: { select: { name: true } },
      campaign: { select: { title: true, advertiserId: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.adSlotBooking.delete({ where: { id } });
  clearRateCardCache();

  await writeAudit({
    actorId: session.user.id,
    action: "AD_SLOT_BOOKING_DELETED",
    entity: "AdSlotBooking",
    entityId: id,
    targetUserId: existing.campaign?.advertiserId ?? null,
    summary: `Deleted ${existing.placement?.name ?? "space"} booking for "${existing.campaign?.title ?? "—"}"`,
  });

  return NextResponse.json({ success: true });
}
