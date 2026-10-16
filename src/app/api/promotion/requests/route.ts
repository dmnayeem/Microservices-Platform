import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/promotion/requests?kind=course|listing&ids=a,b,c — the caller's own
 * latest promotion request per item, for the Promote button: "Waiting for
 * review", or the reason it was rejected / cancelled. Approved requests are
 * not returned (the item's featuredUntil already shows those).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const kind = sp.get("kind") === "course" ? "COURSE" : sp.get("kind") === "listing" ? "LISTING" : null;
  if (!kind) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  const ids = [...new Set((sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ states: {} });

  const rows = await prisma.promotionRequest.findMany({
    where: {
      userId,
      kind,
      ...(kind === "COURSE" ? { courseId: { in: ids } } : { listingId: { in: ids } }),
    },
    orderBy: { createdAt: "desc" },
    select: { courseId: true, listingId: true, status: true, rejectReason: true, createdAt: true },
    take: 500,
  });

  const states: Record<string, { status: string; reason: string | null; at: string }> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    const itemId = kind === "COURSE" ? r.courseId : r.listingId;
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId); // newest first: only the latest request per item counts
    if (r.status === "APPROVED") continue;
    states[itemId] = { status: r.status, reason: r.rejectReason, at: r.createdAt.toISOString() };
  }
  return NextResponse.json({ states });
}
