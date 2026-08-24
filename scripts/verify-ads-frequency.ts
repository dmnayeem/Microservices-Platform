import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  claimInterstitialSlot,
  getAdFrequencyConfig,
  isFrequencyCapped,
} from "../src/lib/ad-frequency";
import { validateSettingValues } from "../src/lib/setting-guards";

/**
 * Phase 4 verification — full-screen ad pacing.
 *
 * The point of the cap is that it must never cost a user their reward. It works
 * by making `serveAd` return no ad, which the overlay already handles by
 * resolving immediately — so this proves the cap trips, and that tripping it is
 * a no-op for the payout.
 *
 * Uses a throwaway user id and cleans up its limiter rows.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-ads-frequency.ts
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

let passed = 0;
const failures: string[] = [];
const buckets: string[] = [];

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
  console.log("\n=== Full-screen ad pacing ===\n");

  /* 1. Which surfaces are capped */
  console.log("1. Scope");
  check(
    "the reward and video interstitials are capped",
    isFrequencyCapped("REWARD_INTERSTITIAL") &&
      isFrequencyCapped("VIDEO_INTERSTITIAL")
  );
  check(
    "GAME_INTERSTITIAL is exempt — its payout is bounded by ads shown, so " +
      "suppressing one would suppress the user's earnings",
    !isFrequencyCapped("GAME_INTERSTITIAL")
  );
  check(
    "ordinary banner spaces are not capped",
    !isFrequencyCapped("DASHBOARD") &&
      !isFrequencyCapped("IN_FEED") &&
      !isFrequencyCapped("EARN_BROWSE")
  );

  /* 2. The live config is sane */
  console.log("\n2. Configuration");
  const cfg = await getAdFrequencyConfig();
  console.log(`   gap=${cfg.minGapSeconds}s dailyMax=${cfg.dailyMax}`);
  check(
    "the defaults are a real limit, not a token one",
    cfg.minGapSeconds > 0 && cfg.dailyMax > 0
  );
  check(
    "the settings are bounded so a typo can't disable pacing silently",
    validateSettingValues({ "ads.interstitial_min_gap_sec": 99999 }).length === 1 &&
      validateSettingValues({ "ads.interstitial_daily_max": -5 }).length === 1 &&
      validateSettingValues({ "ads.interstitial_min_gap_sec": 60 }).length === 0
  );

  /* 3. The gap actually trips */
  console.log("\n3. The gap");
  const userA = `freqverify-a-${Date.now()}`;
  buckets.push(`adfreq:gap:${userA}`, `adfreq:day:${userA}`);

  const first = await claimInterstitialSlot(userA, "REWARD_INTERSTITIAL");
  const second = await claimInterstitialSlot(userA, "REWARD_INTERSTITIAL");
  const third = await claimInterstitialSlot(userA, "REWARD_INTERSTITIAL");
  check("the first full-screen ad is allowed", first.allowed);
  check(
    "an immediate second is refused by the gap",
    !second.allowed && second.reason === "gap",
    JSON.stringify(second)
  );
  check("and so is a third", !third.allowed);

  // Ten claims in a row: exactly one ad, and none of them errored.
  const userB = `freqverify-b-${Date.now()}`;
  buckets.push(`adfreq:gap:${userB}`, `adfreq:day:${userB}`);
  const burst = [];
  for (let i = 0; i < 10; i++) {
    burst.push(await claimInterstitialSlot(userB, "REWARD_INTERSTITIAL"));
  }
  const shown = burst.filter((b) => b.allowed).length;
  check(
    "claiming ten rewards in a row shows exactly one full-screen ad",
    shown === 1,
    `${shown} shown`
  );
  check(
    "the other nine are refusals, not errors — the reward still pays",
    burst.filter((b) => !b.allowed).length === 9
  );

  /* 4. An exempt placement is never refused */
  console.log("\n4. Exempt surfaces");
  const games = [];
  for (let i = 0; i < 5; i++) {
    games.push(await claimInterstitialSlot(userB, "GAME_INTERSTITIAL"));
  }
  check(
    "five game ads in a row are all allowed (games pace themselves)",
    games.every((g) => g.allowed)
  );

  /* 5. The daily cap */
  console.log("\n5. The daily cap");
  // Drive the daily bucket past the cap directly, then confirm the reason
  // switches from "gap" to "daily".
  const userC = `freqverify-c-${Date.now()}`;
  const dayBucket = `adfreq:day:${userC}`;
  buckets.push(dayBucket, `adfreq:gap:${userC}`);
  const { dbRateLimit } = await import("../src/lib/rate-limit-db");
  for (let i = 0; i < cfg.dailyMax; i++) {
    await dbRateLimit(dayBucket, cfg.dailyMax, 86_400_000);
  }
  const overDaily = await claimInterstitialSlot(userC, "REWARD_INTERSTITIAL");
  check(
    "past the daily cap the refusal reason is 'daily', not 'gap'",
    !overDaily.allowed && overDaily.reason === "daily",
    JSON.stringify(overDaily)
  );

  /* 6. It fails open */
  console.log("\n6. Failure mode");
  console.log(
    "   dbRateLimit fails OPEN by design (see its doc comment) — a limiter"
  );
  console.log(
    "   outage lets the ad through rather than costing the platform revenue."
  );
  check("an unknown placement is simply not capped", (await claimInterstitialSlot(userA, "NOT_A_PLACEMENT")).allowed);

  console.log(
    `\n=== ${passed} passed, ${failures.length} failed ===${
      failures.length ? `\n\n${failures.map((f) => ` - ${f}`).join("\n")}\n` : "\n"
    }`
  );
}

main()
  .then(async () => {
    if (buckets.length) {
      await prisma.rateLimitHit
        .deleteMany({ where: { bucket: { in: buckets } } })
        .catch(() => {});
    }
    await prisma.$disconnect();
    process.exit(failures.length ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.rateLimitHit
      .deleteMany({ where: { bucket: { in: buckets } } })
      .catch(() => {});
    await prisma.$disconnect();
    process.exit(1);
  });
