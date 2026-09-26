/**
 * Seed `UserActiveDay` from what users already did before the table existed,
 * so /admin/users/returning has history on day one. A day counts when the
 * account submitted a task, claimed a daily mission, posted, logged in, or was
 * seen on a device that day. Idempotent — re-running adds nothing twice.
 *
 *   npx tsx --tsconfig tsconfig.script.json scripts/backfill-active-days.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const before = await prisma.userActiveDay.count();
  await prisma.$executeRaw`
    INSERT INTO "UserActiveDay" ("userId", "date", "firstSeenAt")
    SELECT "userId", d::date, MIN(at) FROM (
      SELECT "userId", ("createdAt" AT TIME ZONE 'UTC') AS d, "createdAt" AS at FROM "TaskSubmission"
      UNION ALL
      SELECT "userId", to_date("date", 'YYYY-MM-DD'), "claimedAt" FROM "DailyMissionClaim"
      UNION ALL
      SELECT "userId", ("createdAt" AT TIME ZONE 'UTC'), "createdAt" FROM "Post"
      UNION ALL
      SELECT id, ("lastLoginAt" AT TIME ZONE 'UTC'), "lastLoginAt" FROM "User" WHERE "lastLoginAt" IS NOT NULL
      UNION ALL
      SELECT "userId", ("firstSeenAt" AT TIME ZONE 'UTC'), "firstSeenAt" FROM "UserDevice"
      UNION ALL
      SELECT "userId", ("lastSeenAt" AT TIME ZONE 'UTC'), "lastSeenAt" FROM "UserDevice"
    ) x
    GROUP BY "userId", d::date
    ON CONFLICT DO NOTHING`;
  const after = await prisma.userActiveDay.count();
  console.log(`UserActiveDay: ${before} → ${after} rows (+${after - before})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
