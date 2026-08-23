import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { toPlayerTask, toPlayerQuestions, stripUniqueKey } from "../src/lib/task-player-view";
import { visibleTaskWhere } from "../src/lib/task-visibility";
import { requireActiveUser, requireVerifiedUser } from "../src/lib/require-active";

/**
 * Phase 2 verification — task, submission and user-system integrity.
 *
 * Run:  npx tsx --tsconfig tsconfig.script.json scripts/verify-phase2-tasks.ts
 *
 * Creates a small sandbox in the live database and tears it down on success and
 * failure alike.
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

const TAG = "phase2verify";
const stamp = Date.now();

async function main() {
  console.log("\n=== Phase 2 — tasks, submissions, users ===\n");

  /* ── 1. Nothing secret reaches the player ────────────────────────────── */
  console.log("1. Secret stripping");

  const rawTask = {
    id: "t1",
    title: "A quiz",
    type: "QUIZ",
    hidden: true,
    fundedByUserId: "someone",
    budgetPoints: 5000,
    remainingBudget: 4000,
    createdById: "admin1",
    costUsd: 12,
    questions: [
      { question: "2+2?", options: ["3", "4"], correctAnswer: 1 },
      { question: "Capital?", options: ["Dhaka", "Delhi"], correct: 0 },
    ],
    videoConfig: { watchSeconds: 30, uniqueKey: "SECRET-VIDEO", uniqueKeyHint: "at 3:20" },
    articleConfig: { useKeyPool: true, uniqueKey: "SECRET-ARTICLE", uniqueKeyHint: "page 2" },
  };

  const player = toPlayerTask(rawTask);
  const blob = JSON.stringify(player);

  check("the quiz answer key is gone", !/correctAnswer|"correct"|correctIndex/.test(blob), blob.slice(0, 120));
  check("the video uniqueKey is gone", !blob.includes("SECRET-VIDEO"));
  check("the article uniqueKey is gone", !blob.includes("SECRET-ARTICLE"));
  check(
    "the hints SURVIVE — they are written for the user",
    blob.includes("at 3:20") && blob.includes("page 2")
  );
  check(
    "internal bookkeeping is gone",
    !("fundedByUserId" in player) &&
      !("budgetPoints" in player) &&
      !("remainingBudget" in player) &&
      !("createdById" in player) &&
      !("hidden" in player) &&
      !("costUsd" in player)
  );
  check(
    "the questions themselves survive, with options",
    Array.isArray(player.questions) &&
      (player.questions as unknown[]).length === 2 &&
      blob.includes("2+2?") &&
      blob.includes("Dhaka")
  );
  check(
    "a malformed question set becomes empty, never the raw value",
    toPlayerQuestions("not json at all").length === 0 &&
      toPlayerQuestions(null).length === 0 &&
      toPlayerQuestions([{ nope: true }]).length === 0
  );
  check(
    "double-encoded questions (the historical row shape) still parse",
    toPlayerQuestions(JSON.stringify(rawTask.questions)).length === 2
  );
  check(
    "stripUniqueKey leaves a config with no key untouched",
    JSON.stringify(stripUniqueKey({ a: 1 })) === JSON.stringify({ a: 1 }) &&
      stripUniqueKey(null) === null
  );

  /* ── 2. visibleTaskWhere pins every gate ─────────────────────────────── */
  console.log("2. Visibility clause");

  const where = visibleTaskWhere(
    { level: 3, country: "BD", gender: "MALE", dateOfBirth: new Date("2000-01-01") },
    { accessLevel: 1, allowedTypes: ["QUIZ"] }
  );
  const w = JSON.stringify(where);
  check("status is pinned to ACTIVE", w.includes('"status":"ACTIVE"'));
  check("hidden is pinned to false", w.includes('"hidden":false'));
  check("the date windows are present", w.includes("expiresAt") && w.includes("startsAt"));
  check("minLevel and requiredAccessLevel are present", w.includes("minLevel") && w.includes("requiredAccessLevel"));
  check("the type allow-list is present", w.includes("allowedTypes") === false && w.includes('"in":["QUIZ"]'));

  /* ── 3. Banned and suspended accounts are refused ────────────────────── */
  console.log("3. Account status gate");

  const mk = async (status: "ACTIVE" | "BANNED" | "SUSPENDED" | "PENDING_VERIFICATION") => {
    const u = await prisma.user.create({
      data: {
        email: `${TAG}-${status}-${stamp}@example.invalid`,
        name: `${TAG} ${status}`,
        referralCode: `${TAG}${status}${stamp}`.slice(0, 40),
        status,
      },
      select: { id: true },
    });
    cleanup.push(() => prisma.user.delete({ where: { id: u.id } }));
    return u.id;
  };

  const activeId = await mk("ACTIVE");
  const bannedId = await mk("BANNED");
  const suspendedId = await mk("SUSPENDED");
  const unverifiedId = await mk("PENDING_VERIFICATION");

  check("an active account may act", (await requireActiveUser(activeId)).ok);
  check("a BANNED account is refused", !(await requireActiveUser(bannedId)).ok);
  check("a SUSPENDED account is refused", !(await requireActiveUser(suspendedId)).ok);
  check(
    "an unverified account may still EARN (unchanged behaviour — gated by the admin toggle)",
    (await requireActiveUser(unverifiedId)).ok
  );
  check(
    "an unverified account may NOT withdraw",
    !(await requireVerifiedUser(unverifiedId)).ok
  );
  check(
    "a banned account may not withdraw either",
    !(await requireVerifiedUser(bannedId)).ok
  );
  check(
    "a deleted/unknown user is refused rather than allowed",
    !(await requireActiveUser("no-such-user-id")).ok
  );
  const banned = await requireActiveUser(bannedId);
  check(
    "the refusal carries a usable message and a 403",
    !banned.ok && banned.httpStatus === 403 && banned.message.length > 10
  );

  /* ── 4. Live data ────────────────────────────────────────────────────── */
  console.log("4. Live data");

  const hiddenTasks = await prisma.task.count({ where: { hidden: true } });
  console.log(`   (${hiddenTasks} hidden tasks exist — each was startable by id before this)`);

  const nonActiveEarners = await prisma.user.count({
    where: { status: { in: ["BANNED", "SUSPENDED"] } },
  });
  console.log(`   (${nonActiveEarners} banned/suspended accounts)`);

  // Any of those with a live session would have kept earning. Show whether any
  // has earned since being blocked — the reason this mattered.
  if (nonActiveEarners > 0) {
    const recent = await prisma.transaction.count({
      where: {
        user: { status: { in: ["BANNED", "SUSPENDED"] } },
        type: "EARNING",
        createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
    });
    console.log(`   (${recent} earning rows for those accounts in the last 30 days)`);
  }

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
