import "server-only";
import { Prisma, NotificationType, TransactionType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { creditPoints } from "@/lib/ledger";
import { requireActiveUser } from "@/lib/require-active";
import { cleanAnswers, type FeedbackQuestion } from "@/lib/feedback";

type Fail = { ok: false; error: string; status: number };
const fail = (error: string, status = 400): Fail => ({ ok: false, error, status });

/** The round open right now (newest first), if any. */
export async function currentFeedbackRound() {
  const now = new Date();
  return prisma.feedbackRound.findFirst({
    where: { status: "PUBLISHED", startAt: { lte: now }, endAt: { gt: now } },
    orderBy: { startAt: "desc" },
  });
}

/**
 * Save a member's answers to the open round. One response per member per
 * round (unique); the reward is paid in the same transaction, only for a
 * complete answer (every required question, written answers ≥ 10 characters).
 */
export async function submitFeedback(
  userId: string,
  roundId: string,
  rawAnswers: unknown
): Promise<{ ok: true; rewarded: number } | Fail> {
  const active = await requireActiveUser(userId);
  if (!active.ok) return fail(active.message, active.httpStatus);
  const round = await prisma.feedbackRound.findUnique({ where: { id: roundId } });
  const now = Date.now();
  if (!round || round.status !== "PUBLISHED" || round.startAt.getTime() > now || round.endAt.getTime() <= now) {
    return fail("This feedback round is closed.");
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { level: true } });
  if ((user?.level ?? 0) < round.minLevel) return fail(`Reach level ${round.minLevel} to take part.`);

  const { answers, complete, missing } = cleanAnswers(round.questions as unknown as FeedbackQuestion[], rawAnswers);
  if (!complete) return fail(`Please answer: "${missing}" (written answers need at least a sentence).`);
  const reward = Math.max(0, round.rewardPoints);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.feedbackResponse.create({ data: { roundId, userId, answers: answers as never, rewarded: reward } });
      if (reward > 0) {
        await creditPoints(tx, {
          userId,
          points: reward,
          type: TransactionType.BONUS,
          description: `Feedback — ${round.title}`,
          reference: `feedback_${roundId}`,
          metadata: { source: "feedback", roundId },
        });
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("You already answered this round — thank you!", 409);
    }
    throw e;
  }
  return { ok: true, rewarded: reward };
}

/* ── Idea board ───────────────────────────────────────────────────────────── */

const IDEAS_PER_DAY = 3;

export async function postIdea(userId: string, title: string, body: string | null): Promise<{ ok: true; id: string } | Fail> {
  const active = await requireActiveUser(userId);
  if (!active.ok) return fail(active.message, active.httpStatus);
  const t = title.trim().slice(0, 120);
  if (t.length < 8) return fail("Give your idea a clear title (at least a few words).");
  const recent = await prisma.featureIdea.count({
    where: { userId, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
  });
  if (recent >= IDEAS_PER_DAY) return fail(`You can post ${IDEAS_PER_DAY} ideas a day.`);
  const idea = await prisma.featureIdea.create({
    data: { userId, title: t, body: body?.trim().slice(0, 2000) || null },
    select: { id: true },
  });
  return { ok: true, id: idea.id };
}

/** Upvote (or take the vote back). Not on your own idea. */
export async function toggleIdeaVote(userId: string, ideaId: string): Promise<{ ok: true; voted: boolean } | Fail> {
  const active = await requireActiveUser(userId);
  if (!active.ok) return fail(active.message, active.httpStatus);
  const idea = await prisma.featureIdea.findUnique({ where: { id: ideaId }, select: { userId: true, status: true } });
  if (!idea || idea.status === "HIDDEN") return fail("Idea not found.", 404);
  if (idea.userId === userId) return fail("You can't vote for your own idea.");
  const had = await prisma.featureIdeaVote.findUnique({ where: { ideaId_userId: { ideaId, userId } }, select: { id: true } });
  if (had) {
    const gone = await prisma.featureIdeaVote.deleteMany({ where: { id: had.id } });
    if (gone.count) await prisma.featureIdea.update({ where: { id: ideaId }, data: { votes: { decrement: 1 } } });
    return { ok: true, voted: false };
  }
  try {
    await prisma.$transaction([
      prisma.featureIdeaVote.create({ data: { ideaId, userId } }),
      prisma.featureIdea.update({ where: { id: ideaId }, data: { votes: { increment: 1 } } }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: true, voted: true };
    throw e;
  }
  return { ok: true, voted: true };
}

/** "You asked, we built it": tell the author and every voter when an idea ships. */
export async function notifyIdeaShipped(ideaId: string): Promise<number> {
  const idea = await prisma.featureIdea.findUnique({ where: { id: ideaId }, select: { title: true, userId: true } });
  if (!idea) return 0;
  const voters = await prisma.featureIdeaVote.findMany({ where: { ideaId }, select: { userId: true } });
  const ids = [...new Set([idea.userId, ...voters.map((v) => v.userId)])];
  if (ids.length === 0) return 0;
  const r = await prisma.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      type: NotificationType.SYSTEM,
      title: "🚀 You asked, we built it",
      message: `"${idea.title}" is now live. Thank you for the idea${userId === idea.userId ? "" : " and your vote"}!`,
      data: { link: "/feedback?tab=shipped" },
    })),
  });
  return r.count;
}
