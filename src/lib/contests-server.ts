import "server-only";
import { Prisma, NotificationType, TransactionType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { creditPoints } from "@/lib/ledger";
import { requireActiveUser } from "@/lib/require-active";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { verifyFetch } from "@/lib/social-recheck";
import {
  contestPhase,
  contestScore,
  platformOfUrl,
  type ContestPlatform,
  type ContestPrize,
} from "@/lib/contests";

type Fail = { ok: false; error: string; status: number };
const fail = (error: string, status = 400): Fail => ({ ok: false, error, status });

const MIN_ACCOUNT_AGE_DAYS_TO_VOTE = 3;

/* ── Entering ─────────────────────────────────────────────────────────────── */

export async function submitContestEntry(
  userId: string,
  contestId: string,
  rawUrl: string,
  caption: string | null
): Promise<{ ok: true; id: string; linkCheck: string } | Fail> {
  const active = await requireActiveUser(userId);
  if (!active.ok) return fail(active.message, active.httpStatus);

  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest || contest.status !== "PUBLISHED") return fail("Contest not found.", 404);
  if (contestPhase(contest, Date.now()) !== "open") return fail("This contest isn't taking entries right now.");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { level: true } });
  if ((user?.level ?? 0) < contest.minLevelToEnter) {
    return fail(`Reach level ${contest.minLevelToEnter} to enter this contest.`);
  }

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return fail("Paste the full link to your post (https://…).");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return fail("Paste the full link to your post (https://…).");
  const platform = platformOfUrl(url.toString());
  const allowed = contest.platforms as ContestPlatform[];
  if (!allowed.includes("ANY") && (!platform || !allowed.includes(platform))) {
    return fail(`This contest accepts: ${allowed.join(", ")}.`);
  }

  const mine = await prisma.contestEntry.count({
    where: { contestId, userId, status: { in: ["PENDING", "APPROVED"] } },
  });
  if (mine >= contest.maxEntriesPerUser) {
    return fail(contest.maxEntriesPerUser === 1 ? "You already entered this contest." : `You can enter up to ${contest.maxEntriesPerUser} times.`);
  }

  // Read the post when possible: the hashtag must be there. A post the
  // platform won't show to a crawler is not rejected — the admin reviews every
  // entry anyway — it is marked so the admin knows to check by eye.
  let linkCheck = "UNREADABLE";
  const html = await verifyFetch(url.toString(), userId).catch(() => null);
  if (html) {
    linkCheck = !contest.hashtag || html.toLowerCase().includes(contest.hashtag.toLowerCase()) ? "OK" : "NO_HASHTAG";
  }

  try {
    const e = await prisma.contestEntry.create({
      data: {
        contestId,
        userId,
        url: url.toString(),
        platform: platform ?? "OTHER",
        caption: caption?.trim().slice(0, 300) || null,
        linkCheck,
      },
      select: { id: true },
    });
    return { ok: true, id: e.id, linkCheck };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("That post is already entered in this contest.", 409);
    }
    throw e;
  }
}

/* ── Voting ───────────────────────────────────────────────────────────────── */

/**
 * One vote per member per contest, on an approved entry, while entries are
 * open or during voting. Fair-play rules: a minimum level and account age, not
 * your own entry, and not an entry from someone on your own device.
 */
