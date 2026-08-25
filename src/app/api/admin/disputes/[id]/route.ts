import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { DisputeStatus, NotificationType, TransactionType, TransactionStatus } from "@/generated/prisma";
import { toNum, toNumOrNull } from "@/lib/money";
import { reverseAffiliateCommission } from "@/lib/affiliate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Cents precision for the money split. `round2` in `@/lib/money` returns a
 *  Decimal; these figures stay plain numbers all the way to Prisma. */
const money2 = (n: number) => Math.round(n * 100) / 100;

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

        // Never refund more than was actually paid. `resolvedAmount` comes
        // straight off the admin form, so a mistyped figure used to mint money
        // outright — rejected rather than silently capped, so the admin sees the
        // typo instead of wondering why the refund was smaller than they entered.
        const paidAmount = toNum(purchase?.amount);
        if (refundAmount > 0) {
          if (!purchase) {
            return NextResponse.json(
              { error: "Cannot refund: the purchase behind this dispute no longer exists" },
              { status: 400 }
            );
          }
          if (!Number.isFinite(refundAmount) || refundAmount < 0) {
            return NextResponse.json({ error: "Invalid refund amount" }, { status: 400 });
          }
          if (refundAmount > paidAmount) {
            return NextResponse.json(
              { error: `Refund cannot exceed the amount paid (${usd(paidAmount)})` },
              { status: 400 }
            );
          }
        }

        // The affiliate commission on a marketplace sale is paid OUT of the
        // seller's cut (`api/marketplace/[id]/checkout/route.ts`), so the seller
        // actually banked `sellerAmount - affiliateAmount`. Clawing back the
        // full `sellerAmount` would take money the seller never received.
        const commission = purchase
          ? await prisma.affiliateCommission.findUnique({
              where: {
                sourceType_orderRef: { sourceType: "MARKETPLACE", orderRef: purchase.id },
              },
              select: { affiliateUserId: true, commissionAmount: true },
            })
          : null;
        const affiliateAmount = toNum(commission?.commissionAmount);
        const sellerBanked = Math.max(0, toNum(purchase?.sellerAmount) - affiliateAmount);
        const platformFee = toNum(purchase?.fee);

        // Partial refunds unwind each party proportionally; a full refund
        // unwinds everything exactly.
        const ratio = paidAmount > 0 ? Math.min(1, refundAmount / paidAmount) : 0;
        const sellerOwed = money2(sellerBanked * ratio);
        const feeReversed = money2(platformFee * ratio);
        const sellerId = listing?.sellerId;

        await prisma.$transaction(async (tx) => {
          // CAS on the dispute. Resolving is what moves the money, so two admins
          // clicking Resolve at the same time — or one double-clicking — must not
          // both pay. Only an unresolved dispute matches.
          const claimed = await tx.marketplaceDispute.updateMany({
            where: {
              id,
              status: {
                in: [DisputeStatus.OPEN, DisputeStatus.IN_REVIEW, DisputeStatus.ESCALATED],
              },
            },
            data: {
              status: newStatus,
              resolution,
              resolvedAmount: refundAmount,
              adminNotes: adminNotes || dispute.adminNotes,
              resolvedAt: new Date(),
            },
          });
          if (claimed.count === 0) throw new Error("DISPUTE_ALREADY_RESOLVED");

          // If refund amount specified and resolving for buyer, process refund
          if (refundAmount > 0 && purchase) {
            // Refund the buyer in CASH. Marketplace purchases debit
            // `cashBalance`, so paying the refund in points handed the buyer a
            // different currency than they spent — converted at whatever
            // `pointsPerUsd` happened to be on the day of the dispute, which is
            // not necessarily the rate on the day of the sale.
            await tx.user.update({
              where: { id: purchase.buyerId },
              data: { cashBalance: { increment: refundAmount } },
            });
            // `totalEarnings` is deliberately untouched — getting your own money
            // back is not lifetime earnings.
            await tx.transaction.create({
              data: {
                userId: purchase.buyerId,
                type: TransactionType.REFUND,
                status: TransactionStatus.COMPLETED,
                points: 0,
                amount: refundAmount,
                description: `Refund from dispute resolution for "${listing?.title}"`,
                reference: `dispute_refund_${id}`,
                metadata: {
                  disputeId: id,
                  purchaseId: purchase.id,
                  paidAmount,
                  ratio,
                },
              },
            });

            // Claw the sale back off the seller. Without this the platform funded
            // the refund on its own while the seller kept the proceeds — the
            // house paid for the dispute twice over. Clamped to the seller's
            // balance so a spent-out seller cannot be driven negative; the
            // unrecoverable remainder is recorded rather than hidden.
            if (sellerId && sellerOwed > 0) {
              const sellerRow = await tx.user.findUnique({
                where: { id: sellerId },
                select: { cashBalance: true },
              });
              const debit = Math.min(toNum(sellerRow?.cashBalance), sellerOwed);
              if (debit > 0) {
                await tx.user.update({
                  where: { id: sellerId },
                  data: { cashBalance: { decrement: debit } },
                });
              }
              await tx.transaction.create({
                data: {
                  userId: sellerId,
                  type: TransactionType.REFUND,
                  status: TransactionStatus.COMPLETED,
                  points: 0,
                  amount: -debit,
                  description: `Sale reversed by dispute — "${listing?.title}"`,
                  reference: `dispute_seller_clawback_${id}`,
                  metadata: {
                    disputeId: id,
                    purchaseId: purchase.id,
                    owed: sellerOwed,
                    clawedBack: debit,
                    shortfall: money2(sellerOwed - debit),
                  },
                },
              });
            }

            // Give back the platform's commission on the part of the sale being
            // unwound. Its own row so the finance console's revenue figure moves
            // with the refund instead of overstating income forever.
            if (feeReversed > 0 && sellerId) {
              await tx.transaction.create({
                data: {
                  userId: sellerId,
                  type: TransactionType.ADMIN_FEE,
                  status: TransactionStatus.COMPLETED,
                  points: 0,
                  amount: -feeReversed,
                  description: `Marketplace fee reversed by dispute — "${listing?.title}"`,
                  reference: `dispute_fee_reversal_${id}`,
                  metadata: {
                    disputeId: id,
                    purchaseId: purchase.id,
                    originalFee: platformFee,
                    reversed: feeReversed,
                  },
                },
              });
            }

            // Mark the purchase so it cannot be refunded again through another
            // dispute on the same order.
            await tx.marketplacePurchase.updateMany({
              where: { id: purchase.id, status: { not: "REFUNDED" } },
              data: { status: ratio >= 1 ? "REFUNDED" : "PARTIALLY_REFUNDED" },
            });
          }

          // Add system message
          await tx.disputeMessage.create({
            data: {
              disputeId: id,
              senderId: "SYSTEM",
              senderType: "SYSTEM",
              message: `Dispute has been resolved in favor of the ${inFavorOf.toLowerCase()}.${refundAmount > 0 ? ` ${usd(refundAmount)} has been refunded to the buyer.` : ""} Resolution: ${resolution}`,
            },
          });

          // Notify both parties
          if (purchase && listing) {
            await tx.notification.create({
              data: {
                userId: purchase.buyerId,
                type: NotificationType.SYSTEM,
                title: "Dispute Resolved",
                message: `Your dispute for "${listing.title}" has been resolved in favor of the ${inFavorOf.toLowerCase()}.${refundAmount > 0 ? ` You have received a ${usd(refundAmount)} refund.` : ""}`,
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

        // Reverse the affiliate's cut too, but only on a FULL refund — the
        // helper is all-or-nothing and idempotent per (sourceType, orderRef), so
        // calling it on a partial refund would claw back more than was unwound.
        // On a partial refund the affiliate keeps their commission and the
        // shortfall is visible in the seller clawback metadata.
        if (purchase && commission && ratio >= 1) {
          await reverseAffiliateCommission("MARKETPLACE", purchase.id);
        }

        return NextResponse.json({
          success: true,
          message: "Dispute resolved successfully",
          status: newStatus,
          refundAmount,
          sellerClawback: sellerOwed,
          feeReversed,
          affiliateReversed: commission && ratio >= 1 ? affiliateAmount : 0,
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
    // The status CAS lost — another admin (or a double-click) already resolved
    // this dispute. The transaction rolled back, so nothing was paid twice.
    if (error instanceof Error && error.message === "DISPUTE_ALREADY_RESOLVED") {
      return NextResponse.json(
        { error: "This dispute has already been resolved." },
        { status: 409 }
      );
    }
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
