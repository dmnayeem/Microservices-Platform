import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  AD_PLACEMENTS,
  placementSpec,
  placementSizeKey,
  sizeFitsPlacement,
  typeFitsPlacement,
  checkAdFitsPlacement,
} from "../src/lib/ad-placements";
import { AD_SIZES, resolveAdSize } from "../src/lib/ad-sizes";

/**
 * Phase 1 verification — the per-space size contract.
 *
 * Two of the owner's three complaints come down to one thing: nothing tied a
 * creative's size to the space it was going into. This proves the rule now holds
 * on the way in AND at render time — the second matters because the 44 ads
 * already in the database cannot be reached by write-time validation.
 *
 * Read-only. Creates nothing.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-ads-size-contract.ts
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("\n=== Ad size contract ===\n");

  /* 1. Every space has a spec, and it is coherent */
  console.log("1. The spec itself");

  const missing = AD_PLACEMENTS.filter((p) => !placementSpec(p.name).sizes.length);
  check("every placement has at least one allowed size", missing.length === 0);

  const knownKeys = new Set(AD_SIZES.map((s) => s.key));
  const bogus = AD_PLACEMENTS.flatMap((p) =>
    placementSpec(p.name).sizes.filter((s) => !knownKeys.has(s)).map((s) => `${p.name}:${s}`)
  );
  check("every allowed size is a real AD_SIZES key", bogus.length === 0, bogus.join(", "));

  const defaultNotAllowed = AD_PLACEMENTS.filter(
    (p) => !placementSpec(p.name).sizes.includes(placementSizeKey(p.name))
  );
  check(
    "each space's default size is one it actually allows",
    defaultNotAllowed.length === 0,
    defaultNotAllowed.map((p) => p.name).join(", ")
  );

  // A preset that is taller than the space's ceiling would render letterboxed
  // rather than at its declared size — allowed, but worth knowing about.
  const tallerThanCap = AD_PLACEMENTS.flatMap((p) => {
    const spec = placementSpec(p.name);
    return spec.sizes
      .map((k) => ({ k, d: resolveAdSize(k) }))
      .filter((x) => x.d && x.d.h > spec.maxHeightPx)
      .map((x) => `${p.name}:${x.k}(${x.d!.h}>${spec.maxHeightPx})`);
  });
  check(
    "no space allows a preset taller than its own ceiling",
    tallerThanCap.length === 0,
    tallerThanCap.join(", ")
  );

  /* 2. The rule rejects what it should */
  console.log("\n2. Size fits space");

  check(
    'a "story" creative is refused in DASHBOARD',
    !sizeFitsPlacement("DASHBOARD", "story")
  );
  check(
    'a "story" creative is accepted in REWARD_INTERSTITIAL',
    sizeFitsPlacement("REWARD_INTERSTITIAL", "story")
  );
  check(
    "a leaderboard is accepted in a leaderboard space",
    sizeFitsPlacement("DASHBOARD", "leaderboard")
  );
  check(
    "a skyscraper (160x600) is refused everywhere it would overflow",
    !sizeFitsPlacement("DASHBOARD", "skyscraper") &&
      !sizeFitsPlacement("FEED_POST_BELOW", "skyscraper")
  );
  check(
    "an unknown size string is refused rather than silently unbounded",
    !sizeFitsPlacement("DASHBOARD", "fullpage") &&
      !sizeFitsPlacement("DASHBOARD", "story-xl")
  );
  // Absent/empty means "not specified", which the routes persist as
  // "responsive" — and every space allows responsive, which is exactly why the
  // 43 existing responsive rows still fit and only the render-time ceiling
  // saves them.
  check(
    "an absent size falls back to responsive, which every space allows",
    sizeFitsPlacement("DASHBOARD", "") &&
      sizeFitsPlacement("DASHBOARD", null) &&
      AD_PLACEMENTS.every((p) => placementSpec(p.name).sizes.includes("responsive"))
  );

  const custom = checkAdFitsPlacement({
    placementName: "DASHBOARD",
    size: "custom",
    width: 1,
    height: 100000,
    type: "LOCAL",
  });
  check(
    "custom 1x100000 is refused (the admin route had no upper bound at all)",
    custom.some((p) => p.field === "height"),
    JSON.stringify(custom)
  );
  const customOk = checkAdFitsPlacement({
    placementName: "DASHBOARD",
    size: "custom",
    width: 728,
    height: 90,
    type: "LOCAL",
  });
  check("a sane custom size passes", customOk.length === 0, JSON.stringify(customOk));
  const customNoDims = checkAdFitsPlacement({
    placementName: "DASHBOARD",
    size: "custom",
    width: null,
    height: null,
    type: "LOCAL",
  });
  check("custom without dimensions is refused", customNoDims.length > 0);

  /* 3. Google inventory stays off incentivised surfaces */
  console.log("\n3. Network ads and incentivised spaces");

  const incentivised = [
    "REWARD_INTERSTITIAL",
    "VIDEO_INTERSTITIAL",
    "GAME_INTERSTITIAL",
    "EARN_BROWSE",
  ];
  for (const name of incentivised) {
    check(
      `AdSense is refused in ${name}`,
      !typeFitsPlacement(name, "ADSENSE") && !typeFitsPlacement(name, "GAM")
    );
  }
  check(
    "own and HTML creatives are still allowed there",
    typeFitsPlacement("REWARD_INTERSTITIAL", "LOCAL") &&
      typeFitsPlacement("EARN_BROWSE", "HTML")
  );
  check(
    "AdSense is allowed on ordinary content spaces",
    typeFitsPlacement("DASHBOARD", "ADSENSE") &&
      typeFitsPlacement("IN_FEED", "GAM") &&
      typeFitsPlacement("WALLET_TOP", "ADSENSE")
  );
  const netProblem = checkAdFitsPlacement({
    placementName: "REWARD_INTERSTITIAL",
    size: "story",
    type: "ADSENSE",
  });
  check(
    "the refusal explains WHY (policy), not just that it failed",
    netProblem.some((p) => p.field === "type" && /polic/i.test(p.message)),
    JSON.stringify(netProblem)
  );

  /* 4. The rows already in the database */
  console.log("\n4. Existing inventory");

  const live = await prisma.ad.findMany({
    select: {
      id: true,
      size: true,
      width: true,
      height: true,
      type: true,
      placement: { select: { name: true } },
    },
  });
  console.log(`   ${live.length} ads in the database`);

  const wouldNotPass = live.filter(
    (a) =>
      a.placement &&
      checkAdFitsPlacement({
        placementName: a.placement.name,
        size: a.size,
        width: a.width,
        height: a.height,
        type: a.type,
      }).length > 0
  );
  console.log(
    `   ${wouldNotPass.length} would be refused if re-submitted today (they stay live; the renderer caps them)`
  );

  // The point of the render-time cap: whatever these rows say, they are bounded.
  const uncapped = live.filter((a) => {
    if (!a.placement) return false;
    const cap = placementSpec(a.placement.name).maxHeightPx;
    return !Number.isFinite(cap) || cap <= 0;
  });
  check(
    "every live ad sits in a space with a finite height ceiling",
    uncapped.length === 0,
    `${uncapped.length} uncapped`
  );

  const responsive = live.filter((a) => (a.size ?? "responsive") === "responsive");
  check(
    `the "responsive" rows (${responsive.length}) resolve to no dimensions — which is why the ceiling matters`,
    responsive.every((a) => resolveAdSize(a.size, a.width, a.height) === null)
  );

  // Prove the old behaviour was genuinely unbounded.
  check(
    "a responsive ad really did resolve to null (no maxWidth, no aspect, no cap)",
    resolveAdSize("responsive", null, null) === null &&
      resolveAdSize("nonsense", null, null) === null
  );

  const networkOnIncentivised = live.filter(
    (a) =>
      a.placement &&
      (a.type === "ADSENSE" || a.type === "GAM") &&
      !placementSpec(a.placement.name).networkAllowed
  );
  check(
    "no Google creative is currently sitting on an incentivised space",
    networkOnIncentivised.length === 0,
    networkOnIncentivised.map((a) => `${a.id}@${a.placement?.name}`).join(", ")
  );

  console.log(
    `\n=== ${passed} passed, ${failures.length} failed ===${
      failures.length ? `\n\n${failures.map((f) => ` - ${f}`).join("\n")}\n` : "\n"
    }`
  );
  await prisma.$disconnect();
  if (failures.length) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
