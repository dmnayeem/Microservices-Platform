import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { DisputeStatus, NotificationType, TransactionType, TransactionStatus } from "@/generated/prisma";
import { getPointsPerUsd } from "@/lib/economy";
import { toNum, toNumOrNull } from "@/lib/money";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/admin/disputes/[id] - Get dispute details for admin
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "marketplace.disputes"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    // Get listing
    const listing = purchase
      ? await prisma.marketplaceListing.findUnique({
          where: { id: purchase.listingId },
          select: { id: true, title: true, images: true, sellerId: true, price: true },
        })
      : null;

    // Get buyer and seller info
    const [buyer, seller] = await Promise.all([
      purchase
        ? prisma.user.findUnique({
            where: { id: purchase.buyerId },
            select: { id: true, name: true, email: true, avatar: true },
          })
        : null,
      listing
        ? prisma.user.findUnique({
            where: { id: listing.sellerId },
            select: { id: true, name: true, email: true, avatar: true },
          })
        : null,
    ]);

    // Get messages
    const messages = await prisma.disputeMessage.findMany({
      where: { disputeId: id },
      orderBy: { createdAt: "asc" },
    });

    // Get sender info for messages
    const senderIds = [
      ...new Set(messages.filter((m) => m.senderType === "USER").map((m) => m.senderId)),
    ];
    const senders = await prisma.user.findMany({
      where: { id: { in: senderIds } },
      select: { id: true, name: true, avatar: true },
    });
    const senderMap = new Map(senders.map((s) => [s.id, s]));

    return NextResponse.json({
      dispute: {
        id: dispute.id,
        purchase: {
          id: purchase?.id || "",
          amount: toNum(purchase?.amount),
          fee: toNum(purchase?.fee),
          sellerAmount: toNum(purchase?.sellerAmount),
          listing: {
            id: listing?.id || "",
            title: listing?.title || "Unknown",
            price: toNum(listing?.price),
            image: listing?.images?.[0] || null,
          },
        },
        buyer: {
          id: buyer?.id || "",
          name: buyer?.name || "Unknown",
          email: buyer?.email || "",
          avatar: buyer?.avatar,
        },
        seller: {
          id: seller?.id || "",
          name: seller?.name || "Unknown",
          email: seller?.email || "",
          avatar: seller?.avatar,
        },
        initiator: {
          id: dispute.initiatorId,
          type: dispute.initiatorType,
        },
        reason: dispute.reason,
        description: dispute.description,
        evidence: dispute.evidence,
        status: dispute.status,
        resolution: dispute.resolution,
        resolvedAmount: toNumOrNull(dispute.resolvedAmount),
        assignedAdminId: dispute.assignedAdminId,
        adminNotes: dispute.adminNotes,
        createdAt: dispute.createdAt,
        resolvedAt: dispute.resolvedAt,
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

// POST /api/admin/disputes/[id] - Admin action on dispute (message, assign, resolve)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "marketplace.disputes"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, message, attachments, resolution, resolvedAmount, adminNotes, inFavorOf } = body;

    // Get dispute
    const dispute = await prisma.marketplaceDispute.findUnique({
      where: { id },
    });

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    // Get purchase and listing info
    const purchase = await prisma.marketplacePurchase.findUnique({
      where: { id: dispute.purchaseId },
    });

    const listing = purchase
      ? await prisma.marketplaceListing.findUnique({
          where: { id: purchase.listingId },
          select: { sellerId: true, title: true },
        })
      : null;

    switch (action) {
      case "message": {
        // Add admin message
        if (!message) {
          return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        const disputeMessage = await prisma.disputeMessage.create({
          data: {
            disputeId: id,
            senderId: session.user.id!,
            senderType: "ADMIN",
            message,
            attachments: attachments || [],
          },
        });

        // Notify both parties
        if (purchase && listing) {
          await Promise.all([
            prisma.notification.create({
              data: {
                userId: purchase.buyerId,
                type: NotificationType.SYSTEM,
                title: "Admin Response in Dispute",
                message: `Support admin responded in your dispute for "${listing.title}"`,
                data: { disputeId: id },
              },
            }),
            prisma.notification.create({
              data: {
                userId: listing.sellerId,
                type: NotificationType.SYSTEM,
                title: "Admin Response in Dispute",
                message: `Support admin responded in your dispute for "${listing.title}"`,
                data: { disputeId: id },
              },
            }),
          ]);
        }

        return NextResponse.json({
          success: true,
          message: {
            id: disputeMessage.id,
            sender: { id: session.user.id, name: "Support Admin", type: "ADMIN" },
            message: disputeMessage.message,
            attachments: disputeMessage.attachments,
            createdAt: disputeMessage.createdAt,
          },
        });
      }

      case "assign": {
        // Assign dispute to admin
        const updated = await prisma.marketplaceDispute.update({
          where: { id },
          data: {
            assignedAdminId: session.user.id!,
            status: DisputeStatus.IN_REVIEW,
          },
        });

        // Add system message
        await prisma.disputeMessage.create({
          data: {
            disputeId: id,
            senderId: "SYSTEM",
            senderType: "SYSTEM",
            message: `Dispute has been assigned to a support admin and is now under review.`,
          },
        });

        return NextResponse.json({
          success: true,
          message: "Dispute assigned successfully",
          status: updated.status,
        });
      }

      case "escalate": {
        // Escalate dispute
        const updated = await prisma.marketplaceDispute.update({
          where: { id },
          data: {
            status: DisputeStatus.ESCALATED,
            adminNotes: adminNotes || dispute.adminNotes,
          },
        });

        // Add system message
        await prisma.disputeMessage.create({
          data: {
            disputeId: id,
            senderId: "SYSTEM",
            senderType: "SYSTEM",
            message: `Dispute has been escalated for senior review.`,
          },
        });

        return NextResponse.json({
          success: true,
          message: "Dispute escalated successfully",
          status: updated.status,
        });
      }

      case "resolve": {
        // Resolve dispute
        if (!resolution) {
          return NextResponse.json({ error: "Resolution is required" }, { status: 400 });
        }
        if (!inFavorOf || !["BUYER", "SELLER"].includes(inFavorOf)) {
          return NextResponse.json({ error: "Must specify inFavorOf as BUYER or SELLER" }, { status: 400 });
        }

        const newStatus =
          inFavorOf === "BUYER" ? DisputeStatus.RESOLVED_BUYER : DisputeStatus.RESOLVED_SELLER;

        // Handle refund if resolving in favor of buyer
        const refundAmount = inFavorOf === "BUYER" && resolvedAmount ? resolvedAmount : 0;
        const pointsPerUsd = await getPointsPerUsd();

        await prisma.$transaction(async (tx) => {
          // Update dispute
          await tx.marketplaceDispute.update({
            where: { id },
            data: {
              status: newStatus,
              resolution,
              resolvedAmount: refundAmount,
              adminNotes: adminNotes || dispute.adminNotes,
              resolvedAt: new Date(),
            },
          });

          // If refund amount specified and resolving for buyer, process refund
          if (refundAmount > 0 && purchase) {
            // Credit buyer
            await tx.user.update({
              where: { id: purchase.buyerId },
              data: { pointsBalance: { increment: Math.round(refundAmount * pointsPerUsd) } },
            });

            // Create transaction record
            await tx.transaction.create({
              data: {
                userId: purchase.buyerId,
                type: TransactionType.REFUND,
                status: TransactionStatus.COMPLETED,
                points: Math.round(refundAmount * pointsPerUsd),
                amount: refundAmount,
                description: `Refund from dispute resolution for "${listing?.title}"`,
                reference: `dispute_refund_${id}`,
                metadata: { disputeId: id, purchaseId: purchase.id },
              },
            });
          }

          // Add system message
          await tx.disputeMessage.create({
            data: {
              disputeId: id,
              senderId: "SYSTEM",
              senderType: "SYSTEM",
              message: `Dispute has been resolved in favor of the ${inFavorOf.toLowerCase()}.${refundAmount > 0 ? ` $${refundAmount.toFixed(2)} has been refunded to the buyer.` : ""} Resolution: ${resolution}`,
            },
          });

          // Notify both parties
          if (purchase && listing) {
            await tx.notification.create({
              data: {
                userId: purchase.buyerId,
                type: NotificationType.SYSTEM,
                title: "Dispute Resolved",
                message: `Your dispute for "${listing.title}" has been resolved in favor of the ${inFavorOf.toLowerCase()}.${refundAmount > 0 ? ` You have received a $${refundAmount.toFixed(2)} refund.` : ""}`,
                data: { disputeId: id, inFavorOf, refundAmount },
              },
            });

            await tx.notification.create({
              data: {
                userId: listing.sellerId,
                type: NotificationType.SYSTEM,
                title: "Dispute Resolved",
                message: `Your dispute for "${listing.title}" has been resolved in favor of the ${inFavorOf.toLowerCase()}.`,
                data: { disputeId: id, inFavorOf },
              },
            });
          }
        });

        return NextResponse.json({
          success: true,
          message: "Dispute resolved successfully",
          status: newStatus,
          refundAmount,
        });
      }

      case "close": {
        // Close dispute without resolution
        await prisma.marketplaceDispute.update({
          where: { id },
          data: {
            status: DisputeStatus.CLOSED,
            resolution: resolution || "Dispute closed by admin",
            adminNotes: adminNotes || dispute.adminNotes,
            resolvedAt: new Date(),
          },
        });

        // Add system message
        await prisma.disputeMessage.create({
          data: {
            disputeId: id,
            senderId: "SYSTEM",
            senderType: "SYSTEM",
            message: `Dispute has been closed. ${resolution || ""}`,
          },
        });

        // Notify both parties
        if (purchase && listing) {
          await Promise.all([
            prisma.notification.create({
              data: {
                userId: purchase.buyerId,
                type: NotificationType.SYSTEM,
                title: "Dispute Closed",
                message: `Your dispute for "${listing.title}" has been closed.`,
                data: { disputeId: id },
              },
            }),
            prisma.notification.create({
              data: {
                userId: listing.sellerId,
                type: NotificationType.SYSTEM,
                title: "Dispute Closed",
                message: `Your dispute for "${listing.title}" has been closed.`,
                data: { disputeId: id },
              },
            }),
          ]);
        }

        return NextResponse.json({
          success: true,
          message: "Dispute closed successfully",
          status: DisputeStatus.CLOSED,
        });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    // Retry of a refund action reuses reference `dispute_refund_<id>` → P2002;
    // the refund already settled, so report success not a 500.
    if (isDuplicateLedgerError(error)) {
      return NextResponse.json({ success: true, duplicate: true });
    }
    console.error("Error processing dispute:", error);
    return NextResponse.json(
      { error: "Failed to process dispute" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/disputes/[id] - Update admin notes
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "marketplace.disputes"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { adminNotes } = body;

    const updated = await prisma.marketplaceDispute.update({
      where: { id },
      data: { adminNotes },
    });

    return NextResponse.json({
      success: true,
      adminNotes: updated.adminNotes,
    });
  } catch (error) {
    console.error("Error updating dispute:", error);
    return NextResponse.json(
      { error: "Failed to update dispute" },
      { status: 500 }
    );
  }
}
