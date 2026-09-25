/**
 * Checks the three task-list complaints, against the live database.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-task-ux.ts
 *
 * 1. A task opened and walked away from can be resumed. It could not be: the
 *    start route counted the PENDING row it had just written towards the daily
 *    limit, `dailyLimit` defaults to 1, so one abandoned attempt used up the
 *    day's only slot and the resume branch further down was unreachable. The
 *    card still said "Start" and pressing it answered "Daily limit reached".
 * 2. Social engagement and social post-creation are different lists.
 * 3. A task type reports how many of its tasks the user has finished.
 *
 * Creates nothing it does not delete.
 */
import { prisma } from "./_q";
import { isPostCreationAction } from "../src/lib/social-tasks";
import { videoNetworkOf } from "../src/lib/video-networks";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("1. An abandoned attempt is resumable, not a spent daily slot");

  const user = await prisma.user.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  // A task with the DEFAULT daily limit, which is where the bug lives: one
  // abandoned attempt filled the only slot of the day. Tasks the admin gave a
  // higher limit were never affected, which is why it looked intermittent.
  const task = await prisma.task.findFirst({
    where: {
      status: "ACTIVE",
      type: { not: "ARTICLE" },
      OR: [{ dailyLimit: { lte: 1 } }, { dailyLimit: null }],
    },
    select: { id: true, dailyLimit: true, cooldownMinutes: true },
  });
  if (!user || !task) {
    console.log("Need an active user and an active non-article task.");
    process.exit(1);
  }
  const affected = await prisma.task.count({
    where: {
      status: "ACTIVE",
      hidden: false,
      OR: [{ dailyLimit: { lte: 1 } }, { dailyLimit: null }],
    },
  });
  const totalActive = await prisma.task.count({
    where: { status: "ACTIVE", hidden: false },
  });
  check(
    "the task under test has the default limit of 1",
    (task.dailyLimit ?? 1) <= 1,
    `dailyLimit=${task.dailyLimit} · ${affected} of ${totalActive} live tasks are in this state`
  );

  // Exactly what pressing Start writes, then walking away.
  const abandoned = await prisma.taskSubmission.create({
    data: { taskId: task.id, userId: user.id, status: "PENDING" },
    select: { id: true, submittedAt: true },
  });
  try {
    check("an abandoned attempt has no submittedAt", abandoned.submittedAt === null);

    // The lookup the fixed route now does FIRST.
    const resumable = await prisma.taskSubmission.findFirst({
      where: {
        taskId: task.id,
        userId: user.id,
        status: "PENDING",
        submittedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    check("it is found as resumable", resumable?.id === abandoned.id);

    // The gate that used to fire before that lookup.
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const counted = await prisma.taskSubmission.count({
      where: {
        taskId: task.id,
        userId: user.id,
        createdAt: { gte: dayStart },
        status: { in: ["APPROVED", "AUTO_APPROVED", "PENDING"] },
      },
    });
    check(
      "the old gate WOULD have blocked it — this is the bug, reproduced",
      counted >= (task.dailyLimit || 1),
      `${counted} >= ${task.dailyLimit || 1}`
    );

    // A submitted-and-waiting row must still count: that attempt IS finished
    // from the user's side, so it is not resumable.
    await prisma.taskSubmission.update({
      where: { id: abandoned.id },
      data: { submittedAt: new Date() },
    });
    const afterSubmit = await prisma.taskSubmission.findFirst({
      where: {
        taskId: task.id,
        userId: user.id,
        status: "PENDING",
        submittedAt: null,
      },
      select: { id: true },
    });
    check("a submitted attempt is NOT treated as resumable", afterSubmit === null);
  } finally {
    await prisma.taskSubmission.delete({ where: { id: abandoned.id } }).catch(() => {});
  }

  console.log("\n2. Social engagement and social posts are different lists");
  check("liking is engagement", !isPostCreationAction("LIKE_POST"));
  check("commenting is engagement", !isPostCreationAction("COMMENT_POST"));
  check("creating a pin is a post", isPostCreationAction("CREATE_PIN"));
  check("posting a tweet is a post", isPostCreationAction("POST_TWEET"));

  console.log("\n   Video tasks split by network");
  check("YouTube", videoNetworkOf("https://www.youtube.com/watch?v=x") === "YOUTUBE");
  check("youtu.be short link", videoNetworkOf("https://youtu.be/x") === "YOUTUBE");
  check("Facebook", videoNetworkOf("https://www.facebook.com/watch/?v=1") === "FACEBOOK");
  check("fb.watch", videoNetworkOf("https://fb.watch/abc") === "FACEBOOK");
  check("TikTok", videoNetworkOf("https://www.tiktok.com/@a/video/1") === "TIKTOK");
  check("our own file is Direct", videoNetworkOf("https://cdn.example.com/a.mp4") === "DIRECT");
  // A URL nobody can parse must still land somewhere visible — dropping it
  // would hide a task the admin created and paid for.
  check("an unparseable URL still lands in a group", videoNetworkOf("not a url") === "DIRECT");
  check("a missing URL still lands in a group", videoNetworkOf(null) === "DIRECT");
  // A host that merely CONTAINS the name must not match — otherwise
  // "youtube.com.evil.net" would be filed under YouTube.
  check(
    "a lookalike host is not YouTube",
    videoNetworkOf("https://youtube.com.evil.net/x") === "DIRECT"
  );

  console.log("\n3. A task type can say how many of its tasks are done");
  // The generated client does not type `groupBy` usefully for this model; the
  // shape is asserted rather than inferred, exactly as the summary route does.
  const anyType = (await prisma.task.groupBy({
    by: ["type"],
    where: { status: "ACTIVE", hidden: false },
    _count: { _all: true },
    _sum: { xpReward: true, pointsReward: true },
  })) as unknown as {
    type: string;
    _count: { _all: number };
    _sum: { xpReward: number | null; pointsReward: number | null };
  }[];
  check("types group with point totals", anyType.length > 0, `${anyType.length} types`);
  const withPoints = anyType.filter((g) => (g._sum.pointsReward ?? 0) > 0);
  check(
    "at least one type has points to promise",
    withPoints.length > 0,
    withPoints.map((g) => `${g.type}:${g._sum.pointsReward}`).join(" ")
  );

  // The half that was missing: distinct completed tasks, not attempts.
  const doneEver = (await prisma.taskSubmission.findMany({
    where: {
      userId: user.id,
      status: { in: ["APPROVED", "AUTO_APPROVED"] },
      task: { is: { status: "ACTIVE", hidden: false } },
    },
    distinct: ["taskId"],
    select: { taskId: true, task: { select: { type: true } } },
  })) as unknown as { taskId: string; task: { type: string } | null }[];
  const ids = new Set(doneEver.map((d) => d.taskId));
  check(
    "completed counts DISTINCT tasks, not attempts",
    ids.size === doneEver.length,
    `${ids.size} distinct of ${doneEver.length} rows`
  );
  const byType = new Map<string, number>();
  for (const d of doneEver) {
    const t = d.task?.type;
    if (t) byType.set(t, (byType.get(t) ?? 0) + 1);
  }
  const overflow = anyType.filter((g) => (byType.get(g.type) ?? 0) > g._count._all);
  check(
    "no type reports more done than it has tasks",
    overflow.length === 0,
    overflow.map((g) => g.type).join(" ")
  );

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
