import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveThreadAccess } from "@/lib/marketplace-thread";
import type { UserRole } from "@/generated/prisma";
import { toNum } from "@/lib/money";
import { getMediationConfig } from "@/lib/marketplace-mediation";
import {
  ORDER_SENDER_TYPE,
  REVISION_SENDER_TYPE,
  parseOrderBrief,
  type OrderBrief,
} from "@/lib/service-packages";

// GET /api/marketplace/threads/:id — thread messages + deals + participants.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { thread, role } = await resolveThreadAccess(
    id,
    session.user.id,
    session.user.role as UserRole | undefined
  );
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [listing, buyer, seller, messages, deals, mediation] = await Promise.all([
    prisma.marketplaceListing.findUnique({
      where: { id: thread.listingId },
      select: { id: true, title: true, images: true, price: true, status: true, assetType: true },
    }),
    prisma.user.findUnique({ where: { id: thread.buyerId }, select: { id: true, name: true, avatar: true } }),
    prisma.user.findUnique({ where: { id: thread.sellerId }, select: { id: true, name: true, avatar: true } }),
    prisma.marketplaceThreadMessage.findMany({
      where: { threadId: id },
      orderBy: { createdAt: "asc" },
      take: 300,
    }),
    prisma.marketplaceDeal.findMany({
      where: { threadId: id },
      orderBy: { createdAt: "desc" },
    }),
    getMediationConfig(),
  ]);

  // Clear the caller's unread counter (buyer/seller only).
  if (role === "BUYER" && thread.unreadBuyer > 0) {
    await prisma.marketplaceThread.update({ where: { id }, data: { unreadBuyer: 0 } });
  } else if (role === "SELLER" && thread.unreadSeller > 0) {
    await prisma.marketplaceThread.update({ where: { id }, data: { unreadSeller: 0 } });
  }

  // Service orders: the ORDER message is the order brief (package snapshot +
  // the buyer's answers). It is shown on its deal, not as a chat bubble.
  const briefs = new Map<string, OrderBrief>();
  for (const m of messages) {
    if (m.senderType !== ORDER_SENDER_TYPE) continue;
    const b = parseOrderBrief(m.body);
    if (b) briefs.set(b.dealId, b);
  }
  const revisionTimes = messages
    .filter((m) => m.senderType === REVISION_SENDER_TYPE)
    .map((m) => m.createdAt.getTime());

  return NextResponse.json({
    thread: {
      id: thread.id,
      role,
      buyer,
      seller,
      listing: listing
        ? { ...listing, price: toNum(listing.price) }
        : null,
      mediation: { enabled: mediation.enabled, feeBps: mediation.feeBps },
    },
    messages: messages.filter((m) => m.senderType !== ORDER_SENDER_TYPE).map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderType: m.senderType,
      body: m.body,
      attachments: m.attachments,
      createdAt: m.createdAt.toISOString(),
    })),
    deals: deals.map((d, i) => ({
      id: d.id,
      status: d.status,
      amount: toNum(d.amount),
      adminMediated: d.adminMediated,
      adminFee: toNum(d.adminFee),
      heldAmount: toNum(d.heldAmount),
      proposedById: d.proposedById,
      autoReleaseAt: d.autoReleaseAt?.toISOString() ?? null,
      deliveredAt: d.deliveredAt?.toISOString() ?? null,
      releasedAt: d.releasedAt?.toISOString() ?? null,
      createdAt: d.createdAt.toISOString(),
      order: briefs.get(d.id) ?? null,
      // One active deal per thread at a time, so the revisions between this
      // deal opening and the next one (deals are newest-first) are its own.
      revisionsUsed: revisionTimes.filter(
        (t) => t >= d.createdAt.getTime() && (i === 0 || t < deals[i - 1].createdAt.getTime())
      ).length,
    })),
  });
}
