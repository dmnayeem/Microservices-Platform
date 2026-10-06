import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNumOrNull } from "@/lib/money";

// GET /api/admin/offerwall/completions — the offerwall review queue: every
// PENDING completion (proof submissions awaiting review, held postback credits,
// and credits held because the account was not ACTIVE). Oldest first.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offerwalls.view")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  type Row = {
    id: string; userId: string; offerId: string; points: number; payoutUsd: unknown;
    proofImages: string[]; txid: string | null; heldUntil: Date | null;
    createdAt: Date; updatedAt: Date; offer: { title: string; completionMode: string };
  };
  const rows = (await prisma.offerwallCompletion.findMany({
    where: { status: "PENDING" },
    orderBy: { updatedAt: "asc" },
    take: 200,
    select: {
      id: true, userId: true, offerId: true, points: true, payoutUsd: true, proofImages: true,
      txid: true, heldUntil: true, createdAt: true, updatedAt: true,
      offer: { select: { title: true, completionMode: true } },
    },
  })) as unknown as Row[];
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
    select: { id: true, name: true, email: true, username: true, status: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    completions: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      user: byId.get(r.userId) ?? null,
      offerId: r.offerId,
      offerTitle: r.offer.title,
      completionMode: r.offer.completionMode,
      points: r.points,
      payoutUsd: toNumOrNull(r.payoutUsd as never),
      proofImages: r.proofImages,
      txid: r.txid,
      heldUntil: r.heldUntil?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}
