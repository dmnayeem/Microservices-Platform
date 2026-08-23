import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { calculateLevel, calculateXpForLevel } from "../src/lib/level";

/**
 * Bring every stored `User.level` back in line with the one canonical curve.
 *
 * Why levels drifted:
 *  - The two API routes that write `User.level` each carried their own
 *    threshold table, and both dropped a level at 22,000 XP and above (their
 *    `Math.floor(10 + (xp - 22000) / 10000)` returns 10 at exactly 22,000 where
 *    `calculateXpForLevel(11) === 22000` says 11). The progress bar is drawn
 *    from the canonical table, so an affected user sat at 100% of their level
 *    forever.
 *  - The auto-approve path computed the new level from `user.xp + effectiveXp`
 *    where `user` was already the post-increment row, counting every reward's
 *    XP twice — so people also levelled up too FAST.
 *  - The admin approval path never recomputed the level at all, so anyone
 *    earning only through manually-reviewed tasks never levelled up.
 *
 * All three are fixed in code; this repairs the rows they left behind.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.script.json scripts/resync-user-levels.ts          # dry run
 *   npx tsx --tsconfig tsconfig.script.json scripts/resync-user-levels.ts --apply
 *
 * Idempotent: a second run is a no-op.
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`\n=== Level resync (${APPLY ? "APPLY" : "dry run"}) ===\n`);

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, xp: true, level: true },
    orderBy: { xp: "desc" },
  });

  const drops: typeof users = [];
  const rises: typeof users = [];

  for (const u of users) {
    const correct = calculateLevel(u.xp);
    if (correct === u.level) continue;
    (correct < u.level ? drops : rises).push(u);
  }

  const show = (label: string, rows: typeof users) => {
    console.log(`${label}: ${rows.length}`);
    for (const u of rows.slice(0, 25)) {
      const correct = calculateLevel(u.xp);
      console.log(
        `   ${u.name ?? u.email ?? u.id}  xp=${u.xp}  ${u.level} -> ${correct}` +
          `   (level ${correct} starts at ${calculateXpForLevel(correct)} XP)`
      );
    }
    if (rows.length > 25) console.log(`   … and ${rows.length - 25} more`);
  };

  show("Levels that will RISE (they had earned it)", rises);
  console.log("");
  show("Levels that will DROP (they were over-credited)", drops);

  const total = rises.length + drops.length;
  console.log(`\n${users.length} users scanned, ${total} need correcting.`);

  if (!APPLY) {
    console.log("\nDry run — nothing was written. Re-run with --apply.\n");
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (const u of [...rises, ...drops]) {
    await prisma.user.update({
      where: { id: u.id },
      data: { level: calculateLevel(u.xp) },
    });
    done++;
  }
  console.log(`\nUpdated ${done} users.\n`);

  // Prove it: nothing should disagree on a re-read.
  const after = await prisma.user.findMany({ select: { xp: true, level: true } });
  const stillWrong = after.filter((u) => calculateLevel(u.xp) !== u.level).length;
  console.log(
    stillWrong === 0
      ? "Verified: every stored level now matches the canonical curve.\n"
      : `WARNING: ${stillWrong} users still disagree.\n`
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
