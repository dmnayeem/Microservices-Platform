import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  AD_PLACEMENTS,
  PLACEMENT_SPEC,
  anchorAllowedOnPath,
  placementSpec,
  checkAdFitsPlacement,
} from "../src/lib/ad-placements";

/**
 * Phase 3 verification — ad coverage and density.
 *
 * Two properties matter more than the rest. **No space may ship empty** — Phase 2
 * established that an empty placement is worse than no placement, because the
 * slot silently resolves to nothing and the surface just looks broken. And the
 * **anchor bar must never appear on an incentivised page**, because it is the
 * one mount in the codebase that could put a Google ad on a screen where the
 * user is being paid to be.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-ads-coverage.ts
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

const src = (p: string) =>
  fs.readFileSync(path.join(process.cwd(), "src", p), "utf8");

/**
 * The same file with comments and JSX comments removed.
 *
 * Checks that assert an ABSENCE have to read the code, not the prose: a comment
 * explaining "the nav is z-40" or "the old [&_*]:max-h-16 clamp is gone" would
 * otherwise fail the very check it documents.
 */
const code = (p: string) =>
  src(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** The nine spaces this phase added. */
const NEW_PLACEMENTS = [
  "ANCHOR_BOTTOM",
  "WITHDRAW_TOP",
  "LEADERBOARD_TOP",
  "QUIZZES_TOP",
  "DEPOSIT_TOP",
  "PACKAGES_TOP",
  "NOTIFICATIONS_TOP",
  "REFERRALS_TOP",
  "DAILY_MISSION_TOP",
];

async function main() {
  console.log("\n=== Ad coverage & density ===\n");

  /* 1. The catalog. */
  console.log("1. Catalog");
  for (const name of NEW_PLACEMENTS) {
    check(
      `${name} is in the catalog`,
      AD_PLACEMENTS.some((p) => p.name === name)
    );
  }
  // A missing spec entry does not throw — `placementSpec` falls back to the
  // 120px leaderboard, which would silently let a 120px creative into the 64px
  // anchor. So the entry has to be asserted, not assumed.
  for (const name of NEW_PLACEMENTS) {
    check(
      `${name} declares its own spec (no silent LEADERBOARD fallback)`,
      Object.prototype.hasOwnProperty.call(PLACEMENT_SPEC, name)
    );
  }
  check(
    "the anchor is the shortest space on the platform",
    placementSpec("ANCHOR_BOTTOM").maxHeightPx === 64,
    String(placementSpec("ANCHOR_BOTTOM").maxHeightPx)
  );
  check(
    "a leaderboard creative does not fit the anchor",
    checkAdFitsPlacement({
      placementName: "ANCHOR_BOTTOM",
      size: "custom",
      width: 728,
      height: 120,
    }).some((p) => p.field === "height")
  );

  /* 2. Nothing ships empty. */
  console.log("\n2. No space is empty");
  const placements = await prisma.adPlacement.findMany({
    select: { id: true, name: true, isActive: true },
  });
  const byName = new Map(placements.map((p) => [p.name, p]));
  // Prisma's groupBy generic degrades to `{}` here (same gotcha as
  // admin/analytics/page.tsx), so the row shape is stated explicitly.
  const counts = (await prisma.ad.groupBy({
    by: ["placementId"],
    where: { status: "ACTIVE" },
    _count: { _all: true },
  })) as unknown as Array<{ placementId: string; _count: { _all: number } }>;
  const activeBy = new Map(counts.map((c) => [c.placementId, c._count._all]));

  for (const name of NEW_PLACEMENTS) {
    const row = byName.get(name);
    check(`${name} has a placement row`, !!row);
    if (row) {
      check(
        `${name} has at least one ACTIVE ad`,
        (activeBy.get(row.id) ?? 0) > 0,
        `${activeBy.get(row.id) ?? 0} ads`
      );
    }
  }
  // And the catalog as a whole, since this is the failure mode the phase most
  // easily reintroduces.
  //
  // REWARDED_VIDEO is exempt, and only it: nothing mounts an `<AdRenderer>` on
  // it. It exists so the policy gate has something to refuse Google inventory
  // on (`networkAllowed: false`, house-only) — the watch-to-earn list is served
  // by /api/ads/rewarded, which selects on `rewardPoints > 0` across all ads
  // rather than by placement. An "empty" entry there renders nothing anywhere,
  // so it cannot leave a hole on a page.
  const NOT_A_RENDERED_SLOT = new Set(["REWARDED_VIDEO"]);
  const empty = AD_PLACEMENTS.filter((p) => {
    if (NOT_A_RENDERED_SLOT.has(p.name)) return false;
    const row = byName.get(p.name);
    return !row || (activeBy.get(row.id) ?? 0) === 0;
  }).map((p) => p.name);
  check(
    "no placement in the whole catalog is empty",
    empty.length === 0,
    empty.join(", ")
  );

  /* 3. The anchor bar. */
  console.log("\n3. Anchor bar");
  check(
    "it is suppressed on Browse & Earn, where the user is paid for dwell time",
    !anchorAllowedOnPath("/watch-ads") && !anchorAllowedOnPath("/watch-ads/x")
  );
  // `/tasks` used to be asserted here as an "ordinary page". It is not — the
  // user is paid to complete what is on it, and the anchor bar carries Google
  // inventory (`networkAllowed: true`). The deny list has been widened from
  // `["/watch-ads"]` to the full set of paid surfaces (`INCENTIVISED_PREFIXES`),
  // so every task route is suppressed now. See docs/GOOGLE-ADS-SETUP.md.
  check(
    "it renders on ordinary pages",
    anchorAllowedOnPath("/dashboard") &&
      anchorAllowedOnPath("/withdrawal") &&
      anchorAllowedOnPath("/social") &&
      anchorAllowedOnPath("/wallet")
  );
  check(
    "it is suppressed on every paid surface, not just Browse & Earn",
    !anchorAllowedOnPath("/tasks") &&
      !anchorAllowedOnPath("/video-tasks/1") &&
      !anchorAllowedOnPath("/games") &&
      !anchorAllowedOnPath("/offerwalls")
  );
  check(
    "a path that merely starts with the same letters is not suppressed",
    anchorAllowedOnPath("/watch-ads-something-else")
  );
  {
    const s = src("components/user/primitives/anchor-ad-bar.tsx");
    check(
      "it sits UNDER the bottom nav (z-30 vs the nav's z-40)",
      /z-30/.test(code("components/user/primitives/anchor-ad-bar.tsx")) &&
        !/z-4\d/.test(code("components/user/primitives/anchor-ad-bar.tsx"))
    );
    check(
      "it clears the nav height plus the notch inset on mobile",
      /bottom-\[calc\(3\.5rem\+env\(safe-area-inset-bottom\)\)\]/.test(s)
    );
    check(
      "it can be dismissed, and the dismissal lasts the session",
      /sessionStorage\.setItem\(DISMISS_KEY/.test(s)
    );
    check(
      "it publishes its real height so <main> can reserve exactly that much",
      /ResizeObserver/.test(s) && /setProperty\(CSS_VAR/.test(s)
    );
    check(
      "it gives the padding back when it has no ad or is dismissed",
      /root\.style\.setProperty\(CSS_VAR, "0px"\)/.test(s)
    );
  }
  {
    const s = src("app/(main)/layout.tsx");
    check("it is mounted once in the app shell", /<AnchorAdBar \/>/.test(s));
    check(
      "<main> reserves room for it on top of the nav's own space",
      /pb-\[calc\(6rem\+var\(--anchor-ad-h,0px\)\)\]/.test(s)
    );
  }

  /* 4. Page coverage. */
  console.log("\n4. Page coverage");
  const MOUNTS: Array<[string, string]> = [
    ["components/user/tasks/tasks-hub-view.tsx", "TASK_LIST"],
    ["app/(main)/withdrawal/page.tsx", "WITHDRAW_TOP"],
    ["app/(main)/leaderboard/page.tsx", "LEADERBOARD_TOP"],
    ["app/(main)/quizzes/page.tsx", "QUIZZES_TOP"],
    ["app/(main)/deposit/page.tsx", "DEPOSIT_TOP"],
    ["app/(main)/packages/page.tsx", "PACKAGES_TOP"],
    ["app/(main)/notifications/page.tsx", "NOTIFICATIONS_TOP"],
    ["app/(main)/referrals/page.tsx", "REFERRALS_TOP"],
    ["app/(main)/daily-mission/page.tsx", "DAILY_MISSION_TOP"],
    ["components/user/feed/hashtag-feed-client.tsx", "IN_FEED"],
    ["components/user/profile/public-profile-view.tsx", "PROFILE_BOTTOM"],
  ];
  for (const [file, placement] of MOUNTS) {
    check(
      `${placement} is mounted in ${file.split("/").pop()}`,
      new RegExp(`placement="${placement}"`).test(src(file))
    );
  }
  {
    // The gate runs first on /daily-mission, so a gated user must not be shown
    // an ad instead of the gate.
    const s = src("app/(main)/daily-mission/page.tsx");
    check(
      "the daily-mission slot sits after the profile gate, not before it",
      s.indexOf("<ProfileGate") < s.indexOf('placement="DAILY_MISSION_TOP"')
    );
  }

  /* 5. Density. */
  console.log("\n5. Density");
  {
    const s = src("components/user/feed/social-feed-view.tsx");
    check(
      "the under-post interval is no longer discarded",
      !/underPostInterval: _underPostInterval/.test(s)
    );
    check(
      "it actually gates which posts get a banner",
      /const showUnderPost = underPostBanner && \(i \+ 1\) % un === 0;/.test(s)
    );
    check(
      "the card is told per-post, not globally",
      /underPostBanner=\{showUnderPost\}/.test(s)
    );
  }
  {
    check(
      "the pre-Phase-1 hand clamp is gone (the space's own 72px cap governs)",
      !/\[&_\*\]:max-h-16/.test(code("components/user/feed/feed-post-card.tsx"))
    );
  }
  {
    const s = src("components/admin/ads/ad-manager-view.tsx");
    check(
      "the admin can finally set the interval",
      /setUnderPostInterval\(Math\.max\(1,/.test(s)
    );
    check(
      'the label no longer documents the bug ("under every post")',
      !/under <b className="mx-1">every<\/b> post/.test(s)
    );
  }
  // Arithmetic, against the exact loop the feed runs.
  {
    const gate = (i: number, interval: number) =>
      (i + 1) % Math.max(1, interval) === 0;
    const at = (interval: number) =>
      Array.from({ length: 9 }, (_, i) => i).filter((i) => gate(i, interval))
        .length;
    check("9 posts at interval 3 → 3 banners, not 9", at(3) === 3, String(at(3)));
    check("interval 1 still means every post", at(1) === 9, String(at(1)));
    check("a zero interval cannot divide by zero", at(0) === 9, String(at(0)));
  }

  /* 6. Reward gates. */
  console.log("\n6. Reward gates");
  const GATED = [
    "components/user/gamification/milestones-view.tsx",
    "components/user/quizzes/quiz-runner.tsx",
    "components/user/wallet/wallet-view.tsx",
    "components/user/wallet/withdrawal-view.tsx",
    "components/user/wallet/deposit-view.tsx",
    "components/user/lottery/lottery-view.tsx",
    "components/user/marketplace/cart-view.tsx",
  ];
  for (const f of GATED) {
    check(
      `${f.split("/").pop()} runs the reward gate`,
      /await runInterstitial\(\)/.test(src(f))
    );
  }
  {
    // The gate must never sit between the user and their money.
    const s = src("components/user/gamification/milestones-view.tsx");
    check(
      "the milestone gate runs AFTER the credit request, never before it",
      s.indexOf("/claim`") < s.indexOf("await runInterstitial()")
    );
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
