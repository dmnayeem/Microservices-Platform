import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma, safeRead } from "@/lib/prisma";

/**
 * The two numbers the app header polls: points balance and unread-notification
 * count. Two indexed queries, nothing else.
 *
 * This exists because the header used to poll `/api/notifications` **and**
 * `/api/wallet` every 30 seconds on every page — about 11 queries, including two
 * aggregates over `Transaction` (one of the fastest-growing tables) — to render
 * a number and a dot. Multiplied by every signed-in user with a tab open, that
 * was the platform's largest source of steady-state database load, paid whether
 * or not anyone was doing anything.
 *
 * The notification LIST is no longer fetched on the timer; the header pulls it
 * when the dropdown is actually opened.
 *
 * Not cached: `pointsBalance` is money, and a stale balance is a support ticket.
 * Both reads are cheap and indexed, which is the point.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const [user, unreadCount] = await Promise.all([
    safeRead(
      prisma.user.findUnique({
        where: { id: userId },
        select: { pointsBalance: true },
      }),
      null,
      "header:points"
    ),
    safeRead(
      prisma.notification.count({ where: { userId, isRead: false } }),
      0,
      "header:unread"
    ),
  ]);

  return NextResponse.json({
    points: user?.pointsBalance ?? 0,
    unreadCount,
  });
}
