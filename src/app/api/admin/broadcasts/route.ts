import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { emailBudget } from "@/lib/broadcast";

/**
 * The broadcast list, with live progress.
 *
 * This screen is the answer to "did it actually go?" — a question the old
 * fire-and-forget send could not answer at all, because the only trace it left
 * was an audit line stating an intention.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "notifications.send"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = Math.min(50, Number(request.nextUrl.searchParams.get("limit") ?? 25) || 25);

  const [rows, budget] = await Promise.all([
    prisma.broadcast.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        channels: true,
        important: true,
        style: true,
        targetKind: true,
        status: true,
        scheduledFor: true,
        audienceReady: true,
        totalRecipients: true,
        inAppSent: true,
        pushSent: true,
        emailSent: true,
        emailFailed: true,
        lastError: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
      },
    }),
    emailBudget(),
  ]);

  return NextResponse.json({
    broadcasts: rows,
    emailBudget: {
      cap: budget.cap,
      usedToday: budget.usedToday,
      remainingToday: budget.cap === 0 ? null : budget.remainingToday,
      perMinute: budget.perMinute,
    },
  });
}
