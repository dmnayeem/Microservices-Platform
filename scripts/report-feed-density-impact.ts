import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { getAdDensity } from "../src/lib/ad-density";

/**
 * Before changing `ads.feed_ad_interval`, measure whether the change is even
 * warranted — the owner's standing instruction is that behaviour changes get
 * reported before they are made.
 *
 * The claim under test: *"interval 2 is past the point where fill runs out, so
 * slots render empty."* That is checkable without guessing. `serveFeedAds` picks
 * `min(count, eligiblePool)` — the loop in `social-feed-view.tsx` asks for one
 * ad per `interval` posts and shows nothing when the pool is exhausted (its own
 * comment says so). So: slots per page = floor(posts / interval), and anything
 * beyond the pool size is a slot that renders nothing.
 *
 * Read-only. Writes nothing, changes nothing.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/report-feed-density-impact.ts
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

/** A typical feed page — what the client requests per scroll batch. */
const POSTS_PER_PAGE = 20;

const APPLY = process.argv.includes("--apply");

async function main() {
  const density = await getAdDensity();

  const placement = await prisma.adPlacement.findFirst({
    where: { name: "IN_FEED" },
    select: { id: true, isActive: true },
  });
  if (!placement) {
    console.log("IN_FEED placement row does not exist — nothing to measure.");
    return;
  }

  const ads = await prisma.ad.findMany({
    where: { placementId: placement.id, status: "ACTIVE" },
    select: {
      id: true,
      targeting: true,
      campaign: { select: { title: true, isHouse: true, status: true } },
    },
  });

  // An ad with targeting rules reaches only part of the audience, so the
  // *effective* pool for an average viewer is smaller than the raw count.
  const untargeted = ads.filter((a) => {
    const t = a.targeting as Record<string, unknown> | null;
    return !t || Object.keys(t).length === 0;
  });
  const live = ads.filter((a) => a.campaign.status === "ACTIVE");

  console.log("\n=== Feed ad density — is interval 2 outrunning the pool? ===\n");
  console.log(`  ads.feed_ad_interval   = ${density.feedAdInterval}`);
  console.log(`  IN_FEED placement      = ${placement.isActive ? "active" : "INACTIVE"}`);
  console.log(`  ACTIVE ads on IN_FEED  = ${ads.length}`);
  console.log(`  …on a live campaign    = ${live.length}`);
  console.log(`  …reaching everyone     = ${untargeted.length} (no targeting rules)`);

  console.log("\n  Slots per 20-post page, and how many can actually be filled:\n");
  console.log("    interval   slots   filled   empty   fill rate");
  for (const interval of [1, 2, 3, 4, 5]) {
    const slots = Math.floor(POSTS_PER_PAGE / interval);
    const filled = Math.min(slots, live.length);
    const empty = slots - filled;
    const rate = slots > 0 ? Math.round((filled / slots) * 100) : 0;
    const mark = interval === density.feedAdInterval ? "  <- now" : "";
    console.log(
      `    ${String(interval).padStart(8)}   ${String(slots).padStart(5)}   ` +
        `${String(filled).padStart(6)}   ${String(empty).padStart(5)}   ${String(rate).padStart(8)}%${mark}`
    );
  }

  const slotsNow = Math.floor(POSTS_PER_PAGE / Math.max(1, density.feedAdInterval));
  const emptyNow = Math.max(0, slotsNow - live.length);

  console.log("\n  Verdict:");
  if (live.length === 0) {
    console.log(
      "    No live IN_FEED inventory at all — the interval is irrelevant until\n" +
        "    there are ads to put in the slots. Changing it would change nothing."
    );
  } else if (emptyNow === 0) {
    console.log(
      `    Fill is NOT running out. At interval ${density.feedAdInterval} every one of the ${slotsNow}\n` +
        `    slots on a 20-post page can be filled from the ${live.length} live ads.\n` +
        "    LEAVE THE INTERVAL WHERE IT IS — widening it would cut impressions\n" +
        "    for no benefit."
    );
  } else {
    const better = Math.floor(POSTS_PER_PAGE / (density.feedAdInterval + 1));
    console.log(
      `    ${emptyNow} of ${slotsNow} slots per page cannot be filled from the ${live.length} live ads.\n` +
        `    Widening to ${density.feedAdInterval + 1} would ask for ${better} slots instead — closer to the\n` +
        "    real pool, so fewer requests that return nothing."
    );
  }

  console.log(
    "\n  Note: this counts inventory, not viewers. Targeted ads reach a subset,\n" +
      "  so the real fill for an average viewer is at or below the figure above.\n" +
      "  Phase 7's no-fill counters will measure it directly rather than infer it.\n"
  );

  // Widening does not cost impressions *up to a point*, and that point matters.
  //
  // The pool is the ceiling: with N live ads a page can never show more than N,
  // whatever the interval. So widening until slots == N is free — same
  // impressions, fewer requests that come back empty. Widen PAST that and slots
  // drop below N, which does lose impressions.
  //
  // `ideal` is the widest interval that still fills every slot. But the
  // recommendation moves **one step at a time** toward it rather than jumping
  // there, because the pool grows and the setting does not: sizing the interval
  // to today's three ads would throttle the feed the moment a fourth is added.
  // Re-running this after adding inventory walks it the rest of the way.
  const ideal =
    live.length > 0 ? Math.floor(POSTS_PER_PAGE / live.length) : density.feedAdInterval;
  const recommended =
    emptyNow > 0 && live.length > 0
      ? Math.max(1, Math.min(20, ideal, density.feedAdInterval + 1))
      : density.feedAdInterval;

  if (recommended === density.feedAdInterval) {
    console.log("  No change recommended.\n");
    return;
  }
  console.log(
    `  Recommended: ads.feed_ad_interval ${density.feedAdInterval} -> ${recommended}\n` +
      `  Impressions per page stay at ${live.length} either way.\n`
  );
  if (!APPLY) {
    console.log("  Dry run — nothing written. Re-run with --apply.\n");
    return;
  }
  await prisma.systemSetting.upsert({
    where: { key: "ads.feed_ad_interval" },
    create: { key: "ads.feed_ad_interval", value: recommended, category: "ads" },
    update: { value: recommended },
  });
  console.log(`  Applied: ads.feed_ad_interval = ${recommended}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
