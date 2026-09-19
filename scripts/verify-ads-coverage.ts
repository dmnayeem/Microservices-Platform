import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { CATEGORY_FOR_KEY } from "../src/lib/admin-settings-catalog";
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

  /* -- Junk placements and stranded ads ----------------------------------- */
  //
  // A placement name is the key `<AdRenderer placement="...">` mounts with, so a
  // name outside the canonical list renders on no page at all. The DB carried
  // one (`QW`) holding two ads that were ACTIVE, approved and funded and could
  // never serve once, with nothing on any screen saying so.
  {
    check(
      "an unknown placement name cannot be created",
      /isCanonicalPlacement\(name\)/.test(
        code("app/api/admin/ads/placements/route.ts")
      )
    );
    check(
      "stranded ads can be reassigned to a real space",
      /isCanonicalPlacement\(to\.name\)/.test(
        code("app/api/admin/ads/placements/[id]/route.ts")
      )
    );
    check(
      "the ad manager surfaces stranded ads",
      /stranded here/.test(code("components/admin/ads/ad-manager-view.tsx"))
    );
    // Reassignment has to actually land the ads somewhere they can render.
    // Every other write path refuses an ad whose size or type the space cannot
    // show; this one moved them blind, which "unstrands" an ad into a space
    // where it is just as unserveable.
    const reassign = code("app/api/admin/ads/placements/[id]/route.ts");
    check(
      "a reassignment checks the ad actually fits the target space",
      /checkAdFitsPlacement\(/.test(reassign),
      "moving a 728x90 into a 300x250 slot is not a fix"
    );
    check(
      "…and an ad that does not fit is LEFT, named, never mangled",
      /skipped/.test(reassign) && /problems/.test(reassign)
    );
    check(
      "a dead space can be retired once it is empty",
      /adPlacement\.delete/.test(reassign) &&
        /ads\.placement\.delete/.test(reassign),
      "the deletion is audited, because bookings and serve stats go with it"
    );
    check(
      "…but a REAL mounted space can never be deleted",
      /isCanonicalPlacement\(row\.name\)/.test(reassign),
      "deleting the row does not unmount the <AdRenderer>"
    );
    check(
      "nothing is deleted without the admin asking",
      /confirmDialog\(/.test(code("components/admin/ads/ad-manager-view.tsx"))
    );
    check(
      "the box that created junk spaces by hand is gone",
      !/ADD CUSTOM SPACE/.test(code("components/admin/ads/ad-manager-view.tsx")),
      "typing a name into a box is how QW came to exist"
    );
    // The stranded rows themselves are REPORTED, never deleted: they are an
    // admin's ads and the fix is a reassignment someone has to choose.
    const canonicalNames = new Set<string>(AD_PLACEMENTS.map((x) => x.name));
    const placementRows = (await prisma.adPlacement.findMany({
      select: { name: true, _count: { select: { ads: true } } },
    })) as unknown as { name: string; _count: { ads: number } }[];
    const junk = placementRows.filter((r) => !canonicalNames.has(r.name));
    if (junk.length === 0) {
      console.log("   no non-canonical placements in the database");
    } else {
      for (const j of junk) {
        console.log(
          `   non-canonical placement "${j.name}" holds ${j._count.ads} ad(s)` +
            (j._count.ads > 0
              ? " - STRANDED, reassign them in Ad Manager -> Spaces"
              : " - empty, safe to delete")
        );
      }
    }
  }

  /* -- The rate card is priced by hand, but it must be reachable ---------- */
  {
    const settingsSrc = code("components/admin/settings/system-settings-form.tsx");
    check(
      "the global CPC default is editable in system settings",
      /"ads\.cpcUsd"/.test(settingsSrc)
    );
    // Both ends. A settings control whose key is missing from CATEGORY_FOR_KEY
    // renders, accepts input, says "saved" and writes nothing -- which is how 44
    // of 104 controls were once dead.
    // Read from the catalog, which is now where the map is built from, instead
    // of the literal the form used to carry. Same guarantee: a key missing here
    // is a control that renders, says "saved" and writes nothing.
    check(
      "the global CPC key is actually saved (present in CATEGORY_FOR_KEY)",
      CATEGORY_FOR_KEY["ads.cpcUsd"] === "financial"
    );
    const priced = await prisma.adPlacement.count({
      where: { cpcUsd: { not: null } },
    });
    const totalSpaces = await prisma.adPlacement.count();
    console.log(
      `   ${priced}/${totalSpaces} spaces have their own click price; the rest use the global default`
    );
    // Pricing a space was a guess: a blank box, lifetime impressions, and
    // nothing saying what the space had ever earned. The card now carries a
    // real 30-day figure and the rate a click there bills today. It still
    // suggests no price -- what a space is worth is the owner's call.
    const placementsApi = code("app/api/admin/ads/placements/route.ts");
    check(
      "each space reports what it actually earned, through the house/network gate",
      /adRevenueLastDays\(/.test(placementsApi) &&
        /byPlacementId/.test(placementsApi)
    );
    check(
      "…and what a click there bills today",
      /effectiveCpcUsd/.test(placementsApi) &&
        /effectiveCpcUsd/.test(code("components/admin/ads/ad-manager-view.tsx"))
    );
    check(
      "no price is ever suggested or defaulted per space",
      !/suggestedCpc/.test(placementsApi)
    );
  }

  /* -- Country handling is international, not three rows ------------------ */
  {
    const countryCount = await prisma.country.count({ where: { isActive: true } });
    check(
      "the canonical country list is the whole world, not a shortlist",
      countryCount >= 190,
      `${countryCount} active countries`
    );
    const withCountry = (await prisma.user.findMany({
      where: { country: { not: null } },
      select: { country: true },
    })) as unknown as { country: string | null }[];
    const bad = withCountry.filter(
      (u) => !/^[A-Z]{2}$/.test((u.country ?? "").trim())
    );
    // Reported, not failed: rewriting live rows is the owner's call, and
    // `scripts/normalize-user-country.ts` is the dry-run-by-default tool for it.
    console.log(
      bad.length === 0
        ? `   all ${withCountry.length} stored countries are ISO2`
        : `   ${bad.length}/${withCountry.length} stored countries are NOT ISO2 ` +
            `(${[...new Set(bad.map((b) => b.country))].join(", ")}) - run ` +
            `scripts/normalize-user-country.ts`
    );
    check(
      "ad targeting resolves a non-ISO2 profile country instead of dropping the user",
      /normalizeViewerCountry\(/.test(code("lib/ad-serve.ts"))
    );
    check(
      "the admin country breakdown labels codes from the Country table",
      /countryDetailMap\(/.test(code("app/api/admin/ads/report/route.ts"))
    );
  }

  /* ── The card design ────────────────────────────────────────────────────
     The presentation layer got the owner's reference shape: creative, brand
     chip, accented headline over a measured band, outbound arrow, then the
     brand row, the Sponsored line and two full-width buttons.

     Everything below guards the properties that make that shape SAFE on ad
     code rather than the properties that make it pretty. Four things can each
     cost real money on their own: a region that looks clickable and does not
     bill, a class name an ad-blocker recognises, a slot that ignores its
     space's ceiling, and a creative with no dimensions that reflows the page
     underneath it. */
  console.log("\nThe ad card — click path, naming, geometry, contrast");
  {
    const REND = "components/user/primitives/ad-renderer.tsx";
    const FEED = "components/user/feed/feed-ad-card.tsx";
    const rend = code(REND);
    const feed = code(FEED);

    /* -- 1. Every clickable region is a real, billed click ---------------- */
    // The whole point of routing every navigating element through ONE spread
    // object: a control cannot be added that looks like a CTA and forgets the
    // handler, because there is no second anchor shape to forget it in.
    for (const [label, s, expect] of [
      ["the shared renderer", rend, 5],
      ["the in-feed card", feed, 3],
    ] as const) {
      const anchors = (s.match(/<a\s/g) ?? []).length;
      const spread = (s.match(/\{\.\.\.linkProps\}/g) ?? []).length;
      check(
        `${label}: every <a> is the one billed anchor shape`,
        anchors > 0 && anchors === spread && anchors === expect,
        `${anchors} anchors, ${spread} use linkProps (expected ${expect})`
      );
      check(
        `${label}: that shape carries the click handler`,
        /const linkProps = \{[\s\S]{0,200}?onClick: trackClick/.test(s)
      );
      check(
        `${label}: the handler posts the "open" event it always did`,
        /\/api\/spaces\/\$\{ad\.(id|adId)\}\/event/.test(s) &&
          /kind: "open"/.test(s)
      );
      // Nothing may navigate around the anchor — that is how a click stops
      // being recorded while still looking like one.
      check(
        `${label}: nothing navigates outside that anchor`,
        !/window\.open\(|location\.href\s*=|router\.push\(/.test(s)
      );
    }
    // The two buttons are only drawn when there is a destination, so a campaign
    // with no target URL cannot present two primary-looking controls that go
    // nowhere.
    check(
      "both full-width buttons are gated on there being a destination",
      /\{hasUrl &&[\s\S]{0,400}?grid-cols-2/.test(rend) &&
        /\{url &&[\s\S]{0,400}?grid-cols-2/.test(feed)
    );
    // Rewarded video ships off; the reference's "Watch" button must not have
    // been reproduced literally.
    check(
      "no rewarded-video control was surfaced by the redesign",
      !/REWARDED_VIDEO/.test(rend) &&
        !/REWARDED_VIDEO/.test(feed) &&
        !/>\s*Watch\s*</.test(rend) &&
        !/>\s*Watch\s*</.test(feed)
    );
    // The third-party impression pixel and its click tracker are untouched.
    check(
      "the impression pixel and the third-party click tracker still fire",
      /ad\.impressionPixel/.test(rend) && /ad\.clickTracker/.test(rend)
    );

    /* -- 2. No second request per render ---------------------------------- */
    // The renderer is mounted on 27 spaces. One extra fetch here is 27 extra
    // fetches a page view, and the brand mark is the obvious way to add one —
    // which is why the avatar is a CSS monogram until the payload carries a
    // proxied logo.
    check(
      "the shared renderer still makes exactly three requests (panel, event, tracker)",
      (rend.match(/fetch\(/g) ?? []).length === 3,
      `${(rend.match(/fetch\(/g) ?? []).length} fetch() calls`
    );
    check(
      "the in-feed card still makes exactly two (view, open)",
      (feed.match(/fetch\(/g) ?? []).length === 2,
      `${(feed.match(/fetch\(/g) ?? []).length} fetch() calls`
    );

    /* -- 3. First-party naming is intact ---------------------------------- */
    // A filter list matches on what ships to the browser. A class token or an
    // asset path with `ad`, `sponsor`, `banner` or `promo` in it is hidden
    // before it paints, and the impression is simply lost.
    const BLOCKED =
      /^(?:.*[-_])?(ads?|advert|advertisement|sponsor|sponsored|banner|promo|popup|doubleclick)(?:[-_].*)?$/i;
    for (const [label, s] of [
      ["the shared renderer", rend],
      ["the in-feed card", feed],
    ] as const) {
      const tokens = [...s.matchAll(/className=(?:"([^"]*)"|\{cn\(([\s\S]*?)\)\})/g)]
        .flatMap((m) => (m[1] ?? m[2] ?? "").match(/"[^"]*"/g) ?? [m[1] ?? ""])
        .flatMap((chunk) => chunk.replace(/"/g, "").split(/\s+/))
        .filter(Boolean);
      const bad = tokens.filter((t) => BLOCKED.test(t));
      check(
        `${label}: no class token an ad filter recognises`,
        bad.length === 0,
        bad.join(", ")
      );
    }
    // Creatives come from the payload, which the server already rewrote to the
    // same-origin proxy. A literal third-party URL in the component would walk
    // straight past that.
    check(
      "no creative URL is constructed in the component",
      !/["'`]https?:\/\//.test(rend) && !/["'`]https?:\/\//.test(feed)
    );
    check(
      "the viewer-facing endpoints are still the neutral ones",
      /\/api\/spaces\/panel/.test(rend) &&
        !/\/api\/ads\//.test(rend) &&
        !/\/api\/ads\//.test(feed)
    );

    /* -- 4. Geometry: the ceiling, and a box before the bytes ------------- */
    check(
      "the card and banner layouts cap the media at the space's ceiling",
      /maxHeight: spec\.maxHeightPx/.test(rend)
    );
    check(
      "the strip layout still caps the whole bar, not just its media",
      /maxHeight: spec\.maxHeightPx \}\}/.test(rend)
    );
    check(
      "the in-feed card reads its ceiling from the catalog, not a literal",
      /placementSpec\("IN_FEED"\)\.maxHeightPx/.test(feed)
    );
    // 43 rows resolve to no dimensions at all. Before this they rendered
    // `h-auto` and the page moved when the image landed.
    // Reserve the ROW, never the SHAPE.
    //
    // These used to require an `aspectRatio`, and that is what produced the
    // black bars the owner reported: a creative dropped into a box it does not
    // match gets `object-contain`-ed into the middle with a dark slab above and
    // below. Almost no creative matches the box we would pick for it.
    // A `minHeight` stops the page jumping just as well and decides nothing
    // about the picture, so that is the rule now — in both files.
    check(
      "an ad with no dimensions still reserves a box",
      /minHeight: Math\.min\(/.test(rend) && /maxHeight: spec\.maxHeightPx/.test(rend)
    );
    check(
      "…and no loaded creative is forced into an aspect ratio",
      !/aspectRatio:\s*`\$\{(dim|slotDim|reserve)/.test(rend) &&
        /block h-auto w-full/.test(rend),
      "a forced box plus object-contain is what letterboxed every ad"
    );
    check(
      "the in-feed creative reserves one too",
      /minHeight: Math\.round\(mediaMax \* 0\.5\)/.test(feed) &&
        !/aspectRatio: "16 \/ 9"/.test(feed)
    );
    // No fixed pixel width anywhere in the two files — the width cap is the
    // space's job (`outerStyle`), not the card's.
    check(
      "no fixed pixel width in either card",
      // `-` before `width` is a word boundary, so an unanchored \b also matched
      // the `max-width:` inside a responsive `sizes` attribute, which is the
      // opposite of a fixed width.
      !/(?<![-\w])width:\s*\d+px/.test(rend) &&
        !/(?<![-\w])width:\s*\d+px/.test(feed)
    );
    // Which spaces get which layout, reported so the split is visible rather
    // than asserted from memory.
    const byLayout = { strip: [] as string[], banner: [] as string[], card: [] as string[] };
    for (const p of AD_PLACEMENTS) {
      const cap = placementSpec(p.name).maxHeightPx;
      byLayout[cap <= 96 ? "strip" : cap <= 160 ? "banner" : "card"].push(p.name);
    }
    console.log(
      `   layouts — card ${byLayout.card.length}, banner ${byLayout.banner.length}, strip ${byLayout.strip.length}`
    );
    check(
      "every one of the 28 spaces resolves to exactly one layout",
      byLayout.strip.length + byLayout.banner.length + byLayout.card.length ===
        AD_PLACEMENTS.length
    );

    /* -- 5. Tap targets ---------------------------------------------------- */
    // Counted rather than eyeballed, because the last time this was eyeballed a
    // like button shipped as a 20px target behind a `[&>button]` rule that
    // styles direct children only.
    for (const [label, s] of [
      ["the shared renderer", rend],
      ["the in-feed card", feed],
    ] as const) {
      const buttons = (s.match(/<button\s/g) ?? []).length;
      const sized = (s.match(/\bapp-tap(?:-row)?\b/g) ?? []).length;
      check(
        `${label}: every button carries the 44px floor`,
        buttons > 0 && sized >= buttons,
        `${buttons} buttons, ${sized} app-tap* classes`
      );
      check(
        `${label}: the floor is on the element, never a child selector`,
        !/\[&>button\]/.test(s)
      );
    }

    /* -- 6. Rotation cadence and the two visibility gates ----------------- */
    // `/api/spaces/panel` was 398 of 973 captured requests — 41% of everything
    // the app asks for — from ~7 slots rotating every ~12s, one `RateLimitHit`
    // upsert each. These four checks exist so that cannot come back quietly.
    const floorMs = Number(
      src(REND).match(/const MIN_ROTATE_MS = ([\d_]+)/)?.[1].replace(/_/g, "") ?? 0
    );
    check(
      `rotation is floored at ${(floorMs / 1000).toFixed(0)}s, not 12s`,
      floorMs >= 25_000,
      `MIN_ROTATE_MS = ${floorMs}`
    );
    check(
      "the floor is applied to the server's interval",
      /Math\.max\(data\.rotateMs, MIN_ROTATE_MS\)/.test(rend)
    );
    check(
      "…and to the SSR-seeded one, which would otherwise keep the old cadence",
      /Math\.max\(initialRotateMs, MIN_ROTATE_MS\)/.test(rend)
    );
    check(
      "a hidden tab and an off-screen slot both stop rotating",
      /if \(document\.hidden \|\| !onScreenRef\.current\) return;/.test(rend)
    );
    check(
      "returning to the tab only refetches a slot that is actually in view",
      /\} else if \(onScreenRef\.current\) \{/.test(rend)
    );
    check(
      "visibility comes from a real IntersectionObserver on the slot's own root",
      /new IntersectionObserver\(/.test(rend) &&
        (rend.match(/ref=\{attachRoot\}/g) ?? []).length === 5,
      `${(rend.match(/ref=\{attachRoot\}/g) ?? []).length} of 5 roots observed`
    );
    // The gates must sit on ROTATION only. The first load still fetches and
    // still counts one impression per mounted slot, exactly as before — that is
    // the number advertisers are billed on and it is not being changed here.
    check(
      "the first load is not gated — impression accounting is unchanged",
      /void loadAd\(\{ initial: true \}\)/.test(rend) &&
        !/onScreenRef\.current[\s\S]{0,80}initial: true/.test(rend)
    );

    /* -- 7. Contrast, computed -------------------------------------------- */
    // Same method as scripts/verify-app-shell.ts: WCAG 2.1 relative luminance,
    // recomputed from the values actually in the files. The interesting row is
    // white text over an UNKNOWN photo — measured against the band the text
    // sits on, flattened over a pure white creative, which is the worst
    // creative anyone can upload.
    const srgb = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const lum = (hex: string) => {
      const h = hex.replace("#", "");
      const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
      return (
        0.2126 * srgb(parseInt(n.slice(0, 2), 16)) +
        0.7152 * srgb(parseInt(n.slice(2, 4), 16)) +
        0.0722 * srgb(parseInt(n.slice(4, 6), 16))
      );
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const hex = (r: number, g: number, b: number) =>
      "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    /** Flatten `rgba(r,g,b,a)` over an opaque backdrop. */
    const flatten = (fg: [number, number, number], a: number, bg: string) => {
      const px = (i: number) =>
        parseInt(bg.replace("#", "").slice(i * 2, i * 2 + 2), 16);
      return hex(...([0, 1, 2].map((i) => fg[i] * a + px(i) * (1 - a)) as [number, number, number]));
    };
    /** 35% of an accent mixed into white, in sRGB — what ACCENT_ON_MEDIA does. */
    const mixWhite = (accent: string, part: number) => {
      const px = (i: number) =>
        parseInt(accent.replace("#", "").slice(i * 2, i * 2 + 2), 16);
      return hex(...([0, 1, 2].map((i) => px(i) * part + 255 * (1 - part)) as [number, number, number]));
    };

    /** Declarations of one custom property, per selector, read from globals.css. */
    const cssText = src("app/globals.css");
    const tokens = { dark: new Map<string, string>(), light: new Map<string, string>() };
    {
      let depth = 0;
      let selector = "";
      for (const line of cssText.split("\n")) {
        if (depth === 0 && line.includes("{")) selector = line.slice(0, line.indexOf("{")).trim();
        const decl = line.match(/^\s*(--[\w-]+)\s*:\s*([^;]+);/);
        if (depth === 1 && decl) {
          // The neutral ramp lives in Tailwind v4's `@theme`, the app tokens in
          // `:root`; the dark theme is the default in both, and the light theme
          // overrides only what it changes.
          if (selector === ":root" || /^@theme\b/.test(selector))
            tokens.dark.set(decl[1], decl[2].trim());
          else if (selector === 'html[data-theme="light"]')
            tokens.light.set(decl[1], decl[2].trim());
        }
        depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      }
    }
    /** Resolve a token to a hex, following one level of var(). */
    const token = (name: string, theme: "dark" | "light"): string => {
      const raw = tokens[theme].get(name) ?? tokens.dark.get(name) ?? "";
      const v = raw.match(/var\((--[\w-]+)\)/);
      return v ? token(v[1], theme) : raw;
    };

    // Contrast is measured on the CARD, in both themes, rather than against a
    // creative we do not control. That stays true for the shared renderer,
    // whose headline sits below the picture; the in-feed card puts its
    // headline back on the image to match the reference layout, and the rules
    // that keep that readable are asserted separately below.
    const chipAlpha = Number(
      src(REND).match(/const CHIP_BG = "rgba\(8,9,14,(0\.\d+)\)"/)?.[1] ?? 0
    );
    // Worst case for the chip, which IS still on the creative: a pure white photo.
    const chip = flatten([8, 9, 14], chipAlpha, "#ffffff");

    check(
      "no flat dark scrim is painted over a creative",
      !/rgba\(8,9,14,0\.(8|9)/.test(src(REND)) &&
        !/rgba\(8,9,14,0\.(8|9)/.test(src(FEED)),
      "the band under the headline is what read as a black shadow on every ad"
    );

    /* The headline is back ON the creative in the in-feed card, because the
       owner asked for the reference card's layout and pointed at it twice.
       Its own row — two lines of heading plus a 44px circle, above a
       description that is usually the same sentence again — was most of why
       this card stood so much taller than the reference.
       What must NOT come back with it is the full-height band that was
       reported as a black shadow, so the darkening is pinned to the bottom of
       the image and has to fade out. */
    check(
      "the headline's darkening is anchored to the bottom, not the whole image",
      /absolute inset-x-0 bottom-0[^"]*h-2\/5 bg-linear-to-t/.test(src(FEED)),
      "a full-cover overlay is the black shadow, whatever its opacity"
    );
    check(
      "…and fades to nothing rather than ending in a hard edge",
      /from-black\/70 via-black\/25 to-transparent/.test(src(FEED))
    );
    check(
      "…and is not drawn at all when the ad has no headline",
      /\{\(lead \|\| accent\) && \(\s*<span className="pointer-events-none absolute inset-x-0 bottom-0/.test(
        src(FEED)
      ),
      "an ad with no text would otherwise get a dark bottom for nothing"
    );

    const rows: [string, string, string, number][] = [
      ["headline — ink on the card (dark)", token("--app-ink", "dark"), token("--app-surface", "dark"), 4.5],
      ["headline — ink on the card (light)", token("--app-ink", "light"), token("--app-surface", "light"), 4.5],
      ["brand chip — white on the pill, over a WHITE photo", "#ffffff", chip, 4.5],
      ["description — gray-300 on the card (dark)", token("--color-gray-300", "dark"), token("--app-surface", "dark"), 4.5],
      ["description — gray-300 on the card (light)", token("--color-gray-300", "light"), token("--app-surface", "light"), 4.5],
      ["Sponsored line — gray-400 on the card (dark)", token("--color-gray-400", "dark"), token("--app-surface", "dark"), 4.5],
      ["Sponsored line — gray-400 on the card (light)", token("--color-gray-400", "light"), token("--app-surface", "light"), 4.5],
      ["secondary button — gray-100 on surface-2 (dark)", token("--color-gray-100", "dark"), token("--app-surface-2", "dark"), 4.5],
      ["secondary button — gray-100 on surface-2 (light)", token("--color-gray-100", "light"), token("--app-surface-2", "light"), 4.5],
      ["primary button — gray-900 on gray-50 (dark)", token("--color-gray-900", "dark"), token("--color-gray-50", "dark"), 4.5],
      ["primary button — gray-900 on gray-50 (light)", token("--color-gray-900", "light"), token("--color-gray-50", "light"), 4.5],
    ];
    for (const [label, fg, bg, floor] of rows) {
      const r = fg && bg ? ratio(fg, bg) : 0;
      check(`${label} — ${r.toFixed(2)}:1`, r >= floor, `${fg} on ${bg}`);
    }

    // The accented word is a colour-mix off the accent rail, and the rail is
    // per-theme AND per-accent. Every declared value is measured, not just the
    // default indigo — an accent that fails would fail only for the users who
    // picked it, which is exactly the kind of bug nobody reports.
    const part = Number(
      src(REND).match(/color-mix\(in srgb, var\(--app-rail-a\) (\d+)%/)?.[1] ?? 0
    ) / 100;
    const rails = [...cssText.matchAll(/--app-rail-a:\s*(#[0-9a-fA-F]{6})/g)].map(
      (m) => m[1]
    );
    // The accented word moved off the creative with the rest of the headline.
    // It is no longer the rail lightened with white — that mix existed only to
    // lift the rail off a dark band, and on a light card it would be nearly
    // invisible (1.00:1 measured). The component uses `--app-info`, the brand's
    // own text colour, which is defined and measured for BOTH themes.
    let worst = { r: Infinity, theme: "" };
    for (const theme of ["dark", "light"] as const) {
      const r = ratio(token("--app-info", theme), token("--app-surface", theme));
      if (r < worst.r) worst = { r, theme };
    }
    check(
      `accented word — brand ink on the card (worst: ${worst.theme}) — ${worst.r.toFixed(2)}:1`,
      worst.r >= 4.5
    );
    check(
      "the white-lightened rail is gone with the band it existed for",
      !/mixWhite\(rail/.test(src(REND)) && !/ACCENT_ON_MEDIA/.test(src(REND)),
      "that mix only made sense over a dark scrim; on a light card it disappears"
    );
    console.log(
      `   ${rails.length} accent rails are still measured for the nav marker above`
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
