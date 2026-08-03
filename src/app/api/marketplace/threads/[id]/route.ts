import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveThreadAccess } from "@/lib/marketplace-thread";
import type { UserRole } from "@/generated/prisma";
import { toNum } from "@/lib/money";
import { getMediationConfig } from "@/lib/marketplace-mediation";

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
      select: { id: true, title: true, images: true, price: true, status: true },
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
    messages: messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderType: m.senderType,
      body: m.body,
      attachments: m.attachments,
      createdAt: m.createdAt.toISOString(),
    })),
    deals: deals.map((d) => ({
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
    })),
  });
}
