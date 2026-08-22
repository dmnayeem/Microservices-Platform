import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageLottery, canViewLottery } from "@/lib/lottery-access";
import { prisma } from "@/lib/prisma";
import { drawLottery, cancelLottery, previewDraw } from "@/lib/lottery";
import {
  lotteryUpdateSchema,
  lotteryConfigError,
  lotteryData,
  frozenFieldError,
} from "@/lib/lottery-admin";
import { inngest, EVENTS } from "@/lib/inngest/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await canViewLottery(session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const lottery = await prisma.lottery.findUnique({
      where: { id },
      include: {
        settlement: true,
        tickets: {
          include: { user: { select: { id: true, name: true, email: true } } },
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

/**
 * Edit a lottery.
 *
 * The admin form has always sent this request; the handler simply did not
 * exist, so a lottery could never be corrected after creation. Once tickets are
 * sold the economics freeze — see `frozenFieldError`.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await canManageLottery(session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const v = lotteryUpdateSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }

    const existing = await prisma.lottery.findUnique({
      where: { id },
      include: { _count: { select: { tickets: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Lottery not found" }, { status: 404 });
    }
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      return NextResponse.json(
        { error: "This lottery has already finished and can no longer be edited." },
        { status: 400 }
      );
    }

    const frozen = frozenFieldError(
      v.data,
      existing._count.tickets,
      existing.drawDate
    );
    if (frozen) return NextResponse.json({ error: frozen }, { status: 400 });

    // Validate the MERGED config — a partial update can break a rule that the
    // incoming fields alone look fine against.
    const merged = {
      ...v.data,
      startDate: v.data.startDate ?? existing.startDate.toISOString(),
      endDate: v.data.endDate ?? existing.endDate.toISOString(),
      drawDate: v.data.drawDate ?? existing.drawDate.toISOString(),
      prizeMode: v.data.prizeMode ?? existing.prizeMode,
      prizes: v.data.prizes ?? (existing.prizes as never),
      prizeTiers: v.data.prizeTiers ?? (existing.prizeTiers as never),
      minTickets: v.data.minTickets ?? existing.minTickets,
      maxTickets: v.data.maxTickets ?? existing.maxTickets,
      shortfallAction: v.data.shortfallAction ?? existing.shortfallAction,
      rolloverTargetId: v.data.rolloverTargetId ?? existing.rolloverTargetId,
      poolSeedPoints: v.data.poolSeedPoints ?? existing.poolSeedPoints,
      poolCapPoints: v.data.poolCapPoints ?? existing.poolCapPoints,
    };
    const configErr = lotteryConfigError(merged);
    if (configErr) return NextResponse.json({ error: configErr }, { status: 400 });

    const lottery = await prisma.lottery.update({
      where: { id },
      data: lotteryData(v.data) as never,
    });

    // The scheduled draw was pinned to the OLD drawDate at activation time.
    // Re-arm it, and note `drawLottery({requireDue:true})` refuses an early
    // firing of the stale timer regardless.
    if (v.data.drawDate && lottery.status === "ACTIVE") {
      void inngest.send({
        name: EVENTS.LOTTERY_ACTIVATED,
        data: { lotteryId: id, drawDate: lottery.drawDate.toISOString() },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "LOTTERY_UPDATED",
        entity: "Lottery",
        entityId: id,
        oldData: { title: existing.title, drawDate: existing.drawDate },
        newData: { title: lottery.title, drawDate: lottery.drawDate },
      },
    });

    return NextResponse.json({ success: true, lottery });
  } catch (error) {
    console.error("Error updating lottery:", error);
    return NextResponse.json(
      { error: "Failed to update lottery" },
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
    if (!(await canManageLottery(session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { action } = await request.json();

    if (action === "preview") {
      const preview = await previewDraw(id);
      if (!preview) {
        return NextResponse.json({ error: "Lottery not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, preview });
    }

    if (action === "activate") {
      // CAS on status — two admins clicking Activate must not both schedule a
      // draw, or the same lottery gets two Inngest timers.
      const claim = await prisma.lottery.updateMany({
        where: { id, status: "UPCOMING" },
        data: { status: "ACTIVE" },
      });
      if (claim.count === 0) {
        return NextResponse.json(
          { error: "Only upcoming lotteries can be activated" },
          { status: 400 }
        );
      }
      const updated = await prisma.lottery.findUniqueOrThrow({ where: { id } });
      void inngest.send({
        name: EVENTS.LOTTERY_ACTIVATED,
        data: { lotteryId: id, drawDate: updated.drawDate.toISOString() },
      });
      return NextResponse.json({
        success: true,
        lottery: updated,
        message: "Lottery activated successfully",
      });
    }

    if (action === "cancel") {
      // Delegated: the old inline version was an unbounded Promise.all with no
      // transaction and no status re-check, so a double-click double-refunded.
      const result = await cancelLottery(id);
      if (!result.ok) {
        const message =
          result.reason === "not_found"
            ? "Lottery not found"
            : result.reason === "already_drawn"
              ? "This lottery has already been drawn — winners were paid, so it can't be cancelled."
              : "Couldn't cancel the lottery. Nothing was changed.";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "LOTTERY_CANCELLED",
          entity: "Lottery",
          entityId: id,
          newData: { tickets: result.tickets, refunded: result.refunded },
        },
      });
      return NextResponse.json({
        success: true,
        message: result.tickets === 0
          ? "Lottery cancelled. There were no tickets to refund."
          : `Lottery cancelled. ${result.tickets} ticket(s) refunded (${result.refunded.toLocaleString()} points).${result.resumed ? " (Finished an interrupted refund run.)" : ""}`,
      });
    }

    if (action === "draw") {
      const result = await drawLottery(id);
      if (!result.ok) {
        const message =
          result.reason === "not_active"
            ? "Only active lotteries can be drawn"
            : result.reason === "no_prizes"
              ? "This lottery has no prizes configured"
              : result.reason === "not_due"
                ? "This lottery isn't due to be drawn yet"
                : result.reason === "not_found"
                  ? "Lottery not found"
                  : "The draw failed. Nothing was paid out — check the server logs.";
        return NextResponse.json({ error: message }, { status: 400 });
      }

      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "LOTTERY_DRAWN",
          entity: "Lottery",
          entityId: id,
          newData: { outcome: result.outcome, winners: result.winners.length },
        },
      });

      const message =
        result.outcome === "DRAWN"
          ? `Draw completed. ${result.winners.length} winner(s) selected.`
          : result.outcome === "REFUNDED"
            ? "Minimum tickets weren't reached — every ticket was refunded."
            : result.outcome === "ROLLED_OVER"
              ? "Minimum tickets weren't reached — the pot rolled over to the next draw."
              : "Nobody bought a ticket, so the lottery was closed with no payout.";

      return NextResponse.json({
        success: true,
        outcome: result.outcome,
        winners: result.winners,
        message,
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
