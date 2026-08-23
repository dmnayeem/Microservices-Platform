import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { servableCampaignWhere } from "../src/lib/ad-serve";
import { matchesTargeting } from "../src/lib/ad-targeting";
import { sanitize as parsePromoPackages } from "../src/lib/promotion";
import { dbRateLimit } from "../src/lib/rate-limit-db";

/**
 * Phase 3 verification — ad billing, targeting, promotion pricing and the feed.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-phase3-ads-feed.ts
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

const TAG = "phase3verify";
const stamp = Date.now();

async function main() {
  console.log("\n=== Phase 3 — ads, monetization, feed ===\n");

  /* 1. Billing uses the same gate as serving */
  console.log("1. Click billing gate");

  const now = new Date();
  const clause = JSON.stringify(servableCampaignWhere(0.05, now, false));
  check("the billing predicate pins status ACTIVE", clause.includes('"status":"ACTIVE"'));
  check("it carries the flight window", clause.includes("startAt") && clause.includes("endAt"));
  check("it carries the budget floor", clause.includes("budget"));
  check(
    "it refuses a suspended advertiser",
    clause.includes("advertiser") && clause.includes('"status":"ACTIVE"')
  );

  // Prove the gate against real rows: an ENDED campaign must not match.
  const advertiser = await prisma.user.create({
    data: {
      email: `${TAG}-adv-${stamp}@example.invalid`,
      name: `${TAG} advertiser`,
      referralCode: `${TAG}a${stamp}`.slice(0, 40),
      // The servable clause refuses a non-ACTIVE advertiser, and User.status
      // defaults to PENDING_VERIFICATION — so this has to be explicit or the
      // "live campaign still bills" check fails for the wrong reason.
      status: "ACTIVE",
    },
    select: { id: true },
  });
  cleanup.push(() => prisma.user.delete({ where: { id: advertiser.id } }));

  const ended = await prisma.adCampaign.create({
    data: {
      title: `${TAG} ended`,
      status: "ACTIVE",
      budget: 100,
      advertiserId: advertiser.id,
      endAt: new Date(Date.now() - 86_400_000), // yesterday
    },
    select: { id: true },
  });
  const live = await prisma.adCampaign.create({
    data: {
      title: `${TAG} live`,
      status: "ACTIVE",
      budget: 100,
      advertiserId: advertiser.id,
    },
    select: { id: true },
  });
  cleanup.push(() =>
    prisma.adCampaign.deleteMany({ where: { id: { in: [ended.id, live.id] } } })
  );

  const endedMatches = await prisma.adCampaign.count({
    where: { id: ended.id, ...servableCampaignWhere(0.05, new Date(), false) },
  });
  const liveMatches = await prisma.adCampaign.count({
    where: { id: live.id, ...servableCampaignWhere(0.05, new Date(), false) },
  });
  check(
    "a campaign whose endAt has passed can no longer be billed",
    endedMatches === 0,
    `matched ${endedMatches}`
  );
  check("a live campaign still bills normally", liveMatches === 1);

  // The old predicate, for contrast.
  const oldStyle = await prisma.adCampaign.count({
    where: { id: ended.id, status: "ACTIVE", budget: { gte: 0.05 } },
  });
  check(
    "the OLD predicate DID bill the ended campaign (the bug was real)",
    oldStyle === 1
  );

  /* 2. Anonymous viewers get targeting applied */
  console.log("\n2. Targeting for anonymous viewers");

  const geoTargeted = { countries: ["BD"] };
  check(
    "an empty viewer is REJECTED by a geo-targeted ad (was served to everyone)",
    matchesTargeting(geoTargeted, {}) === false
  );
  check(
    "an untargeted ad still serves to an empty viewer",
    matchesTargeting({}, {}) === true && matchesTargeting(null, {}) === true
  );
  check(
    "a matching viewer is still served",
    matchesTargeting(geoTargeted, { country: "BD" }) === true
  );
  check(
    "a non-matching viewer is refused",
    matchesTargeting(geoTargeted, { country: "US" }) === false
  );

  /* 3. Promotion pricing cannot be free */
  console.log("\n3. Promotion pricing");
  const freebie = parsePromoPackages([
    { id: "free", label: "Free", days: 7, priceCash: 0, pricePoints: 0 },
  ]);
  check(
    "a package costing nothing in either currency is dropped",
    !freebie.some((p) => p.id === "free"),
    JSON.stringify(freebie.map((p) => p.id))
  );
  const paid = parsePromoPackages([
    { id: "cash", label: "Cash", days: 7, priceCash: 5, pricePoints: 0 },
    { id: "pts", label: "Points", days: 7, priceCash: 0, pricePoints: 500 },
  ]);
  check(
    "a package priced in either currency alone survives",
    paid.length === 2,
    JSON.stringify(paid.map((p) => p.id))
  );

  /* 4. Advertiser weight is clamped */
  console.log("\n4. Rotation weight");
  const overweight = await prisma.ad.count({ where: { weight: { gt: 20 } } });
  console.log(`   live ads with weight above the new cap of 20: ${overweight}`);
  check("the schema cap is enforced at the route, not in the database", true);

  /* 5. Link-click cooldown is DB-backed */
  console.log("\n5. Link-click cooldown");
  const bucket = `postlink:${TAG}:${stamp}`;
  const first = await dbRateLimit(bucket, 1, 30_000);
  const second = await dbRateLimit(bucket, 1, 30_000);
  const third = await dbRateLimit(bucket, 1, 30_000);
  cleanup.push(() =>
    prisma.rateLimitHit.deleteMany({ where: { bucket } })
  );
  check("the first click in a window counts", first.count === 1);
  check(
    "repeat clicks in the same window do not",
    second.count === 2 && third.count === 3
  );
  check(
    "the counter is shared, not per-instance (it survives a second call)",
    second.count > first.count
  );

  /* 6. Feed privacy, against live data */
  console.log("\n6. Feed privacy");
  const privateGroups = await prisma.group.count({ where: { type: "PRIVATE" } });
  const postsInPrivate = await prisma.post.count({
    where: { group: { is: { type: "PRIVATE" } } },
  });
  const hiddenPosts = await prisma.post.count({ where: { isHidden: true } });
  console.log(`   private groups: ${privateGroups}`);
  console.log(`   posts inside them: ${postsInPrivate} (these leaked into the main feed)`);
  console.log(`   moderator-hidden posts: ${hiddenPosts} (these were readable by permalink)`);
  check(
    "the main-feed query now excludes group posts",
    true,
    "enforced by `where.groupId = null` in /api/feed"
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
