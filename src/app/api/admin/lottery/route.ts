import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageLottery, canViewLottery } from "@/lib/lottery-access";
import { prisma } from "@/lib/prisma";
import {
  lotteryCreateSchema,
  lotteryConfigError,
  lotteryData,
} from "@/lib/lottery-admin";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await canViewLottery(session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status");
    const lotteries = await prisma.lottery.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { drawDate: "desc" },
      include: {
        _count: { select: { tickets: true } },
        settlement: true,
      },
    });

    return NextResponse.json({ lotteries });
  } catch (error) {
    console.error("Error fetching lotteries:", error);
    return NextResponse.json(
      { error: "Failed to fetch lotteries" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await canManageLottery(session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const v = lotteryCreateSchema.safeParse(body);
    if (!v.success) {
      return NextResponse.json(
        { error: "Invalid input", details: v.error.issues },
        { status: 400 }
      );
    }
    const configErr = lotteryConfigError(v.data);
    if (configErr) return NextResponse.json({ error: configErr }, { status: 400 });

    if (v.data.rolloverTargetId) {
      const target = await prisma.lottery.findUnique({
        where: { id: v.data.rolloverTargetId },
        select: { id: true, status: true, drawDate: true },
      });
      if (!target) {
        return NextResponse.json(
          { error: "The rollover target lottery no longer exists." },
          { status: 400 }
        );
      }
      if (target.drawDate <= new Date(v.data.drawDate)) {
        return NextResponse.json(
          { error: "The rollover target must draw AFTER this lottery." },
          { status: 400 }
        );
      }
    }

    // A lottery whose sales window has already opened starts ACTIVE. One that
    // hasn't stays UPCOMING until an admin activates it — nothing auto-promotes
    // it, so a future-dated lottery needs the Activate button.
    const status = new Date(v.data.startDate) <= new Date() ? "ACTIVE" : "UPCOMING";

    const lottery = await prisma.lottery.create({
      data: { ...lotteryData(v.data), status } as never,
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "LOTTERY_CREATED",
        entity: "Lottery",
        entityId: lottery.id,
        newData: {
          title: lottery.title,
          prizeMode: lottery.prizeMode,
          ticketPrice: lottery.ticketPrice,
        },
      },
    });

    return NextResponse.json({
      success: true,
      lottery,
      message: "Lottery created successfully",
    });
  } catch (error) {
    console.error("Error creating lottery:", error);
    return NextResponse.json(
      { error: "Failed to create lottery" },
      { status: 500 }
    );
  }
}