export async function castContestVote(
  userId: string,
  contestId: string,
  entryId: string
): Promise<{ ok: true } | Fail> {
  const active = await requireActiveUser(userId);
  if (!active.ok) return fail(active.message, active.httpStatus);

  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest || contest.status !== "PUBLISHED") return fail("Contest not found.", 404);
  const phase = contestPhase(contest, Date.now());
  if (phase !== "open" && phase !== "voting") return fail("Voting is closed for this contest.");

  const entry = await prisma.contestEntry.findFirst({
    where: { id: entryId, contestId, status: "APPROVED" },
    select: { id: true, userId: true },
  });
  if (!entry) return fail("That entry isn't in the contest.", 404);
  if (entry.userId === userId) return fail("You can't vote for your own entry.");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { level: true, createdAt: true } });
  if (!user) return fail("Unauthorized", 401);
  if (user.level < contest.minLevelToVote) return fail(`Reach level ${contest.minLevelToVote} to vote.`);
  if (Date.now() - user.createdAt.getTime() < MIN_ACCOUNT_AGE_DAYS_TO_VOTE * 86_400_000) {
    return fail(`Accounts can vote after ${MIN_ACCOUNT_AGE_DAYS_TO_VOTE} days.`);
  }

  // Accounts made after the contest opened can't vote — a fresh account is the
  // cheapest vote there is.
  if (user.createdAt.getTime() > contest.startAt.getTime()) {
    return fail("Only accounts that existed before this contest started can vote.");
  }
  const mine = await prisma.userDevice.findMany({ where: { userId }, select: { deviceId: true, fpHash: true }, take: 20 });
  // No device on record = never used the site in a browser (a script): no vote.
  if (mine.length === 0) return fail("Open RevType in your browser first, then vote.");
  {
    const ids = mine.map((d) => d.deviceId);
    const fps = mine.map((d) => d.fpHash).filter((f): f is string => !!f);
    const shared = await prisma.userDevice.findFirst({
      where: {
        userId: entry.userId,
        OR: [{ deviceId: { in: ids } }, ...(fps.length ? [{ fpHash: { in: fps } }] : [])],
      },
      select: { id: true },
    });
    if (shared) return fail("Votes from the same device as the entrant don't count.");
  }

  try {
    await prisma.$transaction([
      prisma.contestVote.create({ data: { contestId, entryId, userId } }),
      prisma.contestEntry.update({ where: { id: entryId }, data: { votes: { increment: 1 } } }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("You already voted in this contest.", 409);
    }
    throw e;
  }
  return { ok: true };
}

/* ── Winners ──────────────────────────────────────────────────────────────── */

export interface Standing {
  entryId: string;
  userId: string;
  score: number;
  votes: number;
  adminScore: number | null;
}

/** Approved entries by final score — the order the prizes go in. */
export async function contestStandings(contestId: string): Promise<Standing[]> {
  const contest = await prisma.contest.findUnique({ where: { id: contestId }, select: { voteWeightPct: true } });
  if (!contest) return [];
  const entries = await prisma.contestEntry.findMany({
    where: { contestId, status: "APPROVED" },
    select: { id: true, userId: true, votes: true, adminScore: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const maxVotes = Math.max(0, ...entries.map((e) => e.votes));
  return entries
    .map((e) => ({
      entryId: e.id,
      userId: e.userId,
      votes: e.votes,
      adminScore: e.adminScore,
      score: contestScore(e.adminScore, e.votes, maxVotes, contest.voteWeightPct),
      at: e.createdAt.getTime(),
    }))
    // Ties: the earlier entry wins.
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .map(({ at: _at, ...s }) => s);
}

/**
 * Pick the winners and pay them. Only after voting has ended. The FINISHED
 * flip is a compare-and-set, so a double click finalizes once; payouts use a
 * per-user ledger reference, so `payContest` can be re-run safely.
 * One prize per person: a member with two placing entries keeps the better.
 */
export async function finalizeContest(contestId: string): Promise<{ ok: true; paid: number } | Fail> {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest) return fail("Contest not found.", 404);
  if (contest.status !== "PUBLISHED") return fail("Only a published contest can be finalized.");
  if (Date.now() < contest.votingEndsAt.getTime()) return fail("Voting hasn't ended yet.");

  const standings = await contestStandings(contestId);
  const prizes = (contest.prizes as unknown as ContestPrize[]) ?? [];
  const placed = new Set<string>();
  const results: { entryId: string; rank: number | null; points: number }[] = [];
  let rank = 0;
  for (const s of standings) {
    if (placed.has(s.userId)) {
      results.push({ entryId: s.entryId, rank: null, points: 0 });
      continue;
    }
    placed.add(s.userId);
    rank++;
    const prize = prizes.find((p) => p.rank === rank);
    results.push({ entryId: s.entryId, rank, points: prize ? prize.points : contest.participationPoints });
  }

  const claimed = await prisma.contest.updateMany({
    where: { id: contestId, status: "PUBLISHED", finalizedAt: null },
    data: { status: "FINISHED", finalizedAt: new Date() },
  });
  if (claimed.count === 0) return fail("Already finalized.", 409);

  for (let i = 0; i < results.length; i += 25) {
    await prisma.$transaction(
      results.slice(i, i + 25).map((r) =>
        prisma.contestEntry.update({ where: { id: r.entryId }, data: { rank: r.rank, prizePoints: r.points } })
      )
    );
  }
  const paid = await payContest(contestId);
  return { ok: true, paid };
}

/** Pay every finalized entry its points (idempotent per user and contest). */
export async function payContest(contestId: string): Promise<number> {
  const contest = await prisma.contest.findUnique({ where: { id: contestId }, select: { title: true, status: true } });
  if (!contest || contest.status !== "FINISHED") return 0;
  const entries = await prisma.contestEntry.findMany({
    where: { contestId, prizePoints: { gt: 0 } },
    select: { userId: true, rank: true, prizePoints: true },
  });
  let paid = 0;
  for (const e of entries) {
    const points = e.prizePoints ?? 0;
    const prize = e.rank != null && e.rank <= 3;
    try {
      await prisma.$transaction(async (tx) => {
        await creditPoints(tx, {
          userId: e.userId,
          points,
          type: TransactionType.BONUS,
          description: `Contest ${e.rank ? `#${e.rank}` : "entry"} — ${contest.title}`,
          reference: `contest_${contestId}`,
          metadata: { source: "contest", contestId, rank: e.rank },
        });
        await tx.notification.create({
          data: {
            userId: e.userId,
            type: NotificationType.ACHIEVEMENT,
            title: prize ? `🏆 You placed #${e.rank} in "${contest.title}"!` : `Thanks for entering "${contest.title}"`,
            message: `${points.toLocaleString()} points have been added to your balance.`,
            popup: prize,
            data: {
              link: `/contests/${contestId}`,
              ...(prize
                ? {
                    popup: {
                      kind: "achievement",
                      headline: `#${e.rank} in ${contest.title}!`,
                      amount: `${points.toLocaleString()} points`,
                      cta: { label: "See the winners", href: `/contests/${contestId}` },
                    },
                  }
                : {}),
            },
          },
        });
      });
      paid++;
    } catch (err) {
      if (!isDuplicateLedgerError(err)) console.error("[contest] payout failed", contestId, e.userId, err);
    }
  }
  return paid;
}
