import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildDailyProgress } from "../src/lib/daily-mission-progress";

/**
 * A Task Board counts once. Its tasks count for nothing.
 *
 * A board is one piece of work presented as one thing — the reward is released
 * by `/api/tasks/boards/[id]/claim` and by nothing else. Before this, every
 * approved task inside a board fed BOTH its own mission bucket AND a BOARD
 * credit, so a five-task board cleared a "do 3 videos" item by itself and then
 * counted as five separate board completions on top. The same effort, paid
 * three ways.
 *
 * The live half of this test builds a real board, a real task inside it, and a
 * real approved submission, then asks `buildDailyProgress` what it sees. A
 * static check could not tell the difference between the old rule and the new
 * one, because both read the same table.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-board-mission-counting.ts
 */

const url =
  (process.env.NODE_ENV !== "production" && process.env.DIRECT_DATABASE_URL) ||
  process.env.DATABASE_URL!;
const isAccelerate =
  url.startsWith("prisma://") || url.startsWith("prisma+postgres://");
const prisma = new PrismaClient(
  isAccelerate
    ? { accelerateUrl: url }
    : { adapter: new PrismaPg({ connectionString: url }) }
).$extends(withAccelerate());

const root = process.cwd();
const code = (p: string) =>
  fs
    .readFileSync(path.join(root, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const tag = "bmc-" + Math.random().toString(36).slice(2, 8);
const made: Record<string, string> = {};

async function main() {
  console.log("\n=== Board tasks and the daily mission ===\n");

  /* ── 1. The rule, as written ── */
  console.log("1. The counting rule");
  const lib = code("src/lib/daily-mission-progress.ts");
  check(
    "a submission belonging to a board is skipped entirely",
    /if \(s\.task\.boardId\) continue;/.test(lib)
  );
  check(
    "BOARD is counted from BoardClaim, not from submissions",
    /prisma\.boardClaim\.count\(/.test(lib) &&
      !/countByType\.BOARD = \(countByType\.BOARD \?\? 0\) \+ 1/.test(lib)
  );
  check(
    "…and only when a mission actually asks for it",
    /wanted\.has\("BOARD"\)/.test(lib)
  );
  check(
    "the admin's counting hint matches the rule",
    /FINISHES and claims/.test(code("src/lib/mission-labels.ts"))
  );

  /* ── 2. What it actually counts ── */
  console.log("\n2. Proved against real rows");
  const user = await prisma.user.create({
    data: {
      email: `${tag}@t.local`,
      name: tag,
      password: "x",
      referralCode: tag,
    },
    select: { id: true },
  });
  made.user = user.id;

  const board = await prisma.taskBoard.create({
    data: { title: `${tag} board`, pointsReward: 100, isActive: true },
    select: { id: true },
  });
  made.board = board.id;

  // One task inside the board, one identical task outside it. The only
  // difference between them is `boardId`, which is exactly the thing under test.
  const inBoard = await prisma.task.create({
    data: {
      title: `${tag} in-board video`,
      description: "x",
      type: "VIDEO",
      status: "ACTIVE",
      pointsReward: 10,
      xpReward: 1,
      contentUrl: "https://example.com/v",
      boardId: board.id,
    },
    select: { id: true },
  });
  made.inBoard = inBoard.id;
  const standalone = await prisma.task.create({
    data: {
      title: `${tag} standalone video`,
      description: "x",
      type: "VIDEO",
      status: "ACTIVE",
      pointsReward: 10,
      xpReward: 1,
      contentUrl: "https://example.com/v",
    },
    select: { id: true },
  });
  made.standalone = standalone.id;

  const items = [{ taskType: "VIDEO" }, { taskType: "BOARD" }];

  const subIn = await prisma.taskSubmission.create({
    data: { taskId: inBoard.id, userId: user.id, status: "AUTO_APPROVED" },
    select: { id: true },
  });
  made.subIn = subIn.id;
  const afterBoardTask = await buildDailyProgress(user.id, items);
  check(
    "a task inside a board does NOT count towards its own type",
    (afterBoardTask.VIDEO ?? 0) === 0,
    `VIDEO=${afterBoardTask.VIDEO ?? 0}`
  );
  check(
    "…and does NOT count as a board completion either",
    (afterBoardTask.BOARD ?? 0) === 0,
    `BOARD=${afterBoardTask.BOARD ?? 0}`
  );

  const subOut = await prisma.taskSubmission.create({
    data: { taskId: standalone.id, userId: user.id, status: "AUTO_APPROVED" },
    select: { id: true },
  });
  made.subOut = subOut.id;
  const afterStandalone = await buildDailyProgress(user.id, items);
  check(
    "the same task OUTSIDE a board still counts normally",
    (afterStandalone.VIDEO ?? 0) === 1,
    `VIDEO=${afterStandalone.VIDEO ?? 0}`
  );

  const claim = await prisma.boardClaim.create({
    data: {
      userId: user.id,
      boardId: board.id,
      pointsEarned: 100,
      xpEarned: 10,
      taskCount: 1,
    },
    select: { id: true },
  });
  made.claim = claim.id;
  const afterClaim = await buildDailyProgress(user.id, items);
  check(
    "finishing the board counts once",
    (afterClaim.BOARD ?? 0) === 1,
    `BOARD=${afterClaim.BOARD ?? 0}`
  );
  check(
    "…and finishing it does not retroactively credit its tasks",
    (afterClaim.VIDEO ?? 0) === 1,
    `VIDEO=${afterClaim.VIDEO ?? 0} (only the standalone one should count)`
  );

  /* ── 3. A board cannot be claimed twice ── */
  console.log("\n3. One board, one credit");
  let secondClaimRejected = false;
  try {
    await prisma.boardClaim.create({
      data: { userId: user.id, boardId: board.id, taskCount: 1 },
    });
  } catch {
    secondClaimRejected = true;
  }
  check(
    "the unique (userId, boardId) index makes a second claim impossible",
    secondClaimRejected,
    "without it, a re-claim would credit BOARD twice"
  );

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
}

async function cleanup() {
  // Reverse order of creation; each one is best-effort so a mid-run failure
  // still tidies as much as it can.
  const steps: Array<() => Promise<unknown>> = [
    () => prisma.boardClaim.deleteMany({ where: { userId: made.user } }),
    () => prisma.taskSubmission.deleteMany({ where: { userId: made.user } }),
    () =>
      prisma.task.deleteMany({
        where: { id: { in: [made.inBoard, made.standalone].filter(Boolean) } },
      }),
    () => prisma.taskBoard.deleteMany({ where: { id: made.board } }),
    () => prisma.transaction.deleteMany({ where: { userId: made.user } }),
    () => prisma.user.deleteMany({ where: { id: made.user } }),
  ];
  for (const s of steps) {
    try {
      await s();
    } catch {
      /* best effort */
    }
  }
  console.log("fixtures cleaned");
}

main()
  .catch((e) => {
    console.error(e);
    failures.push("threw");
  })
  .finally(async () => {
    await cleanup();
    process.exit(failures.length === 0 ? 0 : 1);
  });
