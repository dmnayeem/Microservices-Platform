import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DisputeStatus, NotificationType } from "@/generated/prisma";
import { toNum, toNumOrNull } from "@/lib/money";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/marketplace/disputes/[id] - Get dispute details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get dispute
    const dispute = await prisma.marketplaceDispute.findUnique({
      where: { id },
    });

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    // Get purchase
    const purchase = await prisma.marketplacePurchase.findUnique({
      where: { id: dispute.purchaseId },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    // Get listing
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: purchase.listingId },
      select: { id: true, title: true, images: true, sellerId: true, price: true },
    });

    // Check authorization
    const isBuyer = purchase.buyerId === session.user.id;
    const isSeller = listing?.sellerId === session.user.id;

    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { error: "You are not authorized to view this dispute" },
        { status: 403 }
      );
    }

    // Get messages
    const messages = await prisma.disputeMessage.findMany({
      where: { disputeId: id },
      orderBy: { createdAt: "asc" },
    });

    // Get user info for message senders
    const senderIds = [
      ...new Set(messages.filter((m) => m.senderType === "USER").map((m) => m.senderId)),
    ];
    const senders = await prisma.user.findMany({
      where: { id: { in: senderIds } },
      select: { id: true, name: true, avatar: true },
    });
    const senderMap = new Map(senders.map((s) => [s.id, s]));

    // Get initiator info
    const initiator = await prisma.user.findUnique({
      where: { id: dispute.initiatorId },
      select: { id: true, name: true, avatar: true },
    });

    // Get other party info
    const otherPartyId = isBuyer ? listing?.sellerId : purchase.buyerId;
    const otherParty = otherPartyId
      ? await prisma.user.findUnique({
          where: { id: otherPartyId },
          select: { id: true, name: true, avatar: true },
        })
      : null;

    return NextResponse.json({
      dispute: {
        id: dispute.id,
        purchase: {
          id: purchase.id,
          amount: toNum(purchase.amount),
          listing: {
            id: listing?.id || "",
            title: listing?.title || "Unknown",
            price: toNum(listing?.price),
            image: listing?.images?.[0] || null,
          },
        },
        initiator: {
          id: dispute.initiatorId,
          name: initiator?.name || "Unknown",
          avatar: initiator?.avatar,
          type: dispute.initiatorType,
        },
        otherParty: {
          id: otherPartyId || "",
          name: otherParty?.name || "Unknown",
          avatar: otherParty?.avatar,
          type: dispute.initiatorType === "BUYER" ? "SELLER" : "BUYER",
        },
        reason: dispute.reason,
        description: dispute.description,
        evidence: dispute.evidence,
        status: dispute.status,
        resolution: dispute.resolution,
        resolvedAmount: toNumOrNull(dispute.resolvedAmount),
        createdAt: dispute.createdAt,
        resolvedAt: dispute.resolvedAt,
        myRole: isBuyer ? "BUYER" : "SELLER",
        isInitiator: dispute.initiatorId === session.user.id,
      },
      messages: messages.map((msg) => {
        const sender = senderMap.get(msg.senderId);
        return {
          id: msg.id,
          sender: {
            id: msg.senderId,
            name:
              msg.senderType === "SYSTEM"
                ? "System"
                : msg.senderType === "ADMIN"
                ? "Support Admin"
                : sender?.name || "Unknown",
            avatar: sender?.avatar,
            type: msg.senderType,
          },
          message: msg.message,
          attachments: msg.attachments,
          createdAt: msg.createdAt,
          isMe: msg.senderId === session.user.id,
        };
      }),
    });
  } catch (error) {
    console.error("Error fetching dispute:", error);
    return NextResponse.json(
      { error: "Failed to fetch dispute" },
      { status: 500 }
    );
  }
}

