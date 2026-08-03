import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { toNum } from "@/lib/money";
import type { Prisma } from "@/generated/prisma";

type ThreadListRow = {
  id: string;
  buyerId: string;
  sellerId: string;
  lastMessageAt: Date;
  unreadBuyer: number;
  unreadSeller: number;
  listing: { id: string; title: string; images: string[] };
  messages: { body: string }[];
  deals: { id: string; status: string; amount: Prisma.Decimal }[];
};

// GET /api/marketplace/threads — my conversations (as buyer or seller).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const threads = (await prisma.marketplaceThread.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      listing: { select: { id: true, title: true, images: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      deals: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  })) as unknown as ThreadListRow[];

  const rows = threads.map((t) => {
    const iAmBuyer = t.buyerId === userId;
    const deal = t.deals[0];
    return {
      id: t.id,
      listing: { id: t.listing.id, title: t.listing.title, image: t.listing.images?.[0] ?? null },
      role: iAmBuyer ? "BUYER" : "SELLER",
      counterpartyId: iAmBuyer ? t.sellerId : t.buyerId,
      lastMessage: t.messages[0]?.body ?? null,
      lastMessageAt: t.lastMessageAt.toISOString(),
      unread: iAmBuyer ? t.unreadBuyer : t.unreadSeller,
      deal: deal
        ? { id: deal.id, status: deal.status, amount: toNum(deal.amount) }
        : null,
    };
  });

  return NextResponse.json({ threads: rows });
}

const createSchema = z.object({ listingId: z.string().min(1) });

// POST /api/marketplace/threads — create or get the buyer's thread for a listing.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const v = createSchema.safeParse(await request.json());
  if (!v.success) {
    return NextResponse.json({ error: "listingId is required" }, { status: 400 });
  }

  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: v.data.listingId },
    select: { id: true, sellerId: true },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  if (listing.sellerId === userId) {
    return NextResponse.json(
      { error: "You can't message yourself — open the conversation from the buyer's side." },
      { status: 400 }
    );
  }

  // One thread per (listing, buyer).
  const existing = await prisma.marketplaceThread.findUnique({
    where: { listingId_buyerId: { listingId: listing.id, buyerId: userId } },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ threadId: existing.id });

  const thread = await prisma.marketplaceThread.create({
    data: { listingId: listing.id, buyerId: userId, sellerId: listing.sellerId },
    select: { id: true },
  });
  return NextResponse.json({ threadId: thread.id });
}
