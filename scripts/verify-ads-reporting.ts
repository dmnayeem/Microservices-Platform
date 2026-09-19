import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

/**
 * Phases A + B verification — ad reporting correctness.
 *
 * Everything here is a number the owner makes decisions on, so the checks are
 * about *truthfulness*, not about features working. A report that is merely
 * wrong is worse than one that is missing: he acts on it.
 *
 * Four of these guard bugs that were actually live:
 *   - /admin/finance showed remaining budget under the title "Ad Spend"
 *   - eCPM divided by impressions that structurally cannot earn (network)
 *   - impressions were counted for network ads that were never rendered
 *   - "ad credit purchased" reported the bonus as if it were cash
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-ads-reporting.ts
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
/** Comments stripped — an absence check must read code, not the prose about it. */
const code = (p: string) =>
  src(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

async function main() {
  console.log("\n=== Ad reporting ===\n");

  /* A1 — ad revenue, wherever it is reported. */
  //
  // These used to read `app/admin/finance/page.tsx`. The finance-console rewrite
  // moved the calculation into `lib/finance/revenue.ts` and left the assertions
  // pointing at a file that no longer held it — so they went red while the
  // behaviour was fine, and meanwhile the SAME defect survived untouched on the
  // admin dashboard with nothing watching it. They now assert the rule at every
  // surface that reports the figure, which is what stops the two drifting apart
  // again.
  console.log("A1. Ad revenue is billed money, not committed budget");
  {
    const revenue = code("lib/finance/revenue.ts");
    const dash = code("app/admin/page.tsx");

    // These two used to pin `_sum: { spentTotal: true }` and a literal
    // `isHouse: false` inside revenue.ts. Both guarantees still hold, but the
    // query moved into `adRevenueWindow` — `spentTotal` is LIFETIME, so reading
    // it here made the ad line ignore the date filter every other line obeys.
    // Assert where the money now comes from, and that the exclusion lives in
    // the helper rather than having quietly disappeared.
    const adRevenueLib = code("lib/ad-revenue.ts");
    check(
      "finance reads windowed ad revenue, not a lifetime campaign total",
      /adRevenueWindow\(/.test(revenue) &&
        !/_sum: \{ spentTotal: true \}/.test(revenue),
      "spentTotal has no time axis, so the date filter did nothing to this line"
    );
    check(
      "…and it is passed the caller's range, not a hardcoded window",
      /adRevenueWindow\(range\.from/.test(revenue)
    );
    check(
      "finance excludes house campaigns — they bill nothing by design",
      /isHouse/.test(adRevenueLib) && /isNetworkAdType/.test(adRevenueLib),
      "house inventory billing itself is not income, and network types are not ours"
    );
    check(
      "the dashboard sums spentTotal, not budget, for revenue",
      /const adRevenueTotal = toNum\(adSpendAgg\._sum\.spentTotal\)/.test(dash)
    );
    check(
      "the dashboard excludes house campaigns too",
      /where: \{ isHouse: false \},\s*_sum: \{ spentTotal: true, budget: true \}/.test(dash)
    );
    check(
      'the dashboard card is no longer titled "Ad Spend" over committed budget',
      /title="Ad Revenue"/.test(dash) && !/title="Ad Spend"/.test(dash)
    );
    check(
      "unspent budget is shown separately, as the liability it is",
      /title="Ad Budget Unspent"/.test(dash) &&
        /adBudgetUnspent = Math\.max\(/.test(dash)
    );
    // The console must still source its ad figure from the shared module, or
    // the two screens can disagree again without any check noticing.
    check(
      "the finance console reports ads through that shared module",
      /getRevenueBreakdown/.test(code("app/admin/finance/page.tsx"))
    );
  }

  /* A2 — eCPM. */
  console.log("\nA2. eCPM divides by impressions that can actually earn");
  {
    const s = code("app/api/admin/ads/report/route.ts");
    check(
      "network impressions are tracked",
      /networkImpressions: number/.test(s) &&
        /if \(network\) cur\.networkImpressions \+= s\.impressions/.test(s)
    );
    check(
      "BOTH house and network are out of the denominator",
      /v\.impressions - v\.houseImpressions - v\.networkImpressions/.test(s)
    );
  }
  {
    const s = code("app/api/admin/ads/analytics/route.ts");
    check(
      // The literal pair used to be spelled out here. It is now the shared
      // `isNetworkAdType` from src/lib/ad-revenue.ts — same exclusion, one
      // definition, so this accepts either spelling rather than pinning the
      // panel to a copy it no longer owns.
      "the platform-wide eCPM excludes them too",
      /!a\.campaign\?\.isHouse && !isNetworkAdType\(a\.type\)/.test(s) ||
        /!a\.campaign\?\.isHouse && a\.type !== "ADSENSE" && a\.type !== "GAM"/.test(s)
    );
    check(
      "it no longer divides by every impression in the window",
      !/windowImpr > 0 \?/.test(s)
    );
  }
  // Arithmetic, against the exact formula the routes use.
  {
    const ecpm = (spend: number, impr: number, house: number, net: number) => {
      const paid = Math.max(0, impr - house - net);
      return paid > 0 ? (spend / paid) * 1000 : 0;
    };
    check("$5 over 1,000 earning impressions is a $5 eCPM", ecpm(5, 1000, 0, 0) === 5);
    check("house impressions do not dilute it", ecpm(5, 2000, 1000, 0) === 5);
    check("network impressions do not dilute it either", ecpm(5, 2000, 0, 1000) === 5);
    check("a space that is all network reports 0, not a fraction", ecpm(0, 900, 0, 900) === 0);
    check(
      "no NaN or Infinity from an empty denominator",
      Number.isFinite(ecpm(9, 0, 0, 0)) && ecpm(9, 0, 0, 0) === 0
    );
  }

  /* A3 — impression inflation. */
  console.log("\nA3. An ad that is not served counts no impression");
  {
    const s = code("lib/ad-serve.ts");
    const guard = s.indexOf("if (!network) return EMPTY;");
    const count = s.indexOf("bufferImpression(");
    check("the network guard exists", guard > 0);
    check(
      "the impression is counted AFTER every path that can still refuse",
      guard > 0 && count > guard,
      `guard@${guard} count@${count}`
    );
    check(
      "it is still counted exactly once",
      (s.match(/bufferImpression\(\s*chosen\.id/g) ?? []).length === 1
    );
  }

  /* A4 / A5 — say what the numbers mean. */
  console.log("\nA4/A5. The numbers say what period they cover");
  {
    const s = src("components/admin/ads/ad-manager-view.tsx");
    check("a UTC-day note is rendered under the chart", /<UtcDayNote \/>/.test(s));
    check(
      "the offset is read on the client, not during render (hydration)",
      /useSyncExternalStore\(/.test(s) && /NEUTRAL_UTC_NOTE/.test(s)
    );
    check(
      "the placement card figures are labelled all-time",
      /All time<\/p>/.test(s)
    );
  }
  // The note's arithmetic, for a few real offsets.
  {
    const startsAt = (mins: number) => {
      const m = ((mins % 1440) + 1440) % 1440;
      return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    };
    check("UTC+6 (Dhaka): a UTC day starts at 06:00 local", startsAt(360) === "06:00");
    check("UTC-5 (New York): it starts at 19:00 local", startsAt(-300) === "19:00");
    check("UTC+5:30 (India): half-hour offsets survive", startsAt(330) === "05:30");
    check("UTC+0: midnight", startsAt(0) === "00:00");
  }

  /* A6 — cash received. */
  console.log("\nA6. Cash received is cash, not cash plus bonus");
  {
    const s = code("app/api/admin/ads/analytics/route.ts");
    check(
      "it reads the real paid amount rather than aggregating delta",
      /metadata: true/.test(s) && /paidUsd/.test(s)
    );
    check(
      "rows written before that field fall back to delta",
      /toNum\(row\.delta\)/.test(s)
    );
  }
  {
    // The exact reducer, against rows shaped like the real ones.
    const rows = [
      { delta: 110, metadata: { paidUsd: 100 } }, // 10% bonus
      { delta: 50, metadata: null }, // legacy row
      { delta: 20, metadata: { paidUsd: 0 } }, // a grant-like zero
    ];
    const total = rows.reduce((sum, r) => {
      const n = Number((r.metadata as { paidUsd?: unknown } | null)?.paidUsd);
      return sum + (Number.isFinite(n) && n > 0 ? n : r.delta);
    }, 0);
    check(
      "$100 paid at a 10% bonus reports as $100, not $110",
      total === 170,
      String(total)
    );
  }

  /* B1 — the campaign drill-down. */
  console.log("\nB1. A campaign can be opened");
  {
    const s = code("app/api/admin/ads/campaigns/[id]/route.ts");
    check("the GET exists at all", /export async function GET\(/.test(s));
    check("it is gated on ads.view", /can\(session\.user\.id, "ads\.view"\)/.test(s));
    check(
      "it zero-fills the window, like every other ad series",
      /byDay\.set\(d\.toISOString\(\)\.slice\(0, 10\)/.test(s)
    );
    check(
      "per-ad rows are windowed to the same range as the chart",
      /const perAd = new Map</.test(s)
    );
    check(
      "it distinguishes funded from remaining, which is the finance-card mistake",
      /funded: budget \+ spent/.test(s)
    );
  }
  {
    const s = src("components/admin/ads/ad-manager-view.tsx");
    check(
      "campaign rows are no longer dead text",
      /setCampDetail\(c\.id\)/.test(s) && /<CampaignDetailModal/.test(s)
    );
  }

  /* B2 — export. */
  console.log("\nB2. Ads can be exported");
  {
    const s = code("app/api/admin/ads/report/export/route.ts");
    check("it serves CSV as an attachment", /text\/csv/.test(s) && /attachment; filename=/.test(s));
    check("it is gated on ads.view", /can\(session\.user\.id, "ads\.view"\)/.test(s));
    check(
      "it carries ids, which the on-screen tables do not",
      /"ad_id"/.test(s) && /"campaign_id"/.test(s) && /"placement_id"/.test(s)
    );
    check(
      "it exposes the house/network split rather than hiding a zero",
      /"house_impr"/.test(s) && /"network_impr"/.test(s)
    );
    check(
      "an unmeasured fill rate is blank, not 0",
      /f && f\.requests > 0 \? n2\(\(f\.fills \/ f\.requests\) \* 100\) : ""/.test(s)
    );
    check("an unknown scope is rejected", /Unknown scope/.test(s));
  }
  {
    // The escaper, which is the whole reason a hand-rolled CSV is safe.
    const csvCell = (v: string | number | null | undefined): string => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    check("a comma is quoted", csvCell("Acme, Inc") === '"Acme, Inc"');
    check('a quote is doubled', csvCell('He said "hi"') === '"He said ""hi"""');
    check("a newline is quoted", csvCell("a\nb") === '"a\nb"');
    check("a plain value is left alone", csvCell("plain") === "plain");
    check("null becomes empty, not the string null", csvCell(null) === "");
  }
  {
    const s = src("components/admin/ads/ad-manager-view.tsx");
    check(
      "the export is reachable from the UI",
      /\/api\/admin\/ads\/report\/export\?days=/.test(s)
    );
  }

  /* B3 — the advertiser's own numbers agree with each other. */
  console.log("\nB3. The advertiser sees one period, not two");
  {
    const s = code("app/api/advertiser/campaigns/[id]/analytics/route.ts");
    check(
      "per-ad stats are aggregated for the window",
      /const perAd = new Map</.test(s)
    );
    check("per-ad spend is returned at all", /spend: w\.spendUsd/.test(s));
    check(
      "lifetime is still available, but named as lifetime",
      /lifetimeImpressions: a\.impressions/.test(s)
    );
  }
  {
    const s = code("components/user/advertiser/campaign-detail-view.tsx");
    check(
      "the ad cards use the windowed figures",
      /const windowed = new Map</.test(s)
    );
    check(
      "and the heading says which window",
      /Ads \(\{ads\.length\}\) · last \{days\} days/.test(
        src("components/user/advertiser/campaign-detail-view.tsx")
      )
    );
  }

  /* Live sanity — the report and the campaign GET must not disagree. */
  console.log("\nLive consistency");
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 29);
  const stats = await prisma.adDailyStat.findMany({
    where: { date: { gte: since } },
    select: { adId: true, impressions: true, spendUsd: true },
  });
  const ads = stats.length
    ? await prisma.ad.findMany({
        where: { id: { in: [...new Set(stats.map((s) => s.adId))] } },
        select: { id: true, campaignId: true },
      })
    : [];
  const campaignOf = new Map(ads.map((a) => [a.id, a.campaignId]));
  const byCampaign = new Map<string, number>();
  for (const s of stats) {
    const c = campaignOf.get(s.adId);
    if (c) byCampaign.set(c, (byCampaign.get(c) ?? 0) + s.impressions);
  }
  console.log(
    `   ${stats.length} daily rows over 30d across ${byCampaign.size} campaign(s)`
  );
  check(
    "every daily stat row resolves to a live ad (no orphans in the report)",
    stats.every((s) => campaignOf.has(s.adId)),
    `${stats.filter((s) => !campaignOf.has(s.adId)).length} orphan(s)`
  );
  const houseSpend = await prisma.adCampaign.aggregate({
    where: { isHouse: true },
    _sum: { spentTotal: true },
  });
  check(
    "no house campaign carries spend that would be reported as revenue",
    Number(houseSpend._sum.spentTotal ?? 0) === 0,
    String(houseSpend._sum.spentTotal)
  );

  /* C — the daily rollup is not a revenue column.
   *
   * `AdCampaign.spentTotal` was corrected when house inventory stopped billing
   * itself; `AdDailyStat.spendUsd` never was, and still holds $1.95 of demo/house
   * self-billing against $1.15 of real advertiser spend. Every surface that sums
   * that column was therefore reporting ad revenue at ~2.7x — next to
   * `revenue.lifetime`, which is derived from `spentTotal` and was right. The
   * check above only looked at `spentTotal`, so it stayed green throughout.
   */
  console.log("\nC. House spend never counts as revenue in the rollup");
  for (const [file, label] of [
    ["app/api/admin/ads/analytics/route.ts", "the dashboard"],
    ["app/api/admin/ads/report/route.ts", "the report"],
    ["app/api/admin/ads/report/export/route.ts", "the CSV"],
  ] as const) {
    const c = code(file);
    // The spend accumulator must sit behind a house/network guard, not sum blind.
    const guarded =
      /if\s*\(\s*!\s*(?:a\.campaign\?\.)?(?:house|isHouse)[\s\S]{0,120}?spend/.test(c) ||
      /if\s*\(earning\.has\([\s\S]{0,60}?spendUsd/.test(c);
    check(`${label} gates spend on earning inventory`, guarded);
  }

  const allStats = await prisma.adDailyStat.findMany({
    select: { adId: true, clicks: true, impressions: true, spendUsd: true },
  });
  const allAds = await prisma.ad.findMany({
    select: {
      id: true,
      type: true,
      clicks: true,
      impressions: true,
      campaign: { select: { isHouse: true } },
    },
  });
  const adById = new Map(allAds.map((a) => [a.id, a]));
  const earningSpend = allStats.reduce((sum, s) => {
    const a = adById.get(s.adId);
    if (!a || a.campaign?.isHouse || a.type === "ADSENSE" || a.type === "GAM") return sum;
    return sum + Number(s.spendUsd);
  }, 0);
  const paidSpentTotal = await prisma.adCampaign.aggregate({
    where: { isHouse: false },
    _sum: { spentTotal: true },
  });
  const lifetime = Number(paidSpentTotal._sum.spentTotal ?? 0);
  check(
    "rollup revenue, filtered, reconciles with lifetime billed spend",
    Math.abs(earningSpend - lifetime) < 0.01,
    `rollup ${earningSpend.toFixed(4)} vs spentTotal ${lifetime.toFixed(4)}`
  );

  /* D — a date range has to change the ad revenue figure.
   *
   * `AdCampaign.spentTotal` is a lifetime counter with no date on it, so every
   * panel reading it reported the all-time total inside a filtered window —
   * the range control moved twelve numbers and left this one still. The per-day
   * data is in `AdDailyStat`; `src/lib/ad-revenue.ts` is now the one place that
   * sums it, through the same house/network gate section C checks for.
   */
  console.log("\nD. Windowed ad revenue is real");
  {
    const lib = code("lib/ad-revenue.ts");
    check(
      "the windowed sum reads AdDailyStat, not spentTotal",
      /adDailyStat\.findMany/.test(lib) && !/spentTotal/.test(lib.replace(/[\s\S]*?export /, "export "))
    );
    check(
      "it excludes house inventory",
      /campaign\.isHouse/.test(lib) || /isHouse/.test(lib)
    );
    check(
      "…and network inventory, by the shared predicate",
      /export function isNetworkAdType/.test(lib)
    );
    check(
      "the other panels use that predicate instead of their own copy",
      ["app/api/admin/ads/analytics/route.ts",
       "app/api/admin/ads/report/route.ts",
       "app/api/admin/ads/report/export/route.ts"].every((f) =>
        /isNetworkAdType/.test(code(f))
      ),
      "a fifth copy is how the figures start disagreeing"
    );
    check(
      "the ads dashboard shows the windowed revenue beside the lifetime one",
      /label=\{`Revenue \(\$\{days\}d\)`\}/.test(
        code("components/admin/ads/ad-manager-view.tsx")
      )
    );

    // Runtime: a window wide enough to hold everything must equal the filtered
    // rollup above, and a window before the platform existed must be zero.
    const { adRevenueWindow } = await import("../src/lib/ad-revenue");
    const all = await adRevenueWindow(new Date("2000-01-01"), new Date());
    check(
      "an all-time window equals the house/network-filtered rollup",
      Math.abs(all.usd - earningSpend) < 0.01,
      `window ${all.usd.toFixed(4)} vs rollup ${earningSpend.toFixed(4)}`
    );
    const perSpace = [...all.byPlacementId.values()].reduce((x, v) => x + v.usd, 0);
    check(
      "the per-space split adds up to the total",
      Math.abs(perSpace - all.usd) < 0.01,
      `${perSpace.toFixed(4)} vs ${all.usd.toFixed(4)}`
    );
    const none = await adRevenueWindow(new Date("2001-01-01"), new Date("2001-12-31"));
    check("a window with no days in it earns nothing", none.usd === 0);
    console.log(
      `   window carries ${all.houseImpressions} house and ${all.networkImpressions} network impression(s), earning $0 by design`
    );

    // Still lifetime, and owned by the finance side — reported, not edited.
    const revenueLib = code("lib/finance/revenue.ts");
    if (/spentTotal/.test(revenueLib)) {
      console.log(
        "   NOTE: src/lib/finance/revenue.ts still reads AdCampaign.spentTotal (lifetime) — swap that aggregate for adRevenueWindow(from, to) to make /admin/finance honour its date filter"
      );
    }
  }
  const blindSpend = allStats.reduce((s, r) => s + Number(r.spendUsd), 0);
  console.log(
    `   unfiltered rollup would report $${blindSpend.toFixed(4)} against $${lifetime.toFixed(4)} of real revenue`
  );

  /* C2 — CTR cannot exceed 100%.
   *
   * A click is deduped per (ad, viewer, bucket) and so is an impression. When the
   * click window was the SHORTER of the two, a returning viewer banked a second
   * billed click inside one impression's window — 4 clicks on 3 impressions, live.
   */
  const ev = code("lib/ad-events.ts");
  const clickMs = Number(/CLICK_COOLDOWN_MS\s*=\s*([\d_]+)/.exec(ev)?.[1]?.replace(/_/g, ""));
  const viewMs = Number(/VIEW_COOLDOWN_MS\s*=\s*([\d_]+)/.exec(ev)?.[1]?.replace(/_/g, ""));
  check(
    "the click dedup window is at least as long as the view window",
    Number.isFinite(clickMs) && Number.isFinite(viewMs) && clickMs >= viewMs,
    `click ${clickMs}ms vs view ${viewMs}ms`
  );
  const impossible = allStats.filter((s) => s.clicks > s.impressions);
  console.log(
    `   ${impossible.length} daily row(s) still carry clicks > impressions (historic; the window fix stops new ones)`
  );

  /* D1 — every ad event carries a country, and it is decided in ONE place.
   *
   * Nothing recorded a country on an ad event at all, so the owner's question
   * ("which country are my clicks and impressions coming from?") had no answer.
   * The risk in fixing it is not that the number is missing — it is that the
   * impression path and the click path each resolve a country their own way and
   * quietly disagree, which turns per-country CTR into a ratio of two different
   * populations. These assert against code with comments stripped.
   */
  console.log("\nD1. Ad events record a country, resolved in one place");
  {
    const geo = code("lib/ad-geo.ts");
    const events = code("lib/ad-events.ts");
    const serve = code("lib/ad-serve.ts");
    const counters = code("lib/ad-counters.ts");
    const adStats = code("lib/ad-stats.ts");
    const inRecordClick = events.split("export async function recordClick")[1] ?? "";

    check(
      "the edge country header is the primary source",
      /x-vercel-ip-country/.test(geo)
    );
    check(
      "unknown is an explicit stored value, not a null",
      /UNKNOWN_COUNTRY\s*=\s*"ZZ"/.test(geo)
    );
    check(
      "User.country is the FALLBACK, read only after the header",
      geo.indexOf("headerCountry()") > -1 &&
        geo.indexOf("const fromEdge") < geo.indexOf("user.findUnique"),
      "the profile is a weak source — 18 of 48 accounts have one, anonymous viewers none"
    );
    check(
      "both event paths resolve country through the shared resolver",
      /resolveEventCountry/.test(events) && /resolveEventCountry/.test(serve)
    );
    check(
      "the served-impression counter is given a country",
      /bufferImpression\([\s\S]{0,200}resolveEventCountry/.test(serve)
    );
    // Was: "the beacon impression path is given a country".
    //
    // That assertion described a world with TWO impression bases. The beacon was
    // the only server-side counter for IN_FEED, so it had to tag a country —
    // while the other 24 spaces counted at delivery. Counting on one basis
    // (delivery, in `serveAd`/`serveFeedAds`) is the fix; the beacon now writes
    // only the deduped `AdEngagement` row, so the thing to assert is that it
    // does NOT count, or every feed ad would be counted twice.
    check(
      "the beacon no longer counts — one impression basis, at delivery",
      !/bufferImpression\(/.test(events)
    );
    check(
      "recordClick resolves the country ONCE, above every branch",
      (inRecordClick.match(/resolveEventCountry/g) ?? []).length === 1,
      "resolving per-branch is how an impression and its click end up in different buckets"
    );
    check(
      "every rollup write in recordClick carries that country",
      (inRecordClick.match(/bumpAdDailyStat\(/g) ?? []).length === 4 &&
        (inRecordClick.match(/bumpAdDailyStat\([\s\S]{0,140}?country\s*\)/g) ?? [])
          .length === 4,
      "a bumpAdDailyStat call without it silently files the click under Unknown"
    );
    check(
      "the impression buffer keys on ad AND country",
      /KEY_SEP/.test(counters) && /\$\{adId\}\$\{KEY_SEP\}\$\{country/.test(counters)
    );
    check(
      "the per-ad total is re-derived from the per-country buckets",
      /perAd\.set\(adId, \(perAd\.get\(adId\) \?\? 0\) \+ count\)/.test(counters) &&
        /adCountryDailyStat\.upsert/.test(counters),
      "AdDailyStat and AdCountryDailyStat must come out of the same counts or the breakdown will not sum to the total"
    );
    check(
      "the click rollup writes the country row too",
      /export async function bumpAdCountryDailyStat/.test(adStats) &&
        /await bumpAdCountryDailyStat\(adId, country, inc\)/.test(adStats)
    );
    check(
      "the country rollup is NOT wrapped in a $transaction",
      !/\$transaction/.test(adStats),
      "Accelerate rejects a transaction over 15s (P6005), and this sits in front of a click bill"
    );
  }

  /* D2 — the country panel must not disagree with the panel beside it.
   *
   * `AdDailyStat.spendUsd` carries $1.95 of stale HOUSE self-billing that is not
   * revenue, and network (AdSense/GAM) revenue never reaches this database at
   * all. The rest of the ad report already gates spend on earning inventory; a
   * per-country panel that summed spend blind would sit on the same screen
   * reporting a different number for the same money.
   */
  console.log(
    "\nD2. The country breakdown uses the same revenue gate, and keeps its unknowns"
  );
  {
    const report = code("app/api/admin/ads/report/route.ts");
    const exp = code("app/api/admin/ads/report/export/route.ts");
    const ui = code("components/admin/ads/ad-manager-view.tsx");

    const gate = /!a\.campaign\?\.isHouse && !isNetworkType\(a\.type\)/;
    check("the report's country spend passes the house/network gate", gate.test(report));
    check("the CSV's country spend passes the same gate", gate.test(exp));
    check(
      "the country rollup is grouped by adId too, so the gate can be applied",
      /by: \["adId", "country"\]/.test(report) && /by: \["adId", "country"\]/.test(exp),
      "grouping by country alone makes the house/network gate impossible to apply"
    );
    check(
      "groupBy rows are re-shaped and cast (Accelerate collapses them to {})",
      /as unknown as/.test(report) && /as unknown as/.test(exp)
    );
    check(
      "the report honours the date range and the placement/campaign filters",
      /date: \{ gte: since \}/.test(report) &&
        /a\.placement\?\.id === placementId/.test(report) &&
        /a\.campaign\?\.id === campaignId/.test(report)
    );
    check(
      "the CSV honours the same filters, so it cannot disagree with the screen",
      /a\.placement\?\.id === placementId/.test(exp) &&
        /a\.campaign\?\.id === campaignId/.test(exp)
    );
    check(
      "the CSV exposes a country scope",
      /"country"/.test(exp) && /country_code/.test(exp) && /impression_share_pct/.test(exp)
    );
    check(
      "unknown traffic is a row, never dropped",
      /r\.country \|\| UNKNOWN_COUNTRY/.test(report) && /unknownShare/.test(report),
      "a country chart that drops unknowns reports certainty that does not exist"
    );
    check(
      "the unknown share is stated on screen",
      /unknownShare/.test(ui) && /unknownImpressions/.test(ui),
      "the share of untagged traffic is itself the finding"
    );
    check(
      "the admin can sort the breakdown",
      /countrySort/.test(report) && /countrySort/.test(ui)
    );

    /* The panel says how much of the window it actually describes.
     *
     * Every share in it is a share of the country table's OWN total, so they
     * add to 100% however little of the window carried a country — and
     * per-country recording started partway through this platform's life. On a
     * 90-day range the panel described 14.7% of the impressions while sitting
     * beside totals seven times larger, which is what "the report doesn't show
     * the right numbers" meant. The unknown-share sentence above did not cover
     * this: its denominator is the attributed total too. */
    check(
      "the API reports what fraction of the window carries a country",
      /const windowImpressions = stats\.reduce\(/.test(report) &&
        /attributedImpressions/.test(report) &&
        /coveragePct/.test(report),
      "without it the panel cannot tell a full window from a fifth of one"
    );
    check(
      "the window total is measured through the same filter as the panel",
      /inFilter\(adMap\.get\(s\.adId\)\) \? sum \+ s\.impressions : sum/.test(report),
      "comparing a filtered breakdown against an unfiltered total invents a gap"
    );
    check(
      "…and the screen states the coverage when it is short",
      /coverage\.coveragePct < 99/.test(ui) &&
        /covers\{" "\}/.test(ui),
      "a partial breakdown that looks complete is worse than no breakdown"
    );
    check(
      "a fully-covered window is not nagged about",
      /coveragePct !== null &&/.test(ui),
      "a banner on every range would be ignored by the time it mattered"
    );
  }

  /* D3 — the stored data itself. */
  console.log("\nD3. Recorded country data");
  try {
    const countryRows = (await prisma.adCountryDailyStat.groupBy({
      by: ["country"],
      _sum: { impressions: true, clicks: true },
    })) as unknown as Array<{
      country: string;
      _sum: { impressions: number | null; clicks: number | null };
    }>;
    const totalImpr = countryRows.reduce((t, r) => t + (r._sum.impressions ?? 0), 0);
    const unknownImpr =
      countryRows.find((r) => r.country === "ZZ")?._sum.impressions ?? 0;
    check(
      "no country row is stored with a blank or non-ISO code",
      countryRows.every((r) => /^[A-Z]{2}$/.test(r.country)),
      countryRows.map((r) => r.country).join(",") || "(no rows yet)"
    );
    console.log(
      `   ${countryRows.length} country bucket(s), ${totalImpr} impression(s); ` +
        `${totalImpr > 0 ? ((unknownImpr / totalImpr) * 100).toFixed(1) : "0.0"}% unknown`
    );
    if (totalImpr === 0) {
      console.log(
        "   (nothing tagged yet — the rollup starts the day it ships; history is not backfillable)"
      );
    }
  } catch (e) {
    // P2021 = the table is not there yet. Applying the migration to the live DB
    // is the owner'''s call, so a pending migration is a STATE, not a failure —
    // but it must be said out loud rather than passing quietly.
    const code2 = (e as { code?: string })?.code;
    if (code2 === "P2021") {
      console.log(
        "   SKIPPED — AdCountryDailyStat does not exist in this database yet." +
          " Apply it with: npx prisma migrate deploy"
      );
    } else {
      check("the country rollup table is readable", false, String(code2 ?? e));
    }
  }

  /* -- One impression basis, one canonical impression counter -------------- */
  //
  // Two defects lived here, both of them "the number is wrong but plausible":
  //
  //  1. IN_FEED counted on a different basis from every other space -- nothing
  //     server-side, only a client beacon deduped per (ad, viewer, minute),
  //     while the other 24 count at delivery with no dedup. In the same report
  //     table the feed therefore looked about an order of magnitude weaker for
  //     a reason that has nothing to do with performance.
  //  2. `Ad.impressions` (advertiser dashboard) and `AdDailyStat` (admin) had
  //     drifted 72 apart across 5 ads, in both directions.
  {
    const serve = code("lib/ad-serve.ts");
    const feedBlock = serve.slice(
      serve.indexOf("export async function serveFeedAds")
    );
    check(
      "serveFeedAds counts impressions server-side, like every other space",
      /bufferImpression\(/.test(feedBlock)
    );
    check(
      "serveFeedAds records fill data, like every other placement",
      /bufferServeOutcome\(/.test(feedBlock)
    );
    // If the beacon still incremented the counter, every feed ad would now be
    // counted twice -- once at delivery and once on render.
    check(
      "the client view beacon no longer increments the impression counter",
      !/bufferImpression\(/.test(code("lib/ad-events.ts"))
    );
  }
  {
    // `AdDailyStat` is canonical. Both surfaces must read it, or they go back to
    // quoting different impression totals for the same ad.
    for (const f of [
      "app/api/advertiser/campaigns/route.ts",
      "app/api/advertiser/campaigns/[id]/route.ts",
    ]) {
      const c = code(f);
      const short = f.split("/").slice(-2).join("/");
      check(
        `${short} reads impressions from AdDailyStat`,
        /lifetimeImpressionsByAd\(/.test(c)
      );
      check(
        `${short} no longer sums Ad.impressions`,
        !/\ba\.impressions\b|\bad\.impressions\b/.test(c)
      );
    }
  }
  {
    // The historic drift is REPORTED, not asserted away. It pre-dates the
    // buffered counter that now writes both in one transaction, and correcting a
    // billing-adjacent counter to make a number look tidy is how history stops
    // being history. If this ever starts growing, the two writes have come apart.
    try {
      const perAd = (await prisma.adDailyStat.groupBy({
        by: ["adId"],
        _sum: { impressions: true },
      })) as unknown as { adId: string; _sum: { impressions: number | null } }[];
      const allAds = (await prisma.ad.findMany({
        select: { id: true, impressions: true },
      })) as unknown as { id: string; impressions: number }[];
      const daily = new Map(perAd.map((r) => [r.adId, r._sum.impressions ?? 0]));
      const drifted = allAds
        .map((a) => ({ ad: a.impressions, day: daily.get(a.id) ?? 0 }))
        .filter((r) => r.ad !== r.day);
      const drift = drifted.reduce((t, r) => t + Math.abs(r.ad - r.day), 0);
      console.log(
        `   historic Ad.impressions vs AdDailyStat drift: ${drift} across ` +
          `${drifted.length} ad(s) - inert, nothing user-facing reads Ad.impressions`
      );
    } catch {
      console.log("   (drift check skipped - stats unreadable)");
    }
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
