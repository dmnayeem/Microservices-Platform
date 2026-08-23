import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { calculateXpForLevel } from "../src/lib/level";

/**
 * The canonical XP→level, derived by inverting `calculateXpForLevel`.
 *
 * Note there is no such function in level.ts — the module exports only the
 * forward direction (used to draw the progress bar) while the two API routes
 * that WRITE `User.level` each carry their own threshold table. That is the
 * root of the stuck-progress-bar bug: the number being stored and the number
 * being rendered come from different curves.
 */
function calculateLevel(xp: number): number {
  let lvl = 1;
  while (lvl < 50 && xp >= calculateXpForLevel(lvl + 1)) lvl++;
  return lvl;
}

/**
 * How many real users would each pending behaviour change actually affect?
 *
 * The owner asked to be told before anything changes what users get today.
 * Guessing is not telling — this counts it against the live database.
 *
 * Read-only. Writes nothing.
 *
 * Run:  npx tsx --tsconfig tsconfig.script.json scripts/report-behaviour-impact.ts
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

/**
 * The copy that actually lives in the two API routes that WRITE `User.level`,
 * reproduced verbatim. Its thresholds match the canonical table up to level 11,
 * then it drops a level: at exactly 22,000 XP the canonical curve says 11 and
 * this says 10, and the gap persists upward.
 */
function localCalculateLevel(xp: number): number {
  if (xp < 100) return 1;
  if (xp < 250) return 2;
  if (xp < 500) return 3;
  if (xp < 1000) return 4;
  if (xp < 2000) return 5;
  if (xp < 4000) return 6;
  if (xp < 7000) return 7;
  if (xp < 11000) return 8;
  if (xp < 16000) return 9;
  if (xp < 22000) return 10;
  return Math.floor(10 + (xp - 22000) / 10000);
}

