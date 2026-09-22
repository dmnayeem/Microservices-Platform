/**
 * Bring every stored level back in line with the XP curve.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/backfill-levels.ts
 *   …--apply     to actually write (dry run by default)
 *
 * Seven of the twelve XP-awarding paths never recomputed the level, so a user
 * who earned from a daily mission, a quiz, a board claim or an event sat at
 * 100% of their level until they happened to submit an ordinary task. Those
 * paths are fixed; this repairs the accounts they already left behind.
 *
 * Only ever raises. A curve change must not demote somebody who has already
 * been told they are level 9 — that is a broken promise, not a correction. If
 * a level genuinely has to come down, an admin does it deliberately.
 *
 * Dry run by default: this touches real accounts, and a report you can read
 * before anything is written is worth more than a fast fix.
 */
import { prisma } from "@/lib/prisma";
import { calculateLevel } from "@/lib/level";
import { ensureLevelCurve } from "@/lib/level-curve-server";

const APPLY = process.argv.includes("--apply");

async function main() {
  // Judge against the curve actually in force, not the shipped one.
  await ensureLevelCurve();

  const users = await prisma.user.findMany({
    select: { id: true, email: true, xp: true, level: true },
  });

  const behind = users
    .map((u) => ({ ...u, shouldBe: calculateLevel(u.xp) }))
    .filter((u) => u.shouldBe > u.level);

  const ahead = users
    .map((u) => ({ ...u, shouldBe: calculateLevel(u.xp) }))
    .filter((u) => u.shouldBe < u.level);

  console.log(`${users.length} accounts checked`);
  console.log(`  ${behind.length} behind the curve${APPLY ? " — raising" : " (dry run)"}`);
  console.log(`  ${ahead.length} above it — left alone on purpose`);

  for (const u of behind) {
    console.log(
      `    ${(u.email ?? u.id).slice(0, 34).padEnd(36)} xp=${String(u.xp).padStart(8)}  ${u.level} -> ${u.shouldBe}`
    );
  }
  for (const u of ahead) {
    console.log(
      `    (kept) ${(u.email ?? u.id).slice(0, 28).padEnd(30)} xp=${String(u.xp).padStart(8)}  stored ${u.level}, curve ${u.shouldBe}`
    );
  }

  if (!APPLY) {
    console.log("\nNothing written. Re-run with --apply.");
    return;
  }

  let done = 0;
  for (const u of behind) {
    await prisma.user.update({ where: { id: u.id }, data: { level: u.shouldBe } });
    done++;
  }
  console.log(`\n${done} account(s) raised.`);

  const still = (
    await prisma.user.findMany({ select: { xp: true, level: true } })
  ).filter((u) => calculateLevel(u.xp) > u.level).length;
  console.log(`accounts still behind: ${still}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
