import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Celebration popups (src/lib/celebration.ts) the user has not seen yet.
 * Oldest first, at most 5, and none older than 30 days — someone returning
 * after two months does not need a queue of stale confetti.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.notification.findMany({
    where: {
      userId: session.user.id,
      popup: true,
      popupSeenAt: null,
      createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
    },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true, data: true, createdAt: true },
  });
  const popups = rows
    .map((r) => ({ id: r.id, createdAt: r.createdAt, ...((r.data as { popup?: object } | null)?.popup ?? {}) }))
    .filter((p) => "kind" in p && "headline" in p);
  return NextResponse.json({ popups }, { headers: { "Cache-Control": "no-store" } });
}

/** Mark one popup seen. Only the owner's own; the bell's read state is untouched. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  if (typeof body.id !== "string" || !body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await prisma.notification.updateMany({
    where: { id: body.id, userId: session.user.id, popup: true, popupSeenAt: null },
    data: { popupSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
