import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { ensureHouseFallback, HOUSE_CAMPAIGN_TITLE } from "../src/lib/ad-demo";

/**
 * Fill the revenue ad spaces with house inventory.
 *
 * `REWARD_INTERSTITIAL` had zero ads, which is the whole reason no ad appeared
 * when a user claimed points: the gate is wired into 12 claim surfaces, but
 * `AdInterstitialOverlay` resolves instantly when the serve returns nothing.
 * `EARN_BROWSE` was empty too — the platform was paying users to view an empty
 * slot.
 *
 * Idempotent: skips any space that already has an ACTIVE ad, so it will never
 * displace real direct-sold inventory.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.script.json scripts/seed-house-ads.ts          # dry run
 *   npx tsx --tsconfig tsconfig.script.json scripts/seed-house-ads.ts --apply
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

const APPLY = process.argv.includes("--apply");

async function report(label: string) {
  const rows = await prisma.adPlacement.findMany({
    select: { id: true, name: true, isActive: true },
    orderBy: { name: "asc" },
  });
  console.log(`\n${label}`);
  for (const p of rows) {
    const active = await prisma.ad.count({
      where: { placementId: p.id, status: "ACTIVE" },
    });
    const flag = active === 0 ? "  <-- EMPTY" : "";
    console.log(
      `  ${p.name.padEnd(22)} activeAds=${String(active).padStart(2)}${flag}`
    );
  }
}

async function main() {
  console.log(`\n=== House ad fallback (${APPLY ? "APPLY" : "dry run"}) ===`);
  await report("Before:");

  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply.\n");
    await prisma.$disconnect();
    return;
  }

  const res = await ensureHouseFallback(prisma);
  console.log(`\nCreated ${res.created} house ads, skipped ${res.skipped} (already filled).`);

  await report("After:");

  const camp = await prisma.adCampaign.findFirst({
    where: { title: HOUSE_CAMPAIGN_TITLE },
    select: { id: true, isHouse: true, budget: true, status: true, spentTotal: true },
  });
  console.log(
    `\nHouse campaign: isHouse=${camp?.isHouse} status=${camp?.status} budget=${camp?.budget} spentTotal=${camp?.spentTotal}`
  );
  console.log("(never billed — see recordClick in src/lib/ad-events.ts)\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
