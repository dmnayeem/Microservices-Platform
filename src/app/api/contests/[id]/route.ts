import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contestPhase } from "@/lib/contests";
import { contestStandings } from "@/lib/contests-server";

/** GET /api/contests/[id] — the contest, its gallery, the viewer's entries and vote. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const contest = await prisma.contest.findFirst({
    where: { id, status: { in: ["PUBLISHED", "FINISHED"] } },
  });
  if (!contest) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [entries, mine, myVote, standings, me] = await Promise.all([
    prisma.contestEntry.findMany({
      where: { contestId: id, status: "APPROVED" },
      orderBy: contest.status === "FINISHED" ? [{ rank: "asc" }, { votes: "desc" }] : [{ votes: "desc" }, { createdAt: "asc" }],
      take: 200,
      select: { id: true, userId: true, url: true, platform: true, caption: true, votes: true, rank: true, prizePoints: true },
    }),
    prisma.contestEntry.findMany({
      where: { contestId: id, userId: session.user.id },
      select: { id: true, url: true, status: true, rejectReason: true, votes: true, rank: true, prizePoints: true, linkCheck: true },
    }),
    prisma.contestVote.findUnique({ where: { contestId_userId: { contestId: id, userId: session.user.id } }, select: { entryId: true } }),
    contest.status === "FINISHED" ? Promise.resolve([]) : contestStandings(id),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { level: true } }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(entries.map((e) => e.userId))] } },
    select: { id: true, name: true, username: true, avatar: true, isBlueVerified: true, verifiedBadgeStyle: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  // Live position while the contest runs (by the same score as the final).
  const livePos = new Map(standings.map((s, i) => [s.entryId, i + 1]));
  return NextResponse.json({
    contest: { ...contest, phase: contestPhase(contest, Date.now()) },
    myLevel: me?.level ?? 0,
    entries: entries.map((e) => ({
      ...e,
      position: e.rank ?? livePos.get(e.id) ?? null,
      user: byId.get(e.userId) ?? null,
      mine: e.userId === session.user!.id,
    })),
    mine,
    myVoteEntryId: myVote?.entryId ?? null,
  });
}
