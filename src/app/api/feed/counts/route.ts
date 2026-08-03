import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/feed/counts — live like/comment counts for the posts currently on
// screen, so others' likes/comments update in place without a reload. Bounded to
// the visible window (≤50 ids) and a single indexed primary-key `in` read — far
// lighter than per-post polling or SSE. The global "new activity" pill still
// comes from the cheaper shared /api/feed/pulse aggregate.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let ids: string[] = [];
  try {
    const body = await request.json();
    ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    ids = [];
  }
  if (ids.length === 0) return NextResponse.json({ counts: [] });
  ids = ids.slice(0, 50);

  const rows = await prisma.post.findMany({
    where: { id: { in: ids } },
    select: { id: true, likesCount: true, commentsCount: true },
  });
  return NextResponse.json({ counts: rows });
}
