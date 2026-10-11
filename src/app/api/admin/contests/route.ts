import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { contestPhase, parseContestInput } from "@/lib/contests";
import { contestAdminGuard } from "@/lib/contests-admin";

/** GET: every contest with entry counts. POST: create one (as a draft). */
export async function GET() {
  const g = await contestAdminGuard("community.view");
  if ("res" in g) return g.res;
  const rows = await prisma.contest.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const counts = (await prisma.contestEntry.groupBy({
    by: ["contestId", "status"],
    _count: { _all: true },
  })) as unknown as Array<{ contestId: string; status: string; _count: { _all: number } }>;
  const now = Date.now();
  const count = (id: string, status: string) =>
    counts.find((x) => x.contestId === id && x.status === status)?._count._all ?? 0;
  return NextResponse.json({
    contests: rows.map((r) => ({
      ...r,
      phase: contestPhase(r, now),
      pending: count(r.id, "PENDING"),
      approved: count(r.id, "APPROVED"),
    })),
  });
}

export async function POST(request: NextRequest) {
  const g = await contestAdminGuard("community.manage");
  if ("res" in g) return g.res;
  const parsed = parseContestInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;
  const contest = await prisma.contest.create({
    data: { ...v, prizes: v.prizes as never, createdById: g.userId },
  });
  await writeAudit({
    actorId: g.userId,
    action: "CONTEST_CREATED",
    entity: "Contest",
    entityId: contest.id,
    summary: `Created contest "${v.title}"`,
  });
  return NextResponse.json({ ok: true, contest });
}
