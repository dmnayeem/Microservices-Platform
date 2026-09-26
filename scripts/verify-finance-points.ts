/**
 * Where points come from — the classifier, the breakdown, and money by feature,
 * against the real ledger.
 *
 *   npx tsx --tsconfig tsconfig.script.json scripts/verify-finance-points.ts
 *
 * Read-only.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { pointSourceOf, submissionIdOf } from "../src/lib/finance/points-source";
import { getPointsBreakdown } from "../src/lib/finance/points-breakdown";
import { getFinancePulse } from "../src/lib/finance/pulse";
import { getRevenueBreakdown } from "../src/lib/finance/revenue";
import { getLedgerTotals } from "../src/lib/finance/series";
import { getPayrollExpense } from "../src/lib/payroll/run";
import { getMoneyByFeature } from "../src/lib/finance/by-feature";
import { isPointsEarned } from "../src/lib/finance/signing";

let failed = 0;
const check = (name: string, ok: boolean, info?: unknown) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${info !== undefined ? `  → ${JSON.stringify(info)}` : ""}`);
  if (!ok) failed++;
};

async function main() {
  console.log("Classifier — the prefixes writers actually use");
  const cases: Array<[string, string | null, string]> = [
    ["EARNING", "leaderboard_2026-09-24_daily_cmsmz8iwo007lduesuw091wbs", "leaderboard"],
    ["EARNING", "daily_mission_abc", "daily_mission"],
    ["EARNING", "daily_referral_abc", "referral"],
    ["EARNING", "daily_2026-09-26", "checkin"],
    ["EARNING", "quiz_reward_cmugerm7f2je0000000000000", "quiz_game"],
    ["EARNING", "quiz_cmugerm7f2je00000000000000", "task"],
    ["EARNING", "task_cmosqlbsq0001dqk369u1wo10_cmosqmij90003dqk3w18h5xfz", "task"],
    ["EARNING", "cmt64t4r502wng8mgu1o73bqi", "task"],
    ["EARNING", "social_like_received_x", "social"],
    ["BONUS", null, "admin_grant"],
    ["BONUS", "admin_edit_u_1", "admin_grant"],
    ["BONUS", "admin_adjust_u_1", "admin_grant"],
    ["BONUS", "welcome_u", "welcome"],
    ["BONUS", "browse_2026-09-25_u", "browse"],
    ["REFERRAL", "referral_sub_L1", "referral"],
  ];
  for (const [type, ref, want] of cases) {
    const got = pointSourceOf({ type, reference: ref });
    check(`${type} ${ref ?? "(no reference)"} → ${want}`, got === want, got === want ? undefined : got);
  }
  check(
    "task_<taskId>_<submissionId> yields the SUBMISSION id",
    submissionIdOf("task_cmosqlbsq0001dqk369u1wo10_cmosqmij90003dqk3w18h5xfz") === "cmosqmij90003dqk3w18h5xfz"
  );
  check(
    "a PENALTY never counts as points earned",
    !isPointsEarned({ type: "PENALTY", status: "COMPLETED", reference: "admin_edit_x", amount: 0, points: -500 })
  );

  console.log("\nThe live ledger");
  const all = await getPointsBreakdown(new Date(Date.UTC(2000, 0, 1)), new Date(Date.now() + 86_400_000));
  const other = all.bySource.find((s) => s.source === "other");
  check("every paid point has a known source (no 'Other')", !other, other);
  const unknownTask = all.taskByType.find((t) => t.type === "UNKNOWN");
  check("task points resolve to a task type (only deleted tasks unresolved)", !unknownTask || unknownTask.rows <= 5, unknownTask);

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [today, pulse] = await Promise.all([
    getPointsBreakdown(start, new Date(start.getTime() + 86_400_000)),
    getFinancePulse(),
  ]);
  check("today's breakdown total = the 'Points earned today' card", today.totalPoints === pulse.pointsEarned.day, [today.totalPoints, pulse.pointsEarned.day]);
  const bySrc = today.bySource.reduce((a, s) => a + s.points, 0);
  const byUsr = today.byUser.reduce((a, u) => a + u.points, 0);
  check("by-source and by-user both add up to the total", bySrc === today.totalPoints && byUsr === today.totalPoints, [bySrc, byUsr, today.totalPoints]);

  const from = new Date(start);
  from.setUTCDate(from.getUTCDate() - 29);
  const rev = await getRevenueBreakdown({ from });
  const [feat, totals, payroll] = await Promise.all([
    getMoneyByFeature(rev, from, new Date(start.getTime() + 86_400_000)),
    getLedgerTotals({ from }),
    getPayrollExpense({ from }),
  ]);
  const featOut = feat.rows.reduce((a, r) => a + r.outUsd, 0) + feat.unassignedOutUsd;
  const featIn = feat.rows.reduce((a, r) => a + r.inUsd, 0);
  check(
    "30 days: 'Paid to users' by feature = the Overview card",
    Math.abs(featOut - (totals.costUsd - payroll.usd)) < 0.01,
    [featOut.toFixed(2), (totals.costUsd - payroll.usd).toFixed(2)]
  );
  check("30 days: money in by feature = the revenue total", Math.abs(featIn - rev.totalUsd) < 0.01, [featIn.toFixed(2), rev.totalUsd.toFixed(2)]);

  const grants = all.adminGrants;
  check("hand grants name who granted them where it was recorded", grants.every((g) => g.grantedBy !== undefined));

  await prisma.$disconnect().catch(() => {});
  console.log(failed ? `\n${failed} FAILED` : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
