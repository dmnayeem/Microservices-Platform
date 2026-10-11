import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { contestAdminGuard } from "@/lib/contests-admin";
import { finalizeContest, payContest } from "@/lib/contests-server";

/**
 * POST — pick the winners and pay (only after voting ends; once). On a
 * finished contest it re-runs the payouts, which skip anyone already paid.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await contestAdminGuard("community.manage");
  if ("res" in g) return g.res;
  const { id } = await params;
  const existing = await prisma.contest.findUnique({ where: { id }, select: { status: true, title: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "FINISHED") {
    const paid = await payContest(id);
    return NextResponse.json({ ok: true, paid, retried: true });
  }
  const r = await finalizeContest(id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  await writeAudit({
    actorId: g.userId,
    action: "CONTEST_FINALIZED",
    entity: "Contest",
    entityId: id,
    summary: `Finalized contest "${existing.title}" — ${r.paid} paid`,
  });
  return NextResponse.json(r);
}
