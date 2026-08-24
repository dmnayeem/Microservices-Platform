import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

/**
 * Clear residual `spentTotal` on house campaigns.
 *
 * A house campaign is the platform advertising to its own users. It bills
 * nothing — `recordClick` returns before the billing CAS for exactly this
 * reason, with the comment: *"Billing it would take the platform's money from
 * the platform's pocket and put it into `spentTotal`, which is the figure that
 * reports 'ad revenue earned' — so it would report income that never existed."*
 *
 * That guard arrived in Phase 2. Anything billed to a house campaign BEFORE it
 * was marked `isHouse` is still sitting in `spentTotal`, and Phase 7 has just
 * made `spentTotal` the headline "ad revenue (lifetime)" figure on
 * /admin/monetization. So the residue would now be displayed to the owner as
 * money he earned, when nobody ever paid it.
 *
 * The demo campaign is the known source: it was seeded ACTIVE with a $100,000
 * budget and billed itself on `targetUrl: "#demo"` clicks before Phase 2 turned
 * it into house inventory.
 *
 * Only touches campaigns with `isHouse: true`. Paid campaigns are never altered.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.script.json scripts/fix-house-campaign-spend.ts
 *   npx tsx --tsconfig tsconfig.script.json scripts/fix-house-campaign-spend.ts --apply
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`\n=== House campaign spend (${APPLY ? "APPLY" : "dry run"}) ===\n`);

  // Prisma's select generic degrades in this position (the same gotcha noted in
  // admin/analytics/page.tsx), so the row shape is stated explicitly.
  const house = (await prisma.adCampaign.findMany({
    where: { isHouse: true },
    select: {
      id: true,
      title: true,
      status: true,
      budget: true,
      spentTotal: true,
      // A house campaign with a real advertiser behind it would be a
      // mis-marked PAID campaign, and its spend would be real revenue. Shown so
      // the correction can never quietly erase money somebody actually paid.
      advertiserId: true,
      advertiser: { select: { email: true } },
      _count: { select: { ads: true } },
    },
    orderBy: { createdAt: "asc" },
  })) as unknown as Array<{
    id: string;
    title: string;
    status: string;
    budget: unknown;
    spentTotal: unknown;
    advertiserId: string | null;
    advertiser: { email: string } | null;
    _count: { ads: number };
  }>;

  if (house.length === 0) {
    console.log("  No house campaigns.\n");
    return;
  }

  let dirty = 0;
  for (const c of house) {
    const spent = Number(c.spentTotal);
    const flag = spent > 0 ? "  <-- fake revenue" : "";
    if (spent > 0) dirty++;
    console.log(
      `  ${c.title.padEnd(34)} status=${c.status.padEnd(8)} ` +
        `budget=${String(c.budget).padStart(10)} spentTotal=${String(c.spentTotal).padStart(10)} ` +
        `ads=${c._count.ads} advertiser=${c.advertiser?.email ?? "(none — platform-owned)"}${flag}`
    );
  }

  if (dirty === 0) {
    console.log("\n  Nothing to correct — no house campaign carries any spend.\n");
    return;
  }

  const total = house.reduce((s, c) => s + Number(c.spentTotal), 0);
  console.log(
    `\n  ${dirty} house campaign(s) carry $${total.toFixed(6)} of spend that nobody paid.\n` +
      "  Left alone, this is reported as lifetime ad revenue on /admin/monetization.\n"
  );

  if (!APPLY) {
    console.log("  Dry run — nothing written. Re-run with --apply.\n");
    return;
  }

  // Never touch a campaign that has a real advertiser behind it — if one is
  // marked house by mistake, its spend is real money and the mark is the bug.
  const withAdvertiser = house.filter(
    (c) => c.advertiserId && Number(c.spentTotal) > 0
  );
  if (withAdvertiser.length > 0) {
    console.log(
      `  SKIPPING ${withAdvertiser.length} campaign(s) that have a real advertiser.\n` +
        "  Their spend may be real revenue. Check whether isHouse is set correctly:\n" +
        withAdvertiser.map((c) => `    ${c.id}  ${c.title}`).join("\n") +
        "\n"
    );
  }

  const res = await prisma.adCampaign.updateMany({
    where: { isHouse: true, spentTotal: { gt: 0 }, advertiserId: null },
    data: { spentTotal: 0 },
  });
  console.log(`  Cleared spentTotal on ${res.count} house campaign(s).\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
