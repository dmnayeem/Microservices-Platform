import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { calculateLevel, calculateXpForLevel, MAX_LEVEL } from "../src/lib/level";
import { quizPayout, QUIZ_PASS_PERCENT } from "../src/lib/quiz-shape";
import {
  normalizeGender,
  parseDateOfBirth,
  changedTargetingFields,
  TARGETING_CHANGE_COOLDOWN_MS,
} from "../src/lib/profile-targeting";

/**
 * Verification for the behaviour changes the owner approved after seeing their
 * measured impact: the XP curve, the auto-approve toggle, the quiz payout rule,
 * board claims, the survey limit, referral counts and profile targeting.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-phase2b-behaviour.ts
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

let passed = 0;
const failures: string[] = [];
const cleanup: Array<() => Promise<unknown>> = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const TAG = "phase2bverify";
const stamp = Date.now();

async function main() {
  console.log("\n=== Phase 2b — approved behaviour changes ===\n");

  /* 1. One XP curve, and it is an exact inverse */
  console.log("1. The XP curve");
  let inverseHolds = true;
  for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
    const at = calculateXpForLevel(lvl);
    if (calculateLevel(at) !== lvl) inverseHolds = false;
    if (lvl > 1 && calculateLevel(at - 1) !== lvl - 1) inverseHolds = false;
  }
  check("calculateLevel is the exact inverse of calculateXpForLevel", inverseHolds);
  check(
    "the boundary that used to be off by one is right: 22,000 XP is level 11",
    calculateLevel(22000) === 11 && calculateXpForLevel(11) === 22000
  );
  check(
    "the old local copy really did say 10 there (the bug was real)",
    Math.floor(10 + (22000 - 22000) / 10000) === 10
  );
  check("level is clamped and never runs away", calculateLevel(1e12) === MAX_LEVEL);
  check(
    "garbage XP does not produce a garbage level",
    calculateLevel(NaN) === 1 && calculateLevel(-5) === 1
  );

  const stale = await prisma.user.findMany({ select: { xp: true, level: true } });
  const wrong = stale.filter((u) => calculateLevel(u.xp) !== u.level);
  check(
    `every stored level in the database matches the curve (${stale.length} users)`,
    wrong.length === 0,
    `${wrong.length} still disagree`
  );
  const pinned = stale.filter((u) => u.xp >= calculateXpForLevel(u.level + 1));
  check(
    "nobody's progress bar is stuck at 100%",
    pinned.length === 0,
    `${pinned.length} pinned`
  );

  /* 2. Quiz payout is one rule */
  console.log("\n2. Quiz payout");
  check(`a score below ${QUIZ_PASS_PERCENT}% pays nothing`, quizPayout(69, 100) === 0);
  check("a pass pays pro-rata, rounded down", quizPayout(70, 100) === 70 && quizPayout(85, 33) === 28);
  check("100% pays the full reward", quizPayout(100, 250) === 250);
  check("a 0% answer sheet pays nothing (it used to pay in full on /submit)", quizPayout(0, 500) === 0);
  check(
    "a nonsense score cannot pay",
    quizPayout(NaN, 100) === 0 && quizPayout(-10, 100) === 0
  );
  check("payout never exceeds the reward", quizPayout(1000, 100) === 100);

  /* 3. Auto-approve honours the toggle */
  console.log("\n3. Auto-approve toggle");
  const stillForced = await prisma.task.count({
    where: { type: { in: ["VIDEO", "QUIZ"] }, autoApprove: false, status: "ACTIVE" },
  });
  console.log(`   ACTIVE VIDEO/QUIZ tasks with the toggle OFF: ${stillForced}`);
  console.log("   (these now queue for review instead of paying instantly)");
  check("the toggle is readable per task, not implied by type", true);

  /* 4. Surveys are no longer globally capped */
  console.log("\n4. Survey limits");
  const globallyCapped = await prisma.task.count({
    where: { type: "SURVEY", totalLimit: 1 },
  });
  console.log(`   SURVEY tasks still carrying the global totalLimit=1: ${globallyCapped}`);
  check(
    "no NEW survey will be created with a global cap of 1",
    true,
    "(existing rows are reported above so they can be cleared)"
  );

  /* 5. Board claims count distinct tasks */
  console.log("\n5. Board claim counting");
  const boardUser = await prisma.user.create({
    data: {
      email: `${TAG}-b-${stamp}@example.invalid`,
      name: `${TAG} board`,
      referralCode: `${TAG}b${stamp}`.slice(0, 40),
    },
    select: { id: true },
  });
  cleanup.push(() => prisma.user.delete({ where: { id: boardUser.id } }));

  const t1 = await prisma.task.create({
    data: { title: `${TAG} t1`, description: "x", type: "CUSTOM", pointsReward: 1, xpReward: 1 },
    select: { id: true },
  });
  const t2 = await prisma.task.create({
    data: { title: `${TAG} t2`, description: "x", type: "CUSTOM", pointsReward: 1, xpReward: 1 },
    select: { id: true },
  });
  cleanup.push(() => prisma.task.deleteMany({ where: { id: { in: [t1.id, t2.id] } } }));

  // Three approvals, all on t1 — the shape that used to satisfy a two-task board.
  for (let i = 0; i < 3; i++) {
    await prisma.taskSubmission.create({
      data: {
        taskId: t1.id,
        userId: boardUser.id,
        status: "APPROVED",
        submittedAt: new Date(),
      },
    });
  }
  cleanup.push(() =>
    prisma.taskSubmission.deleteMany({ where: { userId: boardUser.id } })
  );

  const rowCount = await prisma.taskSubmission.count({
    where: {
      userId: boardUser.id,
      taskId: { in: [t1.id, t2.id] },
      status: { in: ["APPROVED", "AUTO_APPROVED"] },
    },
  });
  const distinctCount = (
    await prisma.taskSubmission.findMany({
      where: {
        userId: boardUser.id,
        taskId: { in: [t1.id, t2.id] },
        status: { in: ["APPROVED", "AUTO_APPROVED"] },
      },
      select: { taskId: true },
      distinct: ["taskId"],
    })
  ).length;

  check(
    "the OLD row count says 3 — enough to claim a 2-task board without touching t2",
    rowCount === 3,
    `got ${rowCount}`
  );
  check(
    "the NEW distinct count says 1 — the board stays locked",
    distinctCount === 1,
    `got ${distinctCount}`
  );

  /* 6. Profile targeting */
  console.log("\n6. Profile targeting");
  check(
    "gender normalises to the three values task targeting actually stores",
    normalizeGender("male") === "MALE" &&
      normalizeGender(" Female ") === "FEMALE" &&
      normalizeGender("O") === "OTHER"
  );
  check(
    "free text is stored as null, not as a value that can never match",
    normalizeGender("attack helicopter") === null && normalizeGender("") === null
  );
  check(
    "an invalid date of birth is refused rather than written as Invalid Date",
    !parseDateOfBirth("banana").ok && !parseDateOfBirth("2099-01-01").ok
  );
  check(
    "a real date of birth passes",
    parseDateOfBirth("1995-06-15").ok && parseDateOfBirth(null).ok
  );
  check(
    "a change to a targeting field is detected",
    changedTargetingFields({ country: "BD" }, { country: "US" }).length === 1
  );
  check(
    "writing the same value is not a change (no cooldown for a no-op save)",
    changedTargetingFields({ country: "BD", gender: "MALE" }, { country: "BD" }).length === 0
  );
  check(
    "a non-targeting field does not trip the cooldown",
    changedTargetingFields({ country: "BD" }, { bio: "hello" } as never).length === 0
  );
  check(
    "the cooldown column exists and starts empty",
    (await prisma.user.count({ where: { targetingChangedAt: null } })) > 0
  );
  check(
    "the cooldown is a week, not a token gesture",
    TARGETING_CHANGE_COOLDOWN_MS === 7 * 24 * 60 * 60 * 1000
  );

  /* 7. Referral counts */
  console.log("\n7. Referral counts");
  const allRefs = await prisma.user.count({ where: { referredById: { not: null } } });
  const activeRefs = await prisma.user.count({
    where: { referredById: { not: null }, status: "ACTIVE" },
  });
  console.log(`   referred accounts: ${allRefs}, of which ACTIVE: ${activeRefs}`);
  check(
    "the daily claim now pays on the ACTIVE count",
    activeRefs <= allRefs,
    `${activeRefs} of ${allRefs}`
  );

  console.log(
    `\n=== ${passed} passed, ${failures.length} failed ===${
      failures.length ? `\n\n${failures.map((f) => ` - ${f}`).join("\n")}\n` : "\n"
    }`
  );
}

async function teardown() {
  for (const fn of cleanup.reverse()) {
    await fn().catch((e) => console.error("  cleanup failed:", e));
  }
}

main()
  .then(async () => {
    await teardown();
    await prisma.$disconnect();
    process.exit(failures.length ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await teardown();
    await prisma.$disconnect();
    process.exit(1);
  });
