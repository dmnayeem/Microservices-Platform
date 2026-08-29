import { prisma } from "./_q";

/**
 * Does the money add up?
 *
 * Everything here is read-only, and every check is phrased as a question with a
 * right answer, not as a metric. The point is to find rows that contradict each
 * other — a balance no ledger explains, an approved submission nobody was paid
 * for, a withdrawal that never left a balance — because those are the shapes
 * that become "where did my money go" tickets after launch.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/audit-money-integrity.ts
 */

let problems = 0;
function ok(label: string, detail?: string) {
  console.log(`  ok    ${label}${detail ? ` — ${detail}` : ""}`);
}
function bad(label: string, detail: string) {
  problems++;
  console.log(`  ISSUE ${label}\n        ${detail}`);
}
const n = (v: unknown) => Number(v ?? 0);
const usd = (v: unknown) => `$${n(v).toFixed(4)}`;

async function main() {
  console.log("\n=== Money integrity (live data) ===\n");

  const users = (await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      pointsBalance: true,
      cashBalance: true,
      adCreditBalance: true,
      totalEarnings: true,
      totalWithdrawals: true,
    },
  })) as unknown as Array<{
    id: string;
    name: string | null;
    email: string;
    role: string;
    pointsBalance: number;
    cashBalance: unknown;
    adCreditBalance: unknown;
    totalEarnings: unknown;
    totalWithdrawals: unknown;
  }>;
  const byId = new Map(users.map((u) => [u.id, u]));
  console.log(`  (${users.length} accounts)\n`);

  /* 1. Nothing is negative. */
  console.log("1. No balance is below zero");
  const neg = users.filter(
    (u) => u.pointsBalance < 0 || n(u.cashBalance) < 0 || n(u.adCreditBalance) < 0
  );
  if (neg.length === 0) ok("every points / cash / ad-credit balance is >= 0");
  else
    bad(
      "an account is carrying a negative balance",
      neg
        .map(
          (u) =>
            `${u.email} pts=${u.pointsBalance} cash=${usd(u.cashBalance)} credit=${usd(u.adCreditBalance)}`
        )
        .join("\n        ")
    );

  /* 2. Idempotency keys are unique per user. */
  console.log("\n2. No money event was written twice");
  const dupes = (await prisma.$queryRawUnsafe(
    `SELECT "userId", "reference", COUNT(*)::int AS c, SUM("points")::int AS pts
       FROM "Transaction"
      WHERE "reference" IS NOT NULL
      GROUP BY 1,2 HAVING COUNT(*) > 1
      ORDER BY c DESC LIMIT 20`
  )) as Array<{ userId: string; reference: string; c: number; pts: number }>;
  if (dupes.length === 0)
    ok("no (user, reference) pair appears twice in the ledger");
  else
    bad(
      "the same money event was recorded more than once",
      dupes
        .map(
          (d) =>
            `${byId.get(d.userId)?.email ?? d.userId} ${d.reference} x${d.c} (${d.pts} pts)`
        )
        .join("\n        ")
    );

  /* 3. Approved work was actually paid. */
  console.log("\n3. Every approved submission has a ledger row");
  const approved = (await prisma.taskSubmission.findMany({
    where: { status: { in: ["APPROVED", "AUTO_APPROVED"] } },
    select: {
      id: true,
      userId: true,
      taskId: true,
      status: true,
      createdAt: true,
      task: { select: { title: true, pointsReward: true } },
    },
  })) as unknown as Array<{
    id: string;
    userId: string;
    taskId: string;
    status: string;
    createdAt: Date;
    task: { title: string; pointsReward: number } | null;
  }>;
  // A paid submission can carry any of THREE reference shapes, and checking
  // only the newest one reports two thirds of the ledger as missing:
  //   task_<taskId>_<submissionId>  the current convention
  //   <submissionId>                what the admin approval path wrote before
  //                                 the reference was made task-scoped
  //   quiz_<submissionId>           /api/tasks/quiz, which pays inline
  // The check is "was this submission paid", not "does it match today's key".
  const taskTx = (await prisma.transaction.findMany({
    where: {
      OR: [
        { reference: { startsWith: "task_" } },
        { reference: { startsWith: "quiz_" } },
      ],
    },
    select: { userId: true, reference: true, points: true },
  })) as unknown as Array<{
    userId: string;
    reference: string;
    points: number;
  }>;
  const submissionIds = new Set(approved.map((s) => s.id));
  const legacyTx = (await prisma.transaction.findMany({
    where: { reference: { in: [...submissionIds] } },
    select: { userId: true, reference: true, points: true },
  })) as unknown as Array<{
    userId: string;
    reference: string;
    points: number;
  }>;
  const refs = new Set(
    [...taskTx, ...legacyTx].map((t) => `${t.userId}|${t.reference}`)
  );
  const paidFor = (userId: string, taskId: string, subId: string) =>
    refs.has(`${userId}|task_${taskId}_${subId}`) ||
    refs.has(`${userId}|quiz_${subId}`) ||
    refs.has(`${userId}|${subId}`);
  const unpaid = approved.filter(
    (s) =>
      !paidFor(s.userId, s.taskId, s.id) &&
      // A zero-reward task has nothing to pay, so it has no ledger row and is
      // not evidence of anything.
      (s.task?.pointsReward ?? 0) > 0
  );
  console.log(`  (${approved.length} approved submissions, ${taskTx.length} task payments)`);
  if (unpaid.length === 0)
    ok("every approved submission has its matching EARNING row");
  else
    bad(
      `${unpaid.length} approved submission(s) were never paid`,
      unpaid
        .slice(0, 12)
        .map(
          (s) =>
            `${byId.get(s.userId)?.email ?? s.userId} "${s.task?.title ?? s.taskId}" ${s.status} ${s.createdAt.toISOString().slice(0, 10)} (${s.task?.pointsReward ?? "?"} pts)`
        )
        .join("\n        ")
    );

  /* 4. …and nothing unapproved was paid. */
  console.log("\n4. No task payment without an approved submission");
  const approvedRefs = new Set([
    ...approved.map((s) => `${s.userId}|task_${s.taskId}_${s.id}`),
    ...approved.map((s) => `${s.userId}|quiz_${s.id}`),
    ...approved.map((s) => `${s.userId}|${s.id}`),
  ]);
  // Only rows that are SUPPOSED to name a submission. `quiz_reward_*` comes
  // from the standalone Quiz Games feature (`/api/quizzes/[id]/attempt`), which
  // has no TaskSubmission at all, and milestone bonuses like `tasks_5` are not
  // task payments either — counting those as orphans reports the platform's own
  // working features as missing paperwork.
  const orphanPay = taskTx.filter(
    (t) =>
      (t.reference.startsWith("task_") ||
        // `quiz_<submissionId>` is the task-quiz payment. `quiz_reward_*` and
        // the older `quiz_<quizId>_<attemptId>` both belong to standalone Quiz
        // Games, which never create a TaskSubmission.
        (t.reference.startsWith("quiz_") &&
          submissionIds.has(t.reference.slice("quiz_".length)))) &&
      !approvedRefs.has(`${t.userId}|${t.reference}`)
  );
  if (orphanPay.length === 0)
    ok(`all ${taskTx.length} task payments trace back to an approved submission`);
  else
    bad(
      `${orphanPay.length} task payment(s) have no approved submission behind them`,
      orphanPay
        .slice(0, 12)
        .map(
          (t) =>
            `${byId.get(t.userId)?.email ?? t.userId} ${t.reference} ${t.points} pts`
        )
        .join("\n        ")
    );

  /* 5. Withdrawals. */
  console.log("\n5. Withdrawals");
  const wds = (await prisma.withdrawal.findMany({
    select: {
      id: true,
      userId: true,
      amount: true,
      status: true,
      createdAt: true,
    },
  })) as unknown as Array<{
    id: string;
    userId: string;
    amount: unknown;
    status: string;
    createdAt: Date;
  }>;
  const byStatus: Record<string, number> = {};
  for (const w of wds) byStatus[w.status] = (byStatus[w.status] ?? 0) + 1;
  console.log(`  (${wds.length} withdrawals: ${JSON.stringify(byStatus)})`);
  const wdTx = (await prisma.transaction.findMany({
    where: { type: "WITHDRAWAL" },
    select: { userId: true, reference: true, amount: true, status: true },
  })) as unknown as Array<{
    userId: string;
    reference: string | null;
    amount: unknown;
    status: string;
  }>;
  const settled = wds.filter((w) =>
    ["COMPLETED", "PROCESSING", "APPROVED"].includes(w.status)
  );
  const missingLedger = settled.filter(
    (w) => !wdTx.some((t) => t.reference?.includes(w.id))
  );
  if (missingLedger.length === 0)
    ok(`all ${settled.length} settled/in-flight withdrawal(s) have a ledger row`);
  else
    bad(
      `${missingLedger.length} withdrawal(s) moved without a ledger row`,
      missingLedger
        .slice(0, 12)
        .map(
          (w) =>
            `${byId.get(w.userId)?.email ?? w.userId} ${usd(w.amount)} ${w.status} ${w.id}`
        )
        .join("\n        ")
    );

  /* 6. Funded tasks never pay out more than they were funded. */
  console.log("\n6. A funded task never pays out more than its budget");
  const funded = (await prisma.task.findMany({
    where: { fundedByUserId: { not: null } },
    select: {
      id: true,
      title: true,
      pointsReward: true,
      budgetPoints: true,
      remainingBudget: true,
      completedCount: true,
      status: true,
    },
  })) as unknown as Array<{
    id: string;
    title: string;
    pointsReward: number;
    budgetPoints: number;
    remainingBudget: number;
    completedCount: number;
    status: string;
  }>;
  console.log(`  (${funded.length} user-funded tasks)`);
  const overspent = funded.filter(
    (t) =>
      t.completedCount * t.pointsReward > t.budgetPoints
  );
  const negBudget = funded.filter((t) => t.remainingBudget < 0);
  if (overspent.length === 0 && negBudget.length === 0)
    ok("no funded task paid more than it was funded, and none is negative");
  else
    bad(
      "a funded task is over budget",
      [...overspent, ...negBudget]
        .slice(0, 12)
        .map(
          (t) =>
            `"${t.title}" reward=${t.pointsReward} x${t.completedCount} budget=${t.budgetPoints} remaining=${t.remainingBudget}`
        )
        .join("\n        ")
    );

  /* 7. Referrals. */
  console.log("\n7. Referrals");
  const refEarnCount = await prisma.referralEarning.count();
  const referred = await prisma.user.count({
    where: { referredById: { not: null } },
  });
  console.log(`  (${refEarnCount} referral earnings, ${referred} referred accounts)`);
  const selfReferred = (await prisma.$queryRawUnsafe(
    `SELECT id, email FROM "User" WHERE "referredById" = id LIMIT 10`
  )) as Array<{ id: string; email: string }>;
  if (selfReferred.length === 0) ok("nobody referred themselves");
  else
    bad(
      "an account is its own referrer",
      selfReferred.map((u) => u.email).join(", ")
    );

  /* 8. Stored totals vs the ledger. */
  console.log("\n8. Stored totals vs the ledger");
  const credits = (await prisma.$queryRawUnsafe(
    `SELECT "userId", SUM("amount")::float8 AS earned
       FROM "Transaction"
      WHERE "status" = 'COMPLETED'
        AND "type" IN ('EARNING','BONUS','REFERRAL','LOTTERY_WIN','CHECKIN','AFFILIATE_COMMISSION','COURSE_TUTOR_EARNING','GIFT')
      GROUP BY 1`
  )) as Array<{ userId: string; earned: number }>;
  const drift = credits
    .map((c) => ({
      u: byId.get(c.userId),
      earned: c.earned,
      stored: n(byId.get(c.userId)?.totalEarnings),
    }))
    .filter((d) => d.u && Math.abs(d.earned - d.stored) > 0.01);
  if (drift.length === 0)
    ok("every account's totalEarnings matches its credited ledger rows");
  else
    bad(
      `${drift.length} account(s) where totalEarnings disagrees with the ledger`,
      drift
        .slice(0, 15)
        .map(
          (d) =>
            `${d.u!.email} stored=${usd(d.stored)} ledger=${usd(d.earned)} diff=${usd(d.stored - d.earned)}`
        )
        .join("\n        ")
    );

  console.log(
    `\n${problems === 0 ? "No money issues found." : `${problems} issue area(s) found.`}\n`
  );
  process.exit(0);
}
main();
