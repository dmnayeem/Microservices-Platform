import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { contestAdminGuard as engagementGuard } from "@/lib/contests-admin";
import { parseRound } from "@/lib/feedback-admin";

/** GET: rounds with response counts. POST: create a round (draft). */
export async function GET() {
  const g = await engagementGuard("community.view");
  if ("res" in g) return g.res;
  const rounds = await prisma.feedbackRound.findMany({ orderBy: { startAt: "desc" }, take: 100 });
  const counts = (await prisma.feedbackResponse.groupBy({ by: ["roundId"], _count: { _all: true } })) as unknown as Array<{
    roundId: string;
    _count: { _all: number };
  }>;
  return NextResponse.json({
    rounds: rounds.map((r) => ({ ...r, responses: counts.find((c) => c.roundId === r.id)?._count._all ?? 0 })),
  });
}

export async function POST(request: NextRequest) {
  const g = await engagementGuard("community.manage");
  if ("res" in g) return g.res;
  const p = parseRound(await request.json().catch(() => null));
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
  const round = await prisma.feedbackRound.create({
    data: { ...p.value, questions: p.value.questions as never, createdById: g.userId },
  });
  await writeAudit({
    actorId: g.userId,
    action: "FEEDBACK_ROUND_CREATED",
    entity: "FeedbackRound",
    entityId: round.id,
    summary: `Created feedback round "${round.title}"`,
  });
  return NextResponse.json({ ok: true, round });
}
