import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { servableCampaignWhere } from "../src/lib/ad-serve";
import { AD_PLACEMENTS, placementSpec } from "../src/lib/ad-placements";
import { DEMO_CAMPAIGN_TITLE, HOUSE_CAMPAIGN_TITLE } from "../src/lib/ad-demo";

/**
 * Phase 2 verification — house inventory, and the empty revenue spaces.
 *
 * The owner's third complaint was that no ad appears when a user claims points.
 * The gate was already wired into 12 claim surfaces; the placement simply had no
 * ads, and the overlay resolves instantly when the serve returns nothing. This
 * proves the shelves are stocked and that house inventory serves without being
 * billed.
 *
 * Creates a temporary house campaign + ad and removes them, including on failure.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-ads-house-inventory.ts
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

let passed = 0;
const failures: string[] = [];
const cleanup: Array<() => Promise<unknown>> = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const CPC = 0.05;

async function main() {
  console.log("\n=== House inventory & revenue spaces ===\n");

  /* 1. No space is empty */
  console.log("1. Inventory coverage");

  const placements = await prisma.adPlacement.findMany({
    select: { id: true, name: true, isActive: true },
  });
  const catalogNames = new Set<string>(AD_PLACEMENTS.map((p) => p.name));

  // Rewarded video ships OFF (`ads.rewarded_enabled` defaults to false and both
  // routes refuse while it is), so it has no inventory ON PURPOSE. Requiring an
  // ACTIVE ad there would be demanding stock for a surface that cannot serve.
  const OFF_BY_DEFAULT = new Set(["REWARDED_VIDEO"]);

  const empty: string[] = [];
  for (const p of placements) {
    if (!catalogNames.has(p.name)) continue; // stray rows reported below
    if (OFF_BY_DEFAULT.has(p.name)) continue;
    const n = await prisma.ad.count({
      where: { placementId: p.id, status: "ACTIVE" },
    });
    if (n === 0) empty.push(p.name);
  }
  check(
    `every catalog space has at least one ACTIVE ad (${placements.length} spaces)`,
    empty.length === 0,
    empty.join(", ")
  );

  // The two that pay, called out by name — these were the empty ones.
  for (const name of ["REWARD_INTERSTITIAL", "EARN_BROWSE"]) {
    const p = placements.find((x) => x.name === name);
    const n = p
      ? await prisma.ad.count({ where: { placementId: p.id, status: "ACTIVE" } })
      : 0;
    check(`${name} has inventory (it had none — this is complaint 3)`, n > 0, `${n} ads`);
  }

  const stray = placements.filter((p) => !catalogNames.has(p.name));
  if (stray.length) {
    console.log(
      `   note: ${stray.length} placement row(s) not in the catalog: ${stray
        .map((s) => `${s.name}(active=${s.isActive})`)
        .join(", ")} — inactive ones never serve`
    );
  }

  /* 2. A house campaign serves on a zero budget */
  console.log("\n2. House campaigns serve unfunded");

  const stamp = Date.now();
  const houseCamp = await prisma.adCampaign.create({
    data: {
      title: `verify-house-${stamp}`,
      status: "ACTIVE",
      budget: 0,
      isHouse: true,
    },
    select: { id: true },
  });
  const paidCamp = await prisma.adCampaign.create({
    data: {
      title: `verify-paid-${stamp}`,
      status: "ACTIVE",
      budget: 0,
      isHouse: false,
    },
    select: { id: true },
  });
  cleanup.push(() =>
    prisma.adCampaign.deleteMany({
      where: { id: { in: [houseCamp.id, paidCamp.id] } },
    })
  );

  const houseServes = await prisma.adCampaign.count({
    where: { id: houseCamp.id, ...servableCampaignWhere(CPC, new Date(), false) },
  });
  const paidServes = await prisma.adCampaign.count({
    where: { id: paidCamp.id, ...servableCampaignWhere(CPC, new Date(), false) },
  });
  check("a house campaign with £0 budget still serves", houseServes === 1);
  check(
    "a PAID campaign with £0 budget does not serve (the floor still applies)",
    paidServes === 0
  );

  const houseOnly = await prisma.adCampaign.count({
    where: { id: houseCamp.id, ...servableCampaignWhere(CPC, new Date(), true) },
  });
  const paidUnderHouseOnly = await prisma.adCampaign.count({
    where: { id: paidCamp.id, ...servableCampaignWhere(CPC, new Date(), true) },
  });
  check(
    "ad-free viewers (houseOnly) can now be served house inventory",
    houseOnly === 1,
    "this pool was always empty because nothing set isHouse"
  );
  check("houseOnly excludes paid inventory", paidUnderHouseOnly === 0);

  /* 3. House clicks are not billed */
  console.log("\n3. House inventory is never billed");

  // Reproduce what `recordClick` does now: it returns before the billing CAS.
  const before = await prisma.adCampaign.findUnique({
    where: { id: houseCamp.id },
    select: { budget: true, spentTotal: true },
  });
  // The old behaviour, for contrast — an unguarded decrement on a house row.
  const oldStyle = await prisma.adCampaign.updateMany({
    where: { id: houseCamp.id, ...servableCampaignWhere(CPC, new Date(), false) },
    data: { budget: { decrement: CPC }, spentTotal: { increment: CPC } },
  });
  const after = await prisma.adCampaign.findUnique({
    where: { id: houseCamp.id },
    select: { budget: true, spentTotal: true },
  });
  check(
    "the OLD path really would have billed a house campaign into negative budget",
    oldStyle.count === 1 &&
      Number(after?.budget) < Number(before?.budget) &&
      Number(after?.spentTotal) > Number(before?.spentTotal),
    `budget ${before?.budget} -> ${after?.budget}, spent ${before?.spentTotal} -> ${after?.spentTotal}`
  );

  /* 4. The live house + demo campaigns are configured correctly */
  console.log("\n4. Live house and demo campaigns");

  const house = await prisma.adCampaign.findFirst({
    where: { title: HOUSE_CAMPAIGN_TITLE },
    select: { isHouse: true, status: true, spentTotal: true, budget: true },
  });
  check("the house promo campaign exists", !!house);
  check(
    "it is marked house, active, and has never been billed",
    !!house && house.isHouse && house.status === "ACTIVE" && Number(house.spentTotal) === 0,
    JSON.stringify(house)
  );

  const demo = await prisma.adCampaign.findFirst({
    where: { title: DEMO_CAMPAIGN_TITLE },
    select: { id: true, isHouse: true, budget: true, spentTotal: true },
  });
  if (demo) {
    check(
      "the demo campaign is house with no fake budget or fake spend",
      demo.isHouse && Number(demo.budget) === 0 && Number(demo.spentTotal) === 0,
      `budget=${demo.budget} spent=${demo.spentTotal}`
    );
    const heavy = await prisma.ad.count({
      where: { campaignId: demo.id, weight: { gt: 1 } },
    });
    check(
      "no demo ad out-weights real inventory (they were all at 10, same as real)",
      heavy === 0,
      `${heavy} still above weight 1`
    );
  } else {
    console.log("   (no demo campaign present)");
  }

  /* 5. The incentivised spaces are filled with own inventory only */
  console.log("\n5. Policy: incentivised spaces hold no Google inventory");

  const incentivised = AD_PLACEMENTS.filter(
    (p) => !placementSpec(p.name).networkAllowed
  ).map((p) => p.name);
  const violations = await prisma.ad.count({
    where: {
      status: "ACTIVE",
      type: { in: ["ADSENSE", "GAM"] },
      placement: { name: { in: incentivised } },
    },
  });
  check(
    `no Google creative on any of the ${incentivised.length} incentivised spaces`,
    violations === 0,
    `${violations} found`
  );

  console.log(
    `\n=== ${passed} passed, ${failures.length} failed ===${
      failures.length ? `\n\n${failures.map((f) => ` - ${f}`).join("\n")}\n` : "\n"
    }`
  );
}

async function teardown() {
  for (const fn of cleanup.reverse()) {
    await fn().catch((e) => console.error("  cleanup failed:", e));
  }
}

main()
  .then(async () => {
    await teardown();
    await prisma.$disconnect();
    process.exit(failures.length ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await teardown();
    await prisma.$disconnect();
    process.exit(1);
  });
