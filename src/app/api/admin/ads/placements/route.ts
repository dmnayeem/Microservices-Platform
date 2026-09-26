import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ensureDefaultPlacements } from "@/lib/ad-placements-server";
import { isCanonicalPlacement } from "@/lib/ad-placements";
import { getSetting } from "@/lib/system-settings";
import { getAdDensity } from "@/lib/ad-density";
import { getBrowseEarnConfig } from "@/lib/browse-earn";
import { getRewardedConfig } from "@/lib/ads-rewarded";
import { getAdFrequencyConfig } from "@/lib/ad-frequency";
import { adRevenueLastDays } from "@/lib/ad-revenue";

export async function GET() {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Make sure the canonical slots always exist.
  await ensureDefaultPlacements().catch(() => {});
  const [placements, ads] = await Promise.all([
    prisma.adPlacement.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { ads: true } } },
    }),
    prisma.ad.findMany({
      select: { placementId: true, status: true, impressions: true, clicks: true },
    }),
  ]);

  // Aggregate live stats per placement from the Ad table.
  const statsByPlacement = new Map<
    string,
    { impressions: number; clicks: number; activeAds: number; totalAds: number }
  >();
  for (const ad of ads) {
    const cur =
      statsByPlacement.get(ad.placementId) ?? {
        impressions: 0,
        clicks: 0,
        activeAds: 0,
        totalAds: 0,
      };
    cur.impressions += ad.impressions;
    cur.clicks += ad.clicks;
    cur.totalAds += 1;
    if (ad.status === "ACTIVE") cur.activeAds += 1;
    statsByPlacement.set(ad.placementId, cur);
  }

  const cpcUsd = Math.min(
    100,
    Math.max(0.001, Number(await getSetting<number>("ads.cpcUsd", 0.05)) || 0.05)
  );
  // ── What this space actually earns ────────────────────────────────────────
  //
  // Pricing a space was a guess: the card showed lifetime impressions and a
  // blank "click price" box, and nothing anywhere said what the space had ever
  // brought in. So every one of the 29 sat on the global rate.
  //
  // A real 30-day figure per space, through the same house/network gate the
  // reports use (`src/lib/ad-revenue.ts`), makes it an informed decision. No
  // price is ever suggested — what a space is worth is the owner's call — but
  // "this space earned $0.00 from 4,100 impressions" and "this one earned
  // $3.20 from 900" are the two facts that decision needs.
  // Revenue per space is finance; without it the figure is not sent at all.
  const seesMoney = await can(session.user.id, "finance.view");
  const window = seesMoney ? await adRevenueLastDays(30).catch(() => null) : null;

  const withStats = placements.map((p) => {
    const earned = window?.byPlacementId.get(p.id);
    const rate = p.cpcUsd == null ? cpcUsd : Number(p.cpcUsd);
    return {
      ...p,
      stats:
        statsByPlacement.get(p.id) ?? {
          impressions: 0,
          clicks: 0,
          activeAds: 0,
          totalAds: 0,
        },
      /** Billable revenue and traffic for this space over the last 30 days. */
      recent: {
        days: 30,
        usd: seesMoney ? (earned?.usd ?? 0) : null,
        impressions: earned?.impressions ?? 0,
        clicks: earned?.clicks ?? 0,
      },
      /**
       * What a click here costs TODAY: the space's own rate, or the global
       * one when it has none. The card shows this so "no rate set" reads as a
       * price rather than as a blank.
       */
      effectiveCpcUsd: Number.isFinite(rate) ? rate : cpcUsd,
      usesGlobalRate: p.cpcUsd == null,
    };
  });

  const rotationSeconds = Math.min(
    60,
    Math.max(5, Number(await getSetting<number>("ads.rotation_seconds", 12)) || 12)
  );
  const adsenseClient = String((await getSetting<string>("ads.adsense_client", "")) || "");
  const gamNetworkCode = String((await getSetting<string>("ads.gam_network_code", "")) || "");
  // Google policy plumbing (Phase 5): certified CMP, auto ads, ads.txt.
  const googleCmpEnabled = !!(await getSetting<boolean>("ads.google_cmp_enabled", false));
  const autoAdsEnabled = !!(await getSetting<boolean>("ads.auto_ads_enabled", false));
  const adsTxt = String((await getSetting<string>("ads.txt_content", "")) || "");
  // Volume discount on ad-credit purchases. Fully implemented since the credit
  // system shipped, and permanently 0 because no UI ever set it.
  const creditBonusPct = Math.min(
    100,
    Math.max(0, Number(await getSetting<number>("ads.credit_bonus_pct", 0)) || 0)
  );
  // Who the invoice is FROM, and whether tax applies. Empty is fine — the PDF
  // simply omits what is not set, and at 0% no tax line is rendered at all.
  const billing = {
    sellerName: String((await getSetting<string>("billing.seller_name", "")) || ""),
    sellerAddress: String((await getSetting<string>("billing.seller_address", "")) || ""),
    sellerEmail: String((await getSetting<string>("billing.seller_email", "")) || ""),
    sellerPhone: String((await getSetting<string>("billing.seller_phone", "")) || ""),
    taxPct: Math.min(100, Math.max(0, Number(await getSetting<number>("billing.tax_pct", 0)) || 0)),
    taxLabel: String((await getSetting<string>("billing.tax_label", "VAT")) || "VAT"),
    taxId: String((await getSetting<string>("billing.tax_id", "")) || ""),
  };
  const density = await getAdDensity();
  const browseEarn = await getBrowseEarnConfig();
  const rewarded = await getRewardedConfig();
  const adFrequency = await getAdFrequencyConfig();

  return NextResponse.json({
    placements: withStats,
    rotationSeconds,
    cpcUsd,
    adsenseClient,
    gamNetworkCode,
    googleCmpEnabled,
    autoAdsEnabled,
    adsTxt,
    creditBonusPct,
    billing,
    density,
    browseEarn,
    rewarded,
    adFrequency,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim().toUpperCase().replace(/\s+/g, "_");
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  // A placement name is not a label — it is the key `<AdRenderer placement="…">`
  // is mounted with. A name that matches no mount point creates a space that can
  // never render anywhere, and any ad assigned to it is stranded: it passes
  // review, it is ACTIVE, it has budget, and it will never serve once. That is
  // exactly what happened to `QW`, where two ads sat unable to run.
  //
  // The canonical list is the only set of names the UI actually mounts, so it is
  // the only set a space may be created with. Adding a real new space means
  // adding it to AD_PLACEMENTS and mounting it — one commit, not one text box.
  if (!isCanonicalPlacement(name)) {
    return NextResponse.json(
      {
        error:
          `"${name}" is not a mounted ad space. Ads placed in a space that no ` +
          `page renders can never serve. Add it to AD_PLACEMENTS and mount an ` +
          `<AdRenderer> for it first.`,
      },
      { status: 400 }
    );
  }
  const placement = await prisma.adPlacement.upsert({
    where: { name },
    create: { name, platform: body.platform || "ALL", isActive: true },
    update: {},
  });
  return NextResponse.json({ placement });
}
