import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/offerwall/history — the user's offer completions (newest first).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.offerwallCompletion.findMany({
    where: { userId: session.user.id, status: { not: "STARTED" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { offer: { select: { title: true } } },
  });

  const items = (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: r.id,
    title: (r.offer as { title?: string } | null)?.title ?? "Offer",
    points: r.points,
    status: r.status,
    createdAt: r.createdAt,
    creditedAt: r.creditedAt,
  }));
  return NextResponse.json({ items });
}
