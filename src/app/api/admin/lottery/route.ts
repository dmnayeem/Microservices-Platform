import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

interface Prize {
  position: number;
  amount: number;
  description: string;
}

interface CreateLotteryBody {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  drawDate: string;
  ticketPrice: number;
  maxTickets?: number | null;
  maxTicketsPerUser: number;
  prizes: Prize[];
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await can(session.user.id, "settings.view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    const lotteries = await prisma.lottery.findMany({
      where,
      orderBy: { drawDate: "desc" },
      include: {
        _count: {
          select: { tickets: true },
        },
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

    if (!(await can(session.user.id, "settings.edit"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body: CreateLotteryBody = await request.json();
    const {
      title,
      description,
      startDate,
      endDate,
      drawDate,
      ticketPrice,
      maxTickets,
      maxTicketsPerUser,
      prizes,
    } = body;

    // Validation
    if (!title || !startDate || !endDate || !drawDate || !ticketPrice) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!prizes || prizes.length === 0) {
      return NextResponse.json(
        { error: "At least one prize is required" },
        { status: 400 }
      );
    }

    // Determine initial status based on dates
    const now = new Date();
    const start = new Date(startDate);
    let status: "UPCOMING" | "ACTIVE" = "UPCOMING";
    if (start <= now) {
      status = "ACTIVE";
    }

    const lottery = await prisma.lottery.create({
      data: {
        title,
        description: description || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        drawDate: new Date(drawDate),
        ticketPrice,
        maxTickets: maxTickets || null,
        maxTicketsPerUser,
        prizes: prizes as unknown as object,
        status,
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
