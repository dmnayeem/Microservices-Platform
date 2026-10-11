import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { currentFeedbackRound, submitFeedback } from "@/lib/feedback-server";

/**
 * GET  — the open feedback round (if any, and whether you answered), the idea
 *        board (with your votes) and what shipped.
 * POST — `{ roundId, answers }`: answer the round.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const round = await currentFeedbackRound();
  const [answered, ideas, shipped, myVotes] = await Promise.all([
    round
      ? prisma.feedbackResponse.findUnique({ where: { roundId_userId: { roundId: round.id, userId } }, select: { id: true } })
      : Promise.resolve(null),
    prisma.featureIdea.findMany({
      where: { status: { in: ["OPEN", "PLANNED", "IN_PROGRESS"] } },
      orderBy: [{ votes: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: { id: true, userId: true, title: true, body: true, status: true, votes: true, adminNote: true, createdAt: true },
    }),
    prisma.featureIdea.findMany({
      where: { status: "SHIPPED" },
      orderBy: { shippedAt: "desc" },
      take: 30,
      select: { id: true, title: true, body: true, votes: true, adminNote: true, shippedAt: true },
    }),
    prisma.featureIdeaVote.findMany({ where: { userId }, select: { ideaId: true }, take: 1000 }),
  ]);
  const voted = new Set(myVotes.map((v) => v.ideaId));
  return NextResponse.json({
    round: round
      ? {
          id: round.id,
          title: round.title,
          intro: round.intro,
          questions: round.questions,
          endAt: round.endAt,
          rewardPoints: round.rewardPoints,
          minLevel: round.minLevel,
          answered: !!answered,
        }
      : null,
    ideas: ideas.map(({ userId: author, ...i }) => ({ ...i, mine: author === userId, voted: voted.has(i.id) })),
    shipped,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceDbRateLimit(request, "feedback", session.user.id, 10, 60_000);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { roundId?: unknown; answers?: unknown };
  const r = await submitFeedback(session.user.id, String(body.roundId ?? ""), body.answers);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
