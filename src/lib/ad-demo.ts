import { Prisma } from "@/generated/prisma/client";
import { AD_PLACEMENTS, placementSizeKey } from "@/lib/ad-placements";

/**
 * Minimal structural client type — satisfied by BOTH the app's Accelerate-
 * extended `prisma` and a plain `new PrismaClient()` in the seed script (their
 * concrete types differ, so a loose shape keeps this helper portable).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type DemoPrisma = {
  adPlacement: {
    upsert(args: any): Promise<any>;
    findMany(args?: any): Promise<any[]>;
  };
  adCampaign: {
    findFirst(args: any): Promise<any | null>;
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
    deleteMany(args: any): Promise<{ count: number }>;
  };
  ad: {
    findMany(args: any): Promise<any[]>;
    create(args: any): Promise<any>;
  };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Demo-ad generator shared by the admin "Generate demo ads" API route and the
 * `prisma/seed-demo-ads.ts` seed script. Creates one labeled preview ad for
 * every ad placement so the whole ad-space network is visibly populated (each
 * demo is a self-contained SVG data-URI — no external asset). Idempotent.
 */
export const DEMO_CAMPAIGN_TITLE = "DEMO — Ad Previews";

const LABELS = new Map<string, string>(
  AD_PLACEMENTS.map((p) => [p.name, p.label])
);
const PALETTE = [
  "#4f46e5", "#7c3aed", "#0891b2", "#059669", "#d97706",
  "#db2777", "#dc2626", "#2563eb", "#0d9488", "#c026d3",
];

