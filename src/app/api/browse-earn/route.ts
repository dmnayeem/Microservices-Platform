import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBrowseEarnConfig, getBrowseEarnToday } from "@/lib/browse-earn";

/** Browse & Earn state for the current user: config + today's progress + when
 *  the next reward interval can be claimed. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const [cfg, todayEarned, last] = await Promise.all([
    getBrowseEarnConfig(),
    getBrowseEarnToday(userId),
    prisma.browseEarnLog.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const remaining = Math.max(0, cfg.dailyCap - todayEarned);
  const nextInSec = last
    ? Math.max(
        0,
        Math.ceil(
          (last.createdAt.getTime() + cfg.tickSeconds * 1000 - Date.now()) / 1000
        )
      )
    : 0;

  return NextResponse.json({
    enabled: cfg.enabled,
    pointsPerTick: cfg.pointsPerTick,
    tickSeconds: cfg.tickSeconds,
    dailyCap: cfg.dailyCap,
    todayEarned,
    remaining,
    nextInSec,
  });
}
