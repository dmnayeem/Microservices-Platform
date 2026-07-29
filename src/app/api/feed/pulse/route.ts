import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/feed/pulse — the single "is there new feed activity?" signal for the
// live "New posts" pill. Returns the max lastActivityAt across the organic feed,
// which strictly increases on ANY new comment (comment-create bumps it to now())
// or new post. The client compares this against the value it got from its last
// /api/feed load; if it's newer, something resurfaced → show the pill.
//
// Deliberately cheap + cache-shared (ttl 10s) so millions of pollers collapse to
// one indexed aggregate read — far lighter than per-connection SSE.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agg = await prisma.post.aggregate({
    where: {
      isPublic: true,
      isHidden: false,
      isAnnouncement: false,
      isPromoted: false,
    },
    _max: { lastActivityAt: true },
    cacheStrategy: { ttl: 10, swr: 20 },
  });

  return NextResponse.json({
    latestActivityAt: agg._max.lastActivityAt ?? null,
  });
}
