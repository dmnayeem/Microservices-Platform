import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contestPhase } from "@/lib/contests";

/** GET /api/contests — published contests (newest first) with the viewer's entry count. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.contest.findMany({
    where: { status: { in: ["PUBLISHED", "FINISHED"] } },
    orderBy: { startAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      description: true,
      coverImage: true,
      platforms: true,
      hashtag: true,
      startAt: true,
      endAt: true,
      votingEndsAt: true,
      status: true,
      prizes: true,
    },
  });
  const approved = await prisma.contestEntry.groupBy({
    by: ["contestId"],
    where: { status: "APPROVED", contestId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const entryCount = new Map((approved as unknown as Array<{ contestId: string; _count: { _all: number } }>).map((m) => [m.contestId, m._count._all]));
  const mine = await prisma.contestEntry.groupBy({
    by: ["contestId"],
    where: { userId: session.user.id, contestId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const myCount = new Map((mine as unknown as Array<{ contestId: string; _count: { _all: number } }>).map((m) => [m.contestId, m._count._all]));
  const now = Date.now();
  return NextResponse.json({
    contests: rows.map((c) => ({
      ...c,
      phase: contestPhase(c, now),
      entries: entryCount.get(c.id) ?? 0,
      myEntries: myCount.get(c.id) ?? 0,
    })),
  });
}
