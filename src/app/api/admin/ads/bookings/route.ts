import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { clearRateCardCache } from "@/lib/ad-rate-card";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";

/**
 * Slot bookings — a space rented outright for a period.
 *
 * This is the direct-sales product. CPC only ever suited self-serve advertisers;
 * selling a client "this banner is yours for a month" is how a publisher this
 * size actually earns, and there was no way to express it at all.
 *
 * A booking starts `PENDING_PAYMENT` and does nothing until it is activated, so
 * a slot cannot be taken hostage by an unpaid agreement.
 */

interface BookingRow {
  id: string;
  placementId: string;
  campaignId: string;
  startAt: Date;
  endAt: Date;
  priceUsd: unknown;
  exclusive: boolean;
  billClicks: boolean;
  status: string;
  note: string | null;
  placement: { id: string; name: string } | null;
  campaign: {
    id: string;
    title: string;
    advertiser: { id: string; name: string | null; email: string } | null;
  } | null;
}

const createSchema = z.object({
  placementId: z.string().min(1),
  campaignId: z.string().min(1),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  priceUsd: z.number().min(0).max(1_000_000).default(0),
  exclusive: z.boolean().default(true),
  billClicks: z.boolean().default(false),
  note: z.string().max(500).optional(),
  /** Skip PENDING_PAYMENT — for a client who has already paid. */
  activate: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const status = new URL(request.url).searchParams.get("status");

  // Prisma's `include` generic degrades here (the same gotcha noted in
  // admin/analytics/page.tsx), so the row shape is stated explicitly.
  const bookings = (await prisma.adSlotBooking.findMany({
    where: status && status !== "all" ? { status } : {},
    orderBy: [{ startAt: "desc" }],
    take: 200,
    include: {
      placement: { select: { id: true, name: true } },
      campaign: {
        select: {
          id: true,
          title: true,
          advertiser: { select: { id: true, name: true, email: true } },
        },
      },
    },
  })) as unknown as BookingRow[];

  const now = Date.now();
  return NextResponse.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      placementId: b.placementId,
      placement: b.placement?.name ?? "—",
      campaignId: b.campaignId,
      campaign: b.campaign?.title ?? "—",
      advertiser: b.campaign?.advertiser?.email ?? null,
      startAt: b.startAt,
      endAt: b.endAt,
      priceUsd: toNum(b.priceUsd as never),
      exclusive: b.exclusive,
      billClicks: b.billClicks,
      status: b.status,
      note: b.note,
      // Whether it is actually taking the space RIGHT NOW — status alone does
      // not say that, because an ACTIVE booking can be scheduled or expired.
      live:
        b.status === "ACTIVE" &&
        b.startAt.getTime() <= now &&
        b.endAt.getTime() >= now,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const v = createSchema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid booking" },
      { status: 400 }
    );
  }
  const d = v.data;
  const startAt = new Date(d.startAt);
  const endAt = new Date(d.endAt);
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }
  if (endAt <= startAt) {
    return NextResponse.json(
      { error: "The end date must be after the start date." },
      { status: 400 }
    );
  }

  const [placement, campaign] = await Promise.all([
    prisma.adPlacement.findUnique({
      where: { id: d.placementId },
      select: { id: true, name: true, isRentable: true },
    }),
    prisma.adCampaign.findUnique({
      where: { id: d.campaignId },
      select: { id: true, title: true, advertiserId: true },
    }),
  ]);
  if (!placement) {
    return NextResponse.json({ error: "Unknown space" }, { status: 400 });
  }
  if (!campaign) {
    return NextResponse.json({ error: "Unknown campaign" }, { status: 400 });
  }
  if (!placement.isRentable) {
    return NextResponse.json(
      {
        error: `"${placement.name}" is not marked for rent. Set a monthly price on it first.`,
      },
      { status: 400 }
    );
  }

  // Overlapping exclusives are the one thing that would quietly break a sale:
  // two clients each told the space is theirs. Rejected outright rather than
  // resolved by a tie-break nobody agreed to.
  if (d.exclusive) {
    const clash = await prisma.adSlotBooking.findFirst({
      where: {
        placementId: d.placementId,
        exclusive: true,
        status: { in: ["PENDING_PAYMENT", "ACTIVE"] },
        startAt: { lte: endAt },
        endAt: { gte: startAt },
      },
      select: { id: true, startAt: true, endAt: true },
    });
    if (clash) {
      return NextResponse.json(
        {
          error: `That space is already booked exclusively from ${clash.startAt.toISOString().slice(0, 10)} to ${clash.endAt.toISOString().slice(0, 10)}.`,
          conflictId: clash.id,
        },
        { status: 409 }
      );
    }
  }

  const booking = await prisma.adSlotBooking.create({
    data: {
      placementId: d.placementId,
      campaignId: d.campaignId,
      advertiserId: campaign.advertiserId,
      startAt,
      endAt,
      priceUsd: d.priceUsd,
      exclusive: d.exclusive,
      billClicks: d.billClicks,
      status: d.activate ? "ACTIVE" : "PENDING_PAYMENT",
      note: d.note ?? null,
      createdById: session.user.id,
    },
  });

  // A booking that has just been activated must take the space now, not in 30s.
  clearRateCardCache();

  await writeAudit({
    actorId: session.user.id,
    action: "AD_SLOT_BOOKED",
    entity: "AdSlotBooking",
    entityId: booking.id,
    targetUserId: campaign.advertiserId,
    summary: `Booked ${placement.name} for "${campaign.title}" — ${usd(d.priceUsd)}${d.activate ? " (active)" : " (awaiting payment)"}`,
    meta: {
      placement: placement.name,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      exclusive: d.exclusive,
      billClicks: d.billClicks,
    },
  });

  return NextResponse.json({ booking });
}
