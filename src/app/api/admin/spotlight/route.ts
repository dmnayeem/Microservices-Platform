import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { contestAdminGuard as engagementGuard } from "@/lib/contests-admin";

/** GET: every Spotlight auction with its bid count and top bid. POST: open a new one. */
export async function GET() {
  const g = await engagementGuard("events.view");
  if ("res" in g) return g.res;
  const rows = await prisma.spotlightAuction.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const bids = await prisma.spotlightBid.findMany({
    where: { auctionId: { in: rows.map((r) => r.id) } },
    select: { auctionId: true, amount: true, status: true },
  });
  return NextResponse.json({
    auctions: rows.map((r) => {
      const mine = bids.filter((b) => b.auctionId === r.id);
      return { ...r, bids: mine.length, topBid: mine.find((b) => b.status === "HELD" || b.status === "WON")?.amount ?? null };
    }),
  });
}

export async function POST(request: NextRequest) {
  const g = await engagementGuard("events.manage");
  if ("res" in g) return g.res;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(b.title ?? "").trim().slice(0, 120);
  const ends = new Date(String(b.biddingEndsAt ?? ""));
  const int = (v: unknown, lo: number, hi: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
  };
  const displayHours = int(b.displayHours, 1, 168);
  const minBid = int(b.minBid, 1, 1_000_000);
  const bidStep = int(b.bidStep, 1, 100_000);
  if (title.length < 3) return NextResponse.json({ error: "Give it a title." }, { status: 400 });
  if (Number.isNaN(ends.getTime()) || ends.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Bidding must end in the future." }, { status: 400 });
  }
  if (!displayHours || !minBid || !bidStep) {
    return NextResponse.json({ error: "Featured for 1–168 hours; starting bid and step at least 1 point." }, { status: 400 });
  }
  const a = await prisma.spotlightAuction.create({
    data: {
      title,
      description: String(b.description ?? "").trim().slice(0, 500) || null,
      biddingEndsAt: ends,
      displayHours,
      minBid,
      bidStep,
      createdById: g.userId,
    },
  });
  await writeAudit({ actorId: g.userId, action: "SPOTLIGHT_CREATED", entity: "SpotlightAuction", entityId: a.id, summary: `Opened Spotlight "${title}"` });
  return NextResponse.json({ ok: true, auction: a });
}