// POST /api/marketplace/disputes/[id] - Add message to dispute
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { message, attachments } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Get dispute
    const dispute = await prisma.marketplaceDispute.findUnique({
      where: { id },
    });

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    // Check if dispute is still open
    const closedStatuses: DisputeStatus[] = [
      DisputeStatus.CLOSED,
      DisputeStatus.RESOLVED_BUYER,
      DisputeStatus.RESOLVED_SELLER,
    ];
    if (closedStatuses.includes(dispute.status)) {
      return NextResponse.json(
        { error: "Cannot add messages to a resolved dispute" },
        { status: 400 }
      );
    }

    // Get purchase to check authorization
    const purchase = await prisma.marketplacePurchase.findUnique({
      where: { id: dispute.purchaseId },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    // Get listing
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: purchase.listingId },
      select: { sellerId: true, title: true },
    });

    const isBuyer = purchase.buyerId === session.user.id;
    const isSeller = listing?.sellerId === session.user.id;

    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { error: "You are not authorized to message in this dispute" },
        { status: 403 }
      );
    }

    // Create message
    const disputeMessage = await prisma.disputeMessage.create({
      data: {
        disputeId: id,
        senderId: session.user.id,
        senderType: "USER",
        message,
        attachments: attachments || [],
      },
    });

    // Notify the other party
    const otherPartyId = isBuyer ? listing?.sellerId : purchase.buyerId;
    if (otherPartyId) {
      await prisma.notification.create({
        data: {
          userId: otherPartyId,
          type: NotificationType.SYSTEM,
          title: "New Dispute Message",
          message: `New message in dispute for "${listing?.title || "order"}": "${message.substring(0, 100)}${message.length > 100 ? "..." : ""}"`,
          data: {
            disputeId: id,
            messageId: disputeMessage.id,
          },
        },
      });
    }

    // Get sender info
    const sender = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, avatar: true },
    });

    return NextResponse.json({
      message: {
        id: disputeMessage.id,
        sender: {
          id: sender?.id || session.user.id,
          name: sender?.name || "Unknown",
          avatar: sender?.avatar,
          type: "USER",
        },
        message: disputeMessage.message,
        attachments: disputeMessage.attachments,
        createdAt: disputeMessage.createdAt,
        isMe: true,
      },
    });
  } catch (error) {
    console.error("Error adding dispute message:", error);
    return NextResponse.json(
      { error: "Failed to add message" },
      { status: 500 }
    );
  }
}

// PATCH /api/marketplace/disputes/[id] - Add evidence to dispute
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { evidence } = body;

    if (!evidence || !Array.isArray(evidence)) {
      return NextResponse.json(
        { error: "Evidence must be an array of URLs" },
        { status: 400 }
      );
    }

    // Get dispute
    const dispute = await prisma.marketplaceDispute.findUnique({
      where: { id },
    });

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    // Check if dispute is still open
    const closedStatuses2: DisputeStatus[] = [
      DisputeStatus.CLOSED,
      DisputeStatus.RESOLVED_BUYER,
      DisputeStatus.RESOLVED_SELLER,
    ];
    if (closedStatuses2.includes(dispute.status)) {
      return NextResponse.json(
        { error: "Cannot add evidence to a resolved dispute" },
        { status: 400 }
      );
    }

    // Get purchase to check authorization
    const purchase = await prisma.marketplacePurchase.findUnique({
      where: { id: dispute.purchaseId },
    });

    if (!purchase) {
      return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
    }

    // Get listing
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: purchase.listingId },
      select: { sellerId: true },
    });

    const isBuyer = purchase.buyerId === session.user.id;
    const isSeller = listing?.sellerId === session.user.id;

    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { error: "You are not authorized to add evidence to this dispute" },
        { status: 403 }
      );
    }

    // Update dispute evidence
    const updatedDispute = await prisma.marketplaceDispute.update({
      where: { id },
      data: {
        evidence: [...dispute.evidence, ...evidence],
      },
    });

    // Add system message about new evidence
    await prisma.disputeMessage.create({
      data: {
        disputeId: id,
        senderId: "SYSTEM",
        senderType: "SYSTEM",
        message: `${isBuyer ? "Buyer" : "Seller"} added ${evidence.length} new evidence file(s).`,
      },
    });

    return NextResponse.json({
      evidence: updatedDispute.evidence,
      message: "Evidence added successfully",
    });
  } catch (error) {
    console.error("Error adding evidence:", error);
    return NextResponse.json(
      { error: "Failed to add evidence" },
      { status: 500 }
    );
  }
}
