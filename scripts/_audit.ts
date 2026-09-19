import "dotenv/config";
import { prisma } from "../src/lib/prisma";
async function main() {
  const apps = await prisma.creatorApplication.groupBy({ by: ["type", "status"], _count: { _all: true } }) as unknown as { type: string; status: string; _count: { _all: number } }[];
  console.log("applications:");
  for (const a of apps) console.log(`  ${a.type.padEnd(20)} ${a.status.padEnd(9)} ${a._count._all}`);
  if (!apps.length) console.log("  (none yet)");

  // Who actually has buyer access right now, however it was granted.
  const users = await prisma.user.findMany({ select: { id: true, featureOverrides: true } });
  let createTasks = 0, socialTasks = 0;
  for (const u of users) {
    const o = (u.featureOverrides ?? {}) as Record<string, unknown>;
    if (o.createTasks === true) createTasks++;
    if (o.socialTasks === true) socialTasks++;
  }
  console.log(`users with createTasks granted: ${createTasks} of ${users.length}`);
  console.log(`users with socialTasks granted: ${socialTasks}`);

  const funded = await prisma.task.count({ where: { fundedByUserId: { not: null } } });
  const buyers = await prisma.task.findMany({ where: { fundedByUserId: { not: null } }, select: { fundedByUserId: true }, distinct: ["fundedByUserId"] });
  console.log(`tasks funded by a buyer: ${funded}, distinct buyers: ${buyers.length}`);
}
main().finally(() => process.exit(0));
