import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/spotlight — open auctions (current top bid, your bid), your recent
 * public posts to feature, and recent winners.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const [open, winners, posts, me] = await Promise.all([
    prisma.spotlightAuction.findMany({
      where: { status: "OPEN", biddingEndsAt: { gt: new Date() } },
      orderBy: { biddingEndsAt: "asc" },
      take: 10,
    }),
    prisma.spotlightAuction.findMany({
      where: { status: "AWARDED" },
      orderBy: { awardedAt: "desc" },
      take: 5,
      select: { id: true, title: true, winnerUserId: true, winnerBid: true, awardedAt: true },
    }),
    prisma.post.findMany({
      where: { userId, isPublic: true, isHidden: false },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, content: true, createdAt: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { pointsBalance: true } }),
  ]);
  const ids = open.map((a) => a.id);
  const [tops, mine, counts] = await Promise.all([
    prisma.spotlightBid.findMany({ where: { auctionId: { in: ids }, status: "HELD" }, select: { auctionId: true, amount: true, userId: true } }),
    prisma.spotlightBid.findMany({ where: { auctionId: { in: ids }, userId }, select: { auctionId: true, amount: true, status: true, postId: true } }),
    prisma.spotlightBid.groupBy({ by: ["auctionId"], where: { auctionId: { in: ids } }, _count: { _all: true } }),
  ]);
  const winnerUsers = await prisma.user.findMany({
    where: { id: { in: [...tops.map((t) => t.userId), ...winners.map((w) => w.winnerUserId).filter((x): x is string => !!x)] } },
    select: { id: true, name: true },
  });
  const name = new Map(winnerUsers.map((u) => [u.id, u.name ?? "A member"]));
  const bidders = new Map((counts as unknown as Array<{ auctionId: string; _count: { _all: number } }>).map((c) => [c.auctionId, c._count._all]));
  return NextResponse.json({
    balance: me?.pointsBalance ?? 0,
    auctions: open.map((a) => {
      const top = tops.find((t) => t.auctionId === a.id);
      const my = mine.find((m) => m.auctionId === a.id);
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        biddingEndsAt: a.biddingEndsAt,
        displayHours: a.displayHours,
        minBid: a.minBid,
        bidStep: a.bidStep,
        topBid: top?.amount ?? null,
        topIsMe: top?.userId === userId,
        topName: top ? name.get(top.userId) ?? "A member" : null,
        bidders: bidders.get(a.id) ?? 0,
        myBid: my ? { amount: my.amount, status: my.status, postId: my.postId } : null,
      };
    }),
    winners: winners.map((w) => ({ id: w.id, title: w.title, bid: w.winnerBid, at: w.awardedAt, name: w.winnerUserId ? name.get(w.winnerUserId) ?? "A member" : null })),
    posts: posts.map((p) => ({ id: p.id, text: (p.content ?? "").slice(0, 90), createdAt: p.createdAt })),
  });
}
