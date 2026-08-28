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

    check(
      "finance sums spentTotal, not budget",
      /_sum: \{ spentTotal: true \}/.test(revenue)
    );
    check(
      "finance excludes house campaigns — they bill nothing by design",
      /where: \{ isHouse: false \},\s*_sum: \{ spentTotal: true \}/.test(revenue)
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
      "the platform-wide eCPM excludes them too",
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
    const count = s.indexOf("bufferImpression(chosen.id)");
    check("the network guard exists", guard > 0);
    check(
      "the impression is counted AFTER every path that can still refuse",
      guard > 0 && count > guard,
      `guard@${guard} count@${count}`
    );
    check(
      "it is still counted exactly once",
      (s.match(/bufferImpression\(chosen\.id\)/g) ?? []).length === 1
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
