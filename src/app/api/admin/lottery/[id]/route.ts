import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { drawLottery } from "@/lib/lottery";
import { inngest, EVENTS } from "@/lib/inngest/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!hasPermission(adminRole, "settings.view")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const lottery = await prisma.lottery.findUnique({
      where: { id },
      include: {
        tickets: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!lottery) {
      return NextResponse.json({ error: "Lottery not found" }, { status: 404 });
    }

    return NextResponse.json({ lottery });
  } catch (error) {
    console.error("Error fetching lottery:", error);
    return NextResponse.json(
      { error: "Failed to fetch lottery" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminRole = session.user.role as UserRole | undefined;
    if (!hasPermission(adminRole, "settings.edit")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    const lottery = await prisma.lottery.findUnique({
      where: { id },
      include: {
        tickets: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!lottery) {
      return NextResponse.json({ error: "Lottery not found" }, { status: 404 });
    }

    if (action === "activate") {
      if (lottery.status !== "UPCOMING") {
        return NextResponse.json(
          { error: "Only upcoming lotteries can be activated" },
          { status: 400 }
        );
      }

      const updatedLottery = await prisma.lottery.update({
        where: { id },
        data: { status: "ACTIVE" },
      });

      // Schedule the draw at the exact drawDate via Inngest.
      void inngest.send({
        name: EVENTS.LOTTERY_ACTIVATED,
        data: { lotteryId: id, drawDate: updatedLottery.drawDate.toISOString() },
      });

      return NextResponse.json({
        success: true,
        lottery: updatedLottery,
        message: "Lottery activated successfully",
      });
    }

    if (action === "cancel") {
      if (lottery.status === "COMPLETED" || lottery.status === "CANCELLED") {
        return NextResponse.json(
          { error: "Cannot cancel a completed or already cancelled lottery" },
          { status: 400 }
        );
      }

      // Refund all ticket purchases
      const refundPromises = lottery.tickets.map((ticket) =>
        prisma.user.update({
          where: { id: ticket.userId },
          data: {
            pointsBalance: { increment: lottery.ticketPrice },
          },
        })
      );

      // Create refund notifications
      const notificationPromises = lottery.tickets.map((ticket) =>
        prisma.notification.create({
          data: {
            userId: ticket.userId,
            type: "LOTTERY",
            title: "Lottery Cancelled - Refund",
            message: `The lottery "${lottery.title}" has been cancelled. Your ${lottery.ticketPrice} points have been refunded.`,
            data: {
              lotteryId: id,
              ticketId: ticket.id,
              refundAmount: lottery.ticketPrice,
            },
          },
        })
      );

      // Update lottery status
      await Promise.all([
        prisma.lottery.update({
          where: { id },
          data: { status: "CANCELLED" },
        }),
        ...refundPromises,
        ...notificationPromises,
      ]);

      return NextResponse.json({
        success: true,
        message: `Lottery cancelled. ${lottery.tickets.length} ticket(s) refunded.`,
      });
    }

    if (action === "draw") {
      const result = await drawLottery(id);
      if (!result.ok) {
        const message =
          result.reason === "not_active"
            ? "Only active lotteries can be drawn"
            : result.reason === "no_tickets"
              ? "Cannot draw winners with no tickets sold"
              : result.reason === "no_prizes"
                ? "This lottery has no prize tiers configured"
                : "Lottery not found";
        return NextResponse.json({ error: message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        winners: result.winners,
        message: `Draw completed. ${result.winners.length} winner(s) selected.`,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error updating lottery:", error);
    return NextResponse.json(
      { error: "Failed to update lottery" },
      { status: 500 }
    );
  }
}