function demoBanner(label: string, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">` +
    `<rect width="600" height="200" fill="${color}"/>` +
    `<rect x="8" y="8" width="584" height="184" rx="14" fill="none" stroke="#ffffff40" stroke-width="2"/>` +
    `<text x="300" y="92" font-family="sans-serif" font-size="30" font-weight="bold" fill="#ffffff" text-anchor="middle">${label}</text>` +
    `<text x="300" y="132" font-family="sans-serif" font-size="18" fill="#ffffffcc" text-anchor="middle">DEMO AD · click to preview</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function demoLogo(color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">` +
    `<rect width="80" height="80" rx="16" fill="${color}"/>` +
    `<text x="40" y="52" font-family="sans-serif" font-size="34" font-weight="bold" fill="#fff" text-anchor="middle">AD</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Create one labeled demo ad per placement. Returns how many were created. */
export async function generateDemoAds(
  prisma: DemoPrisma
): Promise<{ created: number; total: number }> {
  // Ensure every canonical placement row exists (incl. new global slots).
  await Promise.all(
    AD_PLACEMENTS.map((p) =>
      prisma.adPlacement.upsert({
        where: { name: p.name },
        create: { name: p.name, platform: "ALL", isActive: true },
        update: {},
      })
    )
  );

  // House + ACTIVE so /api/ads/serve and /api/ads/feed pick these up.
  //
  // `isHouse: true` replaces the old $100,000 budget. A house campaign is exempt
  // from the budget floor in `servableCampaignWhere` and is never billed by
  // `recordClick`, so the demo no longer needs fake money — and no longer
  // reports fake spend. The old version really was spending it: seeded at
  // 100000, the live row had drifted to 99998.10, and every one of those clicks
  // went into `spentTotal`, the figure that means "ad revenue earned".
  let campaign = await prisma.adCampaign.findFirst({
    where: { title: DEMO_CAMPAIGN_TITLE },
  });
  if (!campaign) {
    campaign = await prisma.adCampaign.create({
      data: {
        title: DEMO_CAMPAIGN_TITLE,
        description: "Auto-generated preview ads — one per ad space.",
        budget: 0,
        status: "ACTIVE",
        isHouse: true,
      },
    });
  } else if (campaign.status !== "ACTIVE" || !campaign.isHouse) {
    campaign = await prisma.adCampaign.update({
      where: { id: campaign.id },
      data: { status: "ACTIVE", isHouse: true },
    });
  }

  const placements = await prisma.adPlacement.findMany();
  const existing = await prisma.ad.findMany({
    where: { campaignId: campaign.id },
    select: { placementId: true },
  });
  const covered = new Set(existing.map((a) => a.placementId));

  let created = 0;
  await Promise.all(
    placements.map((placement, i) => {
      if (covered.has(placement.id)) return Promise.resolve();
      const label = LABELS.get(placement.name) ?? placement.name;
      const color = PALETTE[i % PALETTE.length];
      const isFeed = placement.name === "IN_FEED";
      created += 1;
      return prisma.ad.create({
        data: {
          campaignId: campaign!.id,
          placementId: placement.id,
          type: "LOCAL",
          format: isFeed ? "NATIVE" : "BANNER",
          status: "ACTIVE",
          // Weight 1, not 10. Demo ads used to carry the same default weight as
          // real inventory, so with one demo and one real ad in a space roughly
          // half of all impressions went to a placeholder whose target URL is
          // "#demo". Real ads now out-weight the demo 10:1.
          weight: 1,
          contentUrl: demoBanner(label, color),
          targetUrl: "#demo",
          size: placementSizeKey(placement.name),
          targeting: Prisma.JsonNull, // everyone
          ...(isFeed
            ? {
                headline: `Demo native ad — ${label}`,
                brandName: "DEMO Brand",
                brandLogo: demoLogo(color),
                ctaLabel: "Learn More",
              }
            : {}),
        },
      });
    })
  );

  return { created, total: placements.length };
}

/** Delete the demo campaign (cascades to its demo ads). */
export async function removeDemoAds(
  prisma: DemoPrisma
): Promise<{ removed: number }> {
  const res = await prisma.adCampaign.deleteMany({
    where: { title: DEMO_CAMPAIGN_TITLE },
  });
  return { removed: res.count };
}

/* ── House fallback for the revenue spaces ─────────────────────────────────── */

export const HOUSE_CAMPAIGN_TITLE = "House — Platform promos";

/**
 * The spaces that must never be empty, because they are the ones that earn.
 *
 * `REWARD_INTERSTITIAL` is the full-screen shown before every reward claim. Its
 * gate is already wired into 12 claim surfaces via `runInterstitial()` — but the
 * placement had **zero ads**, and `AdInterstitialOverlay` calls `onDone()`
 * immediately when the serve returns nothing. So every one of those gates opened
 * instantly and invisibly, which is exactly why the owner sees no ad when a user
 * claims points. `EARN_BROWSE` is the Browse & Earn surface, where users are paid
 * per rotation — an empty slot there means the platform pays out and earns nothing.
 *
 * Both are incentivised, so Google's inventory can never fill them (see
 * `PLACEMENT_SPEC.networkAllowed`). Until direct-sold inventory exists they are
 * filled with the platform promoting its own paid plan, which is what house
 * inventory is for — a real conversion path, not a dead placeholder.
 */
const HOUSE_FALLBACK: Array<{
  placement: string;
  headline: string;
  body: string;
  cta: string;
  url: string;
  color: string;
  /** Wide-and-short creative, for slots with a low height ceiling. */
  wide?: boolean;
}> = [
  {
    placement: "REWARD_INTERSTITIAL",
    headline: "Earn without the wait",
    body: "Upgrade your plan for higher task rewards, bigger daily limits and an ad-free experience.",
    cta: "See plans",
    url: "/packages",
    color: "#4f46e5",
  },
  {
    placement: "EARN_BROWSE",
    headline: "Earn faster every day",
    body: "Paid plans unlock higher multipliers and more daily tasks.",
    cta: "Upgrade",
    url: "/packages",
    color: "#0891b2",
  },
  {
    placement: "VIDEO_INTERSTITIAL",
    headline: "Skip the ads",
    body: "An ad-free plan removes these and raises your earning limits.",
    cta: "See plans",
    url: "/packages",
    color: "#7c3aed",
  },
  {
    placement: "GAME_INTERSTITIAL",
    headline: "Play more, earn more",
    body: "Upgrade for higher game rewards and longer daily play time.",
    cta: "Upgrade",
    url: "/packages",
    color: "#059669",
  },
  {
    // Renders under every post in the feed, so it is the highest-volume slot on
    // the platform — and it was empty. Its ceiling is 72px, so this one gets a
    // wide, short creative instead of the portrait promo.
    placement: "FEED_POST_BELOW",
    headline: "Upgrade for higher rewards",
    body: "Bigger task payouts and no ads.",
    cta: "See plans",
    url: "/packages",
    color: "#2563eb",
    wide: true,
  },

  // ── The nine spaces added in Phase 3 ────────────────────────────────────
  // Phase 2 established that an empty placement is worse than no placement:
  // the slot resolves to nothing, the surface looks broken, and nobody can
  // tell a space with no demand from a space that was never filled. So every
  // new space ships with a creative on day one. All are wide — the anchor
  // ceiling is 64px and the page-top slots are 120px leaderboards.
  {
    placement: "ANCHOR_BOTTOM",
    headline: "Earn more every day — upgrade",
    body: "Higher payouts, bigger limits.",
    cta: "See plans",
    url: "/packages",
    color: "#1d4ed8",
    wide: true,
  },
  {
    placement: "WITHDRAW_TOP",
    headline: "Lower withdrawal fees on paid plans",
    body: "Keep more of what you earn.",
    cta: "Compare",
    url: "/packages",
    color: "#047857",
    wide: true,
  },
  {
    placement: "LEADERBOARD_TOP",
    headline: "Climb faster — more daily tasks",
    body: "Paid plans raise your daily limit.",
    cta: "Upgrade",
    url: "/packages",
    color: "#b45309",
    wide: true,
  },
  {
    placement: "QUIZZES_TOP",
    headline: "More quizzes, higher rewards",
    body: "Unlock the full quiz catalogue.",
    cta: "See plans",
    url: "/packages",
    color: "#7c3aed",
    wide: true,
  },
  {
    placement: "DEPOSIT_TOP",
    headline: "Turn a deposit into a bigger plan",
    body: "Higher multipliers on every task.",
    cta: "Compare",
    url: "/packages",
    color: "#0891b2",
    wide: true,
  },
  {
    placement: "PACKAGES_TOP",
    headline: "Invite friends, earn from their work",
    body: "Three levels of referral commission.",
    cta: "My team",
    url: "/referrals",
    color: "#be123c",
    wide: true,
  },
  {
    placement: "NOTIFICATIONS_TOP",
    headline: "Don't miss a daily bonus",
    body: "Claim your streak before it resets.",
    cta: "Daily Mission",
    url: "/daily-mission",
    color: "#4338ca",
    wide: true,
  },
  {
    placement: "REFERRALS_TOP",
    headline: "Earn from three levels of team",
    body: "Share your link and build downline.",
    cta: "See plans",
    url: "/packages",
    color: "#0d9488",
    wide: true,
  },
  {
    placement: "DAILY_MISSION_TOP",
    headline: "Finish today's mission for a bonus",
    body: "Streaks pay more the longer they run.",
    cta: "Browse tasks",
    url: "/tasks",
    color: "#c2410c",
    wide: true,
  },
];

/** Wide 728x90-shaped promo for slots that cannot be tall. */
function housePromoWide(headline: string, cta: string, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="728" height="90">` +
    `<rect width="728" height="90" fill="${color}"/>` +
    `<text x="28" y="52" font-family="sans-serif" font-size="24" font-weight="bold" fill="#ffffff">${headline}</text>` +
    `<rect x="560" y="24" width="140" height="42" rx="21" fill="#ffffff"/>` +
    `<text x="630" y="51" font-family="sans-serif" font-size="16" font-weight="bold" fill="${color}" text-anchor="middle">${cta}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function housePromo(headline: string, body: string, color: string): string {
  // Portrait-ish, so it reads well in the full-screen overlay (which clamps to
  // max-w-md / max-h-72 anyway).
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="#0f172a"/>` +
    `</linearGradient></defs>` +
    `<rect width="600" height="400" fill="url(#g)"/>` +
    `<text x="300" y="170" font-family="sans-serif" font-size="38" font-weight="bold" fill="#ffffff" text-anchor="middle">${headline}</text>` +
    `<text x="300" y="215" font-family="sans-serif" font-size="19" fill="#ffffffcc" text-anchor="middle">${body.slice(0, 52)}</text>` +
    `<rect x="210" y="255" width="180" height="48" rx="24" fill="#ffffff"/>` +
    `<text x="300" y="286" font-family="sans-serif" font-size="19" font-weight="bold" fill="${color}" text-anchor="middle">Upgrade</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Make sure the revenue spaces have inventory. Idempotent — skips any space that
 * already has an ACTIVE ad from any campaign, so it never competes with real
 * direct-sold inventory once that exists.
 */
export async function ensureHouseFallback(
  prisma: DemoPrisma
): Promise<{ created: number; skipped: number }> {
  await Promise.all(
    AD_PLACEMENTS.map((p) =>
      prisma.adPlacement.upsert({
        where: { name: p.name },
        create: { name: p.name, platform: "ALL", isActive: true },
        update: {},
      })
    )
  );

  let campaign = await prisma.adCampaign.findFirst({
    where: { title: HOUSE_CAMPAIGN_TITLE },
  });
  if (!campaign) {
    campaign = await prisma.adCampaign.create({
      data: {
        title: HOUSE_CAMPAIGN_TITLE,
        description:
          "Platform self-promotion. Fills the reward and Browse & Earn spaces so they are never empty. Never billed.",
        budget: 0,
        status: "ACTIVE",
        isHouse: true,
      },
    });
  } else if (campaign.status !== "ACTIVE" || !campaign.isHouse) {
    campaign = await prisma.adCampaign.update({
      where: { id: campaign.id },
      data: { status: "ACTIVE", isHouse: true },
    });
  }

  const placements = await prisma.adPlacement.findMany();
  const byName = new Map(placements.map((p) => [p.name as string, p]));

  let created = 0;
  let skipped = 0;

  for (const spot of HOUSE_FALLBACK) {
    const placement = byName.get(spot.placement);
    if (!placement) {
      skipped++;
      continue;
    }
    // Only fill a genuinely empty space — real inventory always wins.
    const already = await prisma.ad.findMany({
      where: { placementId: placement.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (already.length > 0) {
      skipped++;
      continue;
    }
    await prisma.ad.create({
      data: {
        campaignId: campaign!.id,
        placementId: placement.id,
        type: "LOCAL",
        format: "BANNER",
        status: "ACTIVE",
        // Below real inventory, above the demo previews.
        weight: 5,
        contentUrl: spot.wide
          ? housePromoWide(spot.headline, spot.cta, spot.color)
          : housePromo(spot.headline, spot.body, spot.color),
        targetUrl: spot.url,
        headline: spot.headline,
        brandName: "EarnGPT",
        ctaLabel: spot.cta,
        size: placementSizeKey(spot.placement),
        targeting: Prisma.JsonNull, // everyone
      },
    });
    created++;
  }

  return { created, skipped };
}
