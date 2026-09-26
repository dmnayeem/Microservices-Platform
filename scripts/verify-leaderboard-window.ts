/**
 * Leaderboard prizes rank the CYCLE being paid, not all-time totals.
 *
 *   npx tsx --tsconfig tsconfig.script.json scripts/verify-leaderboard-window.ts
 *
 * Read-only. The prize run used to hand the daily prize to the all-time leader
 * every day (one user: 16 payouts, 95,000 points).
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { cycleWindow, topUsersInWindow } from "../src/lib/leaderboard-window";
import { topUsers } from "../src/lib/leaderboard-reset";
import { getEligiblePackages } from "../src/lib/leaderboard";
import { completedBetween } from "../src/lib/submission-status";

let failed = 0;
const check = (name: string, ok: boolean, info?: unknown) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${info !== undefined ? `  → ${JSON.stringify(info)}` : ""}`);
  if (!ok) failed++;
};

async function main() {
  console.log("Cycle windows");
  const w = cycleWindow("daily", new Date("2026-09-24T15:00:00Z"));
  check("daily = that UTC day", w.from.toISOString() === "2026-09-24T00:00:00.000Z" && w.to.toISOString() === "2026-09-25T00:00:00.000Z");
  const wk = cycleWindow("weekly", new Date("2026-09-24T15:00:00Z")); // a Thursday
  check("weekly = ISO week, Monday to Monday", wk.from.toISOString() === "2026-09-21T00:00:00.000Z" && wk.to.toISOString() === "2026-09-28T00:00:00.000Z");
  const sun = cycleWindow("weekly", new Date("2026-09-27T23:00:00Z"));
  check("a Sunday belongs to the week that began on Monday", sun.from.toISOString() === "2026-09-21T00:00:00.000Z");
  const mo = cycleWindow("monthly", new Date("2026-12-15T00:00:00Z"));
  check("monthly rolls over the year", mo.from.toISOString() === "2026-12-01T00:00:00.000Z" && mo.to.toISOString() === "2027-01-01T00:00:00.000Z");

  console.log("\nAgainst the real data");
  const eligible = new Set((await getEligiblePackages()).map((s) => s.toUpperCase()));
  const allTime = await topUsers("POINTS_EARNED", 3, eligible);
  console.log("  all-time leaders:", JSON.stringify(allTime.map((r) => [r.name, r.value])));
  for (const day of ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"]) {
    const win = cycleWindow("daily", new Date(`${day}T12:00:00Z`));
    const top = await topUsersInWindow("POINTS_EARNED", 3, eligible, win);
    // Every winner's value must equal their own completed task points IN the day.
    let honest = true;
    for (const t of top) {
      const agg = await prisma.taskSubmission.aggregate({
        where: { AND: [{ userId: t.userId }, completedBetween(win.from, win.to)] },
        _sum: { pointsEarned: true },
      });
      const sum = (agg as unknown as { _sum: { pointsEarned: number | null } })._sum.pointsEarned ?? 0;
      if (sum !== t.value) honest = false;
    }
    check(`${day}: winners' scores are what they earned that day`, honest, top.map((r) => [r.name, r.value]));
  }
  const empty = await topUsersInWindow("COMBINED", 3, eligible, { from: new Date("2020-01-01"), to: new Date("2020-01-02") });
  check("a period with no activity has no winner (no prize)", empty.length === 0);
  const comb = await topUsersInWindow("COMBINED", 5, eligible, cycleWindow("weekly", new Date("2026-09-24T12:00:00Z")));
  check("combined ranking works on a real week", comb.length > 0, comb.map((r) => [r.name, r.value]));

  console.log(failed ? `\n${failed} FAILED` : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