async function main() {
  console.log("\n=== Behaviour-change impact, against live data ===\n");

  const totalUsers = await prisma.user.count();
  console.log(`Users on the platform: ${totalUsers}\n`);

  /* 1 + 2 — the XP curve */
  console.log("1/2. XP double-count and the two competing level curves");
  const users = await prisma.user.findMany({
    select: { id: true, xp: true, level: true },
    where: { xp: { gt: 0 } },
  });
  console.log(`   users with any XP: ${users.length}`);

  let disagree = 0;
  let wouldDrop = 0;
  let wouldRise = 0;
  let pinnedAt100 = 0;
  for (const u of users) {
    const canonical = calculateLevel(u.xp);
    const local = localCalculateLevel(u.xp);
    if (canonical !== local) disagree++;
    if (canonical < u.level) wouldDrop++;
    if (canonical > u.level) wouldRise++;
    // The stuck-progress-bar symptom: stored level's window already passed.
    if (u.xp >= calculateXpForLevel(u.level + 1)) pinnedAt100++;
  }
  console.log(`   the two curves disagree for: ${disagree} users`);
  console.log(`   stored level is TOO HIGH (would drop on a resync): ${wouldDrop}`);
  console.log(`   stored level is TOO LOW  (would rise on a resync): ${wouldRise}`);
  console.log(`   progress bar currently stuck at 100%: ${pinnedAt100}`);

  /* 3 — auto-approve override for VIDEO and QUIZ */
  console.log("\n3. Auto-approve overridden for VIDEO and QUIZ");
  const overridden = await prisma.task.findMany({
    where: { type: { in: ["VIDEO", "QUIZ"] }, autoApprove: false, status: "ACTIVE" },
    select: { id: true, title: true, type: true },
  });
  console.log(
    `   ACTIVE VIDEO/QUIZ tasks with auto-approve explicitly OFF that pay instantly anyway: ${overridden.length}`
  );
  for (const t of overridden.slice(0, 10)) {
    console.log(`     - [${t.type}] ${t.title}`);
  }
  if (overridden.length > 10) console.log(`     … and ${overridden.length - 10} more`);

  /* 4 — board claims counting rows, not distinct tasks */
  console.log("\n4. Board claims counting submission ROWS, not distinct tasks");
  const boards = await prisma.taskBoard.findMany({
    where: { isActive: true },
    select: { id: true, title: true },
  });
  let exploitableClaims = 0;
  const affectedBoards: string[] = [];
  for (const b of boards) {
    const tasks = await prisma.task.findMany({
      where: { boardId: b.id },
      select: { id: true },
    });
    if (tasks.length < 2) continue; // a one-task board can't be gamed this way
    const claims = await prisma.boardClaim.findMany({
      where: { boardId: b.id },
      select: { userId: true },
    });
    for (const c of claims) {
      const done = await prisma.taskSubmission.findMany({
        where: {
          userId: c.userId,
          taskId: { in: tasks.map((t) => t.id) },
          status: { in: ["APPROVED", "AUTO_APPROVED"] },
        },
        select: { taskId: true },
        distinct: ["taskId"],
      });
      if (done.length < tasks.length) {
        exploitableClaims++;
        if (!affectedBoards.includes(b.title)) affectedBoards.push(b.title);
      }
    }
  }
  console.log(`   active multi-task boards: ${boards.length}`);
  console.log(
    `   claims already paid WITHOUT completing every distinct task: ${exploitableClaims}`
  );
  if (affectedBoards.length) console.log(`   boards involved: ${affectedBoards.join(", ")}`);

  /* 5 — referral counts including inactive accounts */
  console.log("\n5. Referral counts including banned / never-verified accounts");
  type Grouped = { referredById: string | null; _count: { _all: number } };
  const referrers = (await prisma.user.groupBy({
    by: ["referredById"],
    where: { referredById: { not: null } },
    _count: { _all: true },
  })) as unknown as Grouped[];
  const activeCounts = (await prisma.user.groupBy({
    by: ["referredById"],
    where: { referredById: { not: null }, status: "ACTIVE" },
    _count: { _all: true },
  })) as unknown as Grouped[];
  const activeMap = new Map(
    activeCounts.map((r) => [r.referredById, r._count._all])
  );
  let inflated = 0;
  let inflatedHeads = 0;
  for (const r of referrers) {
    const all = r._count._all;
    const act = activeMap.get(r.referredById) ?? 0;
    if (act < all) {
      inflated++;
      inflatedHeads += all - act;
    }
  }
  console.log(`   users with at least one referral: ${referrers.length}`);
  console.log(`   of those, paid for inactive downline: ${inflated}`);
  console.log(`   total inactive heads currently being paid for, daily: ${inflatedHeads}`);

  /* 6 — SURVEY totalLimit is global */
  console.log("\n6. SURVEY tasks capped at one completion platform-wide");
  const surveys = await prisma.task.findMany({
    where: { type: "SURVEY" },
    select: { id: true, title: true, totalLimit: true, completedCount: true, status: true },
  });
  const closed = surveys.filter(
    (s) => s.totalLimit != null && s.completedCount >= s.totalLimit
  );
  console.log(`   SURVEY tasks: ${surveys.length}`);
  console.log(`   already closed to everyone after their first approval: ${closed.length}`);
  for (const s of closed.slice(0, 10)) console.log(`     - ${s.title} (${s.status})`);

  /* 7 — the two quiz payout rules */
  console.log("\n7. Two quiz paths with different payout rules");
  const quizTasks = await prisma.task.count({ where: { type: "QUIZ", status: "ACTIVE" } });
  const quizSubs = await prisma.taskSubmission.count({
    where: { task: { type: "QUIZ" }, status: { in: ["APPROVED", "AUTO_APPROVED"] } },
  });
  const zeroScore = await prisma.taskSubmission.count({
    where: {
      task: { type: "QUIZ" },
      status: { in: ["APPROVED", "AUTO_APPROVED"] },
      score: { lt: 70 },
    },
  });
  console.log(`   active QUIZ tasks: ${quizTasks}`);
  console.log(`   quiz submissions already paid: ${quizSubs}`);
  console.log(
    `   of those, paid despite scoring under 70% (the /submit path pays full): ${zeroScore}`
  );

  /* 8 — profile targeting attributes are freely editable */
  console.log("\n8. Users rewriting their own targeting attributes");
  const targeted = await prisma.task.count({
    where: {
      OR: [
        { countries: { isEmpty: false } },
        { genders: { isEmpty: false } },
        { districts: { isEmpty: false } },
        { minAge: { not: null } },
        { maxAge: { not: null } },
      ],
    },
  });
  console.log(`   tasks that target on a profile attribute: ${targeted}`);
  console.log(
    "   (there is no audit trail on profile edits, so past abuse cannot be counted)"
  );

  console.log("");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
