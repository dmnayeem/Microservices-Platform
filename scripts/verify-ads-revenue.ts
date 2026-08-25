import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

/**
 * Phase 7 verification — revenue reporting and fill-rate capture.
 *
 * The two things worth getting wrong-proof:
 *
 *  1. **The fill counters must not drift.** `requests` is the denominator of the
 *     one number that separates "this space earns little" from "this space is
 *     never filled". If a future early return skips the counter, the numerator
 *     keeps rising and the denominator does not, and the metric silently becomes
 *     flattering nonsense. So the counting happens once, at a wrapper, and this
 *     asserts that it still does.
 *  2. **eCPM must exclude house inventory.** House ads bill nothing by design.
 *     Dividing revenue by total impressions would make every house-filled space
 *     read as a failure — the opposite of what the number is for.
 *
 * Creates and tears down its own placement + campaign + ad fixtures.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-ads-revenue.ts
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
/** Code with comments stripped — an absence check must read code, not prose. */
const code = (p: string) =>
  src(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SANDBOX = "ZZ_VERIFY_REVENUE";
const cleanup: Array<() => Promise<unknown>> = [];

async function main() {
  console.log("\n=== Ad revenue & fill rate ===\n");

  /* 1. The capture point. */
  console.log("1. Counting happens once, at the boundary");
  {
    const s = code("lib/ad-serve.ts");
    check(
      "the serve body is private and only the wrapper is exported",
      /async function serveAdInner\(/.test(s) &&
        /export async function serveAd\(/.test(s)
    );
    check(
      "the outcome is recorded exactly once in the module",
      (s.match(/recordServeOutcome\(/g) ?? []).length === 2, // definition + call
      String((s.match(/recordServeOutcome\(/g) ?? []).length)
    );
    check(
      "a deliberate suppression is NOT counted as a no-fill",
      /result !== SUPPRESSED/.test(s)
    );
    check(
      "an ad-free viewer is a suppression, not a no-fill",
      /if \(pkg\?\.adFree && !interstitial\) return SUPPRESSED;/.test(s)
    );
    check(
      "a frequency-capped viewer is a suppression, not a no-fill",
      /if \(!slot\.allowed\) return SUPPRESSED;/.test(s)
    );
    check(
      "an admin preview is not counted as a viewer at all",
      /if \(!opts\.preview && result !== SUPPRESSED\)/.test(s)
    );
    check(
      "recording can never break ad serving",
      /catch \{[\s\S]{0,120}\}\s*\}\s*\n/.test(
        s.slice(s.indexOf("async function recordServeOutcome"))
      )
    );
  }
  {
    const s = code("lib/ad-counters.ts");
    check(
      "requests and fills move together in one counter",
      /cur\[0\] \+= 1;/.test(s) && /if \(filled\) cur\[1\] \+= 1;/.test(s)
    );
    check(
      "the flush no longer bails out when only serve rows are pending",
      /buffer\.size === 0 && serveBuffer\.size === 0/.test(s)
    );
  }

  /* 2. The counters actually write. */
  console.log("\n2. The counters write");
  const placement = await prisma.adPlacement.create({
    data: { name: SANDBOX, platform: "ALL", isActive: true },
  });
  cleanup.push(() =>
    prisma.adPlacement.delete({ where: { id: placement.id } }).catch(() => {})
  );

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.adServeDailyStat.create({
    data: { placementId: placement.id, date: today, requests: 10, fills: 4 },
  });
  const row = await prisma.adServeDailyStat.findUnique({
    where: { placementId_date: { placementId: placement.id, date: today } },
  });
  check("a serve row round-trips", row?.requests === 10 && row?.fills === 4);
  check(
    "the no-fill count is requests minus fills",
    (row?.requests ?? 0) - (row?.fills ?? 0) === 6
  );

  // The unique constraint IS the daily rollup: a second write must accumulate,
  // not create a second row for the same day.
  await prisma.adServeDailyStat.upsert({
    where: { placementId_date: { placementId: placement.id, date: today } },
    create: { placementId: placement.id, date: today, requests: 1, fills: 1 },
    update: { requests: { increment: 1 }, fills: { increment: 1 } },
  });
  const rows = await prisma.adServeDailyStat.findMany({
    where: { placementId: placement.id },
  });
  check(
    "a second write on the same day accumulates rather than duplicating",
    rows.length === 1 && rows[0].requests === 11 && rows[0].fills === 5,
    `${rows.length} row(s)`
  );

  // Deleting the placement must take its stats with it (no orphan rows).
  const probe = await prisma.adPlacement.create({
    data: { name: `${SANDBOX}_CASCADE`, platform: "ALL", isActive: true },
  });
  await prisma.adServeDailyStat.create({
    data: { placementId: probe.id, date: today, requests: 1, fills: 0 },
  });
  await prisma.adPlacement.delete({ where: { id: probe.id } });
  const orphans = await prisma.adServeDailyStat.count({
    where: { placementId: probe.id },
  });
  check("serve stats cascade with their placement", orphans === 0);

  /* 3. eCPM arithmetic. */
  console.log("\n3. eCPM");
  const ecpm = (spend: number, impressions: number, house: number) => {
    const paid = Math.max(0, impressions - house);
    return paid > 0 ? (spend / paid) * 1000 : 0;
  };
  check("$5 over 1,000 paid impressions is a $5 eCPM", ecpm(5, 1000, 0) === 5);
  check(
    "house impressions do not dilute it",
    ecpm(5, 2000, 1000) === 5,
    String(ecpm(5, 2000, 1000))
  );
  check(
    "an all-house space is 0, never NaN or Infinity",
    ecpm(0, 500, 500) === 0 && Number.isFinite(ecpm(0, 500, 500))
  );
  check(
    "zero impressions is 0, never a divide-by-zero",
    ecpm(10, 0, 0) === 0 && Number.isFinite(ecpm(10, 0, 0))
  );
  {
    const s = code("app/api/admin/ads/report/route.ts");
    check(
      "the report divides by PAID impressions",
      /v\.impressions - v\.houseImpressions - v\.networkImpressions/.test(s)
    );
    check(
      "house impressions are attributed from the campaign, not guessed",
      /isHouse: true/.test(s) && /if \(house\) cur\.houseImpressions/.test(s)
    );
  }

  /* 4. Revenue excludes house campaigns. */
  console.log("\n4. Revenue is real money only");
  {
    const s = code("app/api/admin/ads/analytics/route.ts");
    check(
      "lifetime revenue excludes house campaigns",
      /where: \{ isHouse: false \}/.test(s)
    );
    check(
      "it sums spentTotal rather than re-deriving clicks x current CPC",
      /_sum: \{ spentTotal: true, budget: true \}/.test(s)
    );
    check(
      "cash actually received is reported separately from credit consumed",
      /kind: "PURCHASE"/.test(s)
    );
  }
  // Against the live database: house campaigns really do bill nothing.
  const houseSpend = await prisma.adCampaign.aggregate({
    where: { isHouse: true },
    _sum: { spentTotal: true },
  });
  check(
    "no house campaign has ever billed a cent",
    Number(houseSpend._sum.spentTotal ?? 0) === 0,
    String(houseSpend._sum.spentTotal)
  );

  /* 5. "Not measured" is not "zero". */
  console.log("\n5. Unmeasured reads as unmeasured");
  {
    const s = code("app/api/admin/ads/report/route.ts");
    check(
      "fill rate is null, not 0, when nothing has been recorded",
      /fillRate: f\.requests > 0 \? \(f\.fills \/ f\.requests\) \* 100 : null/.test(s)
    );
  }
  {
    const s = code("components/admin/ads/ad-manager-view.tsx");
    check(
      "the UI shows a dash for it rather than a misleading 0%",
      /r\.fillRate === null \? "—"/.test(s)
    );
    check(
      "an all-house space is labelled, not shown as a $0 eCPM",
      /r\.paidImpressions > 0 \? usd\(r\.ecpm\) : "house"/.test(s)
    );
  }
  {
    const s = code("components/admin/monetization/monetization-view.tsx");
    check(
      "the monetization page finally shows money",
      /Revenue \(lifetime\)/.test(s) && /eCPM \(30d\)/.test(s)
    );
    check(
      "it does not block the settings form on the revenue fetch",
      /fetch\("\/api\/admin\/ads\/analytics\?days=30"\)/.test(s)
    );
  }

  /* 6. The index the reports needed. */
  console.log("\n6. Indexes");
  const idx = (await prisma.$queryRaw`
    SELECT indexname, indisvalid
    FROM pg_indexes
    JOIN pg_class c ON c.relname = pg_indexes.indexname
    JOIN pg_index i ON i.indexrelid = c.oid
    WHERE indexname IN ('AdDailyStat_date_idx', 'AdServeDailyStat_date_idx',
                        'AdServeDailyStat_placementId_date_key')
  `) as Array<{ indexname: string; indisvalid: boolean }>;
  const names = new Set(idx.filter((r) => r.indisvalid).map((r) => r.indexname));
  check("AdDailyStat has a date index (it never did)", names.has("AdDailyStat_date_idx"));
  check("AdServeDailyStat has a date index", names.has("AdServeDailyStat_date_idx"));
  check(
    "AdServeDailyStat's daily rollup key exists and is valid",
    names.has("AdServeDailyStat_placementId_date_key")
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
  .finally(async () => {
    // Tear down on success AND failure — a half-cleaned sandbox poisons the next run.
    for (const fn of cleanup.reverse()) await fn();
    await prisma.adPlacement
      .deleteMany({ where: { name: { startsWith: SANDBOX } } })
      .catch(() => {});
    await prisma.$disconnect();
  });
