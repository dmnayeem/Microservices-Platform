import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * How much of the public leaderboard is actually staff?
 *
 * The owner's instruction is that nobody who works on the platform —
 * super-admin, admin, moderator, any of them — appears in Top Earners or on
 * `/leaderboard`. Before filtering them out, measure what the boards look like
 * today, because the answer decides whether this is cosmetic or whether the
 * public ranking has been meaningless all along.
 *
 * Read-only. Safe to run against production.
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

// Mirrors STAFF_ROLES in src/lib/staff.ts.
const STAFF = [
  "SUPER_ADMIN",
  "ADMIN",
  "FINANCE_ADMIN",
  "CONTENT_ADMIN",
  "SUPPORT_ADMIN",
  "MARKETING_ADMIN",
  "MODERATOR",
  "AD_MANAGER",
] as const;

function bar(n: number, total: number) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return `${String(n).padStart(3)}/${total} (${String(pct).padStart(3)}%)`;
}

async function main() {
  const byRole = (await prisma.user.groupBy({
    by: ["role"],
    _count: { _all: true },
  })) as unknown as Array<{ role: string; _count: { _all: number } }>;

  console.log("\n=== accounts by role ===");
  for (const r of byRole.sort((a, b) => b._count._all - a._count._all)) {
    const mark = (STAFF as readonly string[]).includes(r.role) ? " <- staff" : "";
    console.log(`  ${r.role.padEnd(16)} ${String(r._count._all).padStart(6)}${mark}`);
  }
  const staffTotal = byRole
    .filter((r) => (STAFF as readonly string[]).includes(r.role))
    .reduce((s, r) => s + r._count._all, 0);
  console.log(`  ${"STAFF TOTAL".padEnd(16)} ${String(staffTotal).padStart(6)}`);

  const boards: Array<[string, Record<string, unknown>]> = [
    ["points / Top Earners (totalEarnings desc)", { totalEarnings: "desc" }],
    ["xp (xp desc)", { xp: "desc" }],
    ["tasks (taskSubmissions count desc)", { taskSubmissions: { _count: "desc" } }],
    ["referrals (referrals count desc)", { referrals: { _count: "desc" } }],
  ];

  for (const [label, orderBy] of boards) {
    const rows = (await prisma.user.findMany({
      orderBy: orderBy as never,
      take: 50,
      select: { id: true, name: true, username: true, role: true, totalEarnings: true },
    })) as unknown as Array<{
      name: string | null;
      username: string | null;
      role: string;
      totalEarnings: unknown;
    }>;
    const staff = rows.filter((r) => (STAFF as readonly string[]).includes(r.role));
    const top5 = rows.slice(0, 5).filter((r) => (STAFF as readonly string[]).includes(r.role));
    console.log(`\n=== ${label} ===`);
    console.log(`  staff in top 50: ${bar(staff.length, rows.length)}`);
    console.log(`  staff in top  5: ${bar(top5.length, Math.min(5, rows.length))}`);
    for (const [i, r] of rows.slice(0, 10).entries()) {
      const isStaff = (STAFF as readonly string[]).includes(r.role);
      console.log(
        `   ${String(i + 1).padStart(2)}. ${(r.name ?? r.username ?? "?")
          .slice(0, 24)
          .padEnd(24)} ${r.role.padEnd(14)} $${Number(r.totalEarnings).toFixed(2)}${
          isStaff ? "   <- staff" : ""
        }`
      );
    }
  }

  // The "participants" figure printed under the board.
  const [all, nonStaff] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: { notIn: STAFF as unknown as never } } }),
  ]);
  console.log(`\n=== totalParticipants ===`);
  console.log(`  counted today: ${all}`);
  console.log(`  real players : ${nonStaff}  (difference: ${all - nonStaff})`);

  process.exit(0);
}

main();
