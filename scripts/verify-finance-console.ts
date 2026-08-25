import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  amountIsUserValue,
  direction,
  isSettled,
  magnitudeUsd,
  signedUsd,
  sourceOf,
} from "../src/lib/finance/signing";
import { csvCell, toCsv } from "../src/lib/csv";

/**
 * Finance console verification.
 *
 * Almost all of this is about **truthfulness**, because a finance report that
 * is merely wrong is worse than one that is missing — the owner acts on it.
 *
 * The signing rules matter most. `Transaction` is a per-user wallet ledger whose
 * conventions drifted across ~48 write sites: `PURCHASE` is positive for
 * subscriptions and negative everywhere else, `ADMIN_FEE` is stored negative
 * while being income, `POINTS_CONVERSION` carries opposite meanings in its two
 * columns, and `EARNING` covers both platform cost and user-to-user proceeds.
 * Every one of the 18 types is asserted here, so a type added later with no rule
 * fails loudly rather than defaulting to zero.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-finance-console.ts
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
const code = (p: string) =>
  src(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const row = (
  type: string,
  amount = 10,
  reference: string | null = null,
  points = 0
) => ({ type, amount, points, reference, status: "COMPLETED" });

/** Every member of the enum — kept in sync with prisma/schema.prisma. */
const ALL_TYPES = [
  "EARNING",
  "WITHDRAWAL",
  "BONUS",
  "REFERRAL",
  "PURCHASE",
  "REFUND",
  "PENALTY",
  "GIFT",
  "LOTTERY_WIN",
  "CHECKIN",
  "COURSE_PURCHASE",
  "COURSE_TUTOR_EARNING",
  "COURSE_REFUND",
  "DEPOSIT",
  "AFFILIATE_COMMISSION",
  "ADMIN_FEE",
  "AD_CREDIT_PURCHASE",
  "POINTS_CONVERSION",
];

async function main() {
  console.log("\n=== Finance console ===\n");

  /* 1. Every type has a rule. */
  console.log("1. The enum is covered");
  {
    // The union in the schema, read from the file, so adding a member there
    // without a rule here is caught rather than silently bucketed as internal.
    const schema = fs.readFileSync(
      path.join(process.cwd(), "prisma", "schema.prisma"),
      "utf8"
    );
    const block = schema.slice(
      schema.indexOf("enum TransactionType {"),
      schema.indexOf("}", schema.indexOf("enum TransactionType {"))
    );
    const inSchema = block
      .split("\n")
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => /^[A-Z_]+$/.test(l));
    check(
      `the schema still has exactly the ${ALL_TYPES.length} types this script knows`,
      inSchema.length === ALL_TYPES.length &&
        inSchema.every((t) => ALL_TYPES.includes(t)),
      inSchema.filter((t) => !ALL_TYPES.includes(t)).join(", ") || String(inSchema.length)
    );
  }
  for (const t of ALL_TYPES) {
    const d = direction(row(t));
    check(`${t} classifies as ${d}`, ["cost", "revenue", "internal"].includes(d));
  }

  /* 2. The four traps. */
  console.log("\n2. The inconsistent conventions");
  check(
    "a subscription PURCHASE (stored positive) is revenue",
    direction(row("PURCHASE", 20, "subscription_abc")) === "revenue"
  );
  check(
    "a marketplace PURCHASE (stored negative) is NOT revenue — it is user-to-user",
    direction(row("PURCHASE", -20, "marketplace_abc")) === "internal"
  );
  check(
    "ADMIN_FEE is income even though it is stored negative",
    direction(row("ADMIN_FEE", -5)) === "revenue" &&
      signedUsd(row("ADMIN_FEE", -5)) === 5
  );
  check(
    "POINTS_CONVERSION moves no platform money (same money, new unit)",
    direction(row("POINTS_CONVERSION", 5, "convert_u_1", -5000)) === "internal" &&
      signedUsd(row("POINTS_CONVERSION", 5, "convert_u_1", -5000)) === 0
  );
  check(
    "a DEPOSIT is a liability, not revenue",
    direction(row("DEPOSIT", 50, "deposit_x")) === "internal"
  );
  check(
    "a WITHDRAWAL is not a platform cost — it is the user's own money leaving",
    direction(row("WITHDRAWAL", -50, "withdrawal_x")) === "internal"
  );
  check(
    "magnitude ignores the stored sign entirely",
    magnitudeUsd(row("PURCHASE", -20)) === 20 && magnitudeUsd(row("PURCHASE", 20)) === 20
  );

  /* 3. EARNING means two different things. */
  console.log("\n3. EARNING is split by reference");
  check(
    "a task credit is platform cost",
    direction(row("EARNING", 1, "task_abc_def")) === "cost" &&
      sourceOf(row("EARNING", 1, "task_abc_def")) === "task"
  );
  check(
    "a marketplace seller credit costs the platform nothing",
    direction(row("EARNING", 20, "marketplace_sale_1")) === "internal" &&
      sourceOf(row("EARNING", 20, "marketplace_sale_1")) === "marketplace"
  );
  check(
    "an escrow release is marketplace, not a task payout",
    sourceOf(row("EARNING", 20, "deal_release_1")) === "marketplace"
  );
  check(
    "a social credit is its own source",
    sourceOf(row("EARNING", 1, "social_ratio_1")) === "social"
  );

  /* 4. Check-in hides inside EARNING. */
  console.log("\n4. Check-ins");
  check(
    "an EARNING row with a daily_ reference is a check-in",
    sourceOf(row("EARNING", 0.1, "daily_2026-08-25")) === "checkin"
  );
  check(
    "and it still counts as platform cost",
    direction(row("EARNING", 0.1, "daily_2026-08-25")) === "cost"
  );
  {
    const live = await prisma.transaction.count({ where: { type: "CHECKIN" } });
    check(
      "the CHECKIN type itself is still written by nothing (so the rule above is load-bearing)",
      live === 0,
      `${live} rows`
    );
  }

  /* 5. Offerwall amount means the network's payout. */
  console.log("\n5. Offerwall");
  check(
    "an offerwall row's amount is NOT the user's value",
    !amountIsUserValue(row("EARNING", 0.4, "offerwall_tx1", 200))
  );
  check(
    "every other row's amount is",
    amountIsUserValue(row("EARNING", 1, "task_a_b"))
  );

  /* 6. Pending withdrawals. */
  console.log("\n6. Settlement");
  check(
    "a PENDING withdrawal is not settled movement",
    !isSettled({ ...row("WITHDRAWAL", -50, "withdrawal_1"), status: "PENDING" })
  );
  check(
    "a row with no status is treated as settled (the column defaults to COMPLETED)",
    isSettled({ type: "EARNING", amount: 1, points: 0, reference: null })
  );

  /* 7. Live aggregates. */
  console.log("\n7. Against the live database");
  const { getBalances, getObligations, getReconciliation } = await import(
    "../src/lib/finance/scope"
  );
  const balances = await getBalances();
  console.log(
    `   real users: ${balances.real.users} holding ${balances.real.walletLiabilityUsd.toFixed(2)}; ` +
      `all accounts: ${balances.all.users} holding ${balances.all.walletLiabilityUsd.toFixed(2)}`
  );
  check(
    "the real-user figure is not the all-accounts figure",
    balances.real.walletLiabilityUsd !== balances.all.walletLiabilityUsd,
    "if these ever match, the split has stopped working"
  );
  check(
    "staff-only is exactly the difference",
    Math.abs(
      balances.staffOnlyUsd -
        (balances.all.walletLiabilityUsd - balances.real.walletLiabilityUsd)
    ) < 0.0001
  );
  check(
    "real users are a subset of all accounts",
    balances.real.users <= balances.all.users &&
      balances.real.cashUsd <= balances.all.cashUsd
  );

  const obligations = await getObligations();
  check(
    "obligations are all finite, never NaN",
    Object.values(obligations).every((v) => Number.isFinite(v))
  );

  const recon = await getReconciliation();
  console.log(
    `   balances ${recon.balancesUsd.toFixed(2)} vs ledger ${recon.ledgerUsd.toFixed(2)} → ` +
      `difference ${recon.differenceUsd.toFixed(2)}`
  );
  check(
    "the reconciliation reports the gap rather than hiding it",
    Number.isFinite(recon.differenceUsd) &&
      recon.agrees === (Math.abs(recon.differenceUsd) < 0.01)
  );

  /* 8. Revenue streams. */
  console.log("\n8. Revenue");
  const { getRevenueBreakdown } = await import("../src/lib/finance/revenue");
  const rev = await getRevenueBreakdown();
  for (const s of rev.streams) {
    console.log(
      `   ${s.label.padEnd(26)} ${s.measured ? `$${s.usd.toFixed(2)}` : "no activity"} (${s.count})`
    );
  }
  check(
    "all eight streams are reported",
    rev.streams.length === 8,
    String(rev.streams.length)
  );
  check(
    "the total is the sum of its parts",
    Math.abs(rev.totalUsd - rev.streams.reduce((s, x) => s + x.usd, 0)) < 0.0001
  );
  check(
    "every figure is finite",
    rev.streams.every((s) => Number.isFinite(s.usd))
  );
  check(
    "a stream with no rows says so instead of reporting a measured $0.00",
    rev.streams.every((s) => s.count > 0 || s.measured === false)
  );
  check(
    "each stream names where its number came from",
    rev.streams.every((s) => s.from.length > 0)
  );
  {
    const s = code("lib/finance/revenue.ts");
    check(
      "the five previously-unaggregated streams are all read",
      /MarketplacePurchase|marketplacePurchase/.test(s) &&
        /adminFee/.test(s) &&
        /withdrawal\.aggregate/.test(s) &&
        /lotterySettlement/.test(s) &&
        /offerwallCallback/.test(s) &&
        /platformFeeUsd/.test(s)
    );
    check(
      "withdrawal fees count only completed payouts",
      /status: "COMPLETED"/.test(s)
    );
    check(
      "ad revenue excludes house campaigns",
      /isHouse: false/.test(s)
    );
  }

  /* 9. The course fee now has a column. */
  console.log("\n9. Course commission");
  {
    const cols = (await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'CourseEnrollment' AND column_name = 'platformFeeUsd'
    `) as unknown[];
    check("CourseEnrollment.platformFeeUsd exists in the database", cols.length === 1);
  }
  {
    const s = code("app/api/courses/[id]/enroll/route.ts");
    check(
      "an enrolment writes the fee onto the row, not only into metadata",
      /platformFeeUsd: fee,/.test(s)
    );
  }
  {
    const idx = (await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes WHERE indexname = 'Transaction_type_createdAt_idx'
    `) as unknown[];
    check("the per-type time-series index exists", idx.length === 1);
  }

  /* 10. Ledger aggregation. */
  console.log("\n10. Ledger totals");
  const { getLedgerTotals, getDailySeries } = await import(
    "../src/lib/finance/series"
  );
  const totals = await getLedgerTotals();
  console.log(
    `   ${totals.rows} settled rows across ${totals.sources.length} source(s); ` +
      `revenue $${totals.revenueUsd.toFixed(2)}, cost $${totals.costUsd.toFixed(2)}`
  );
  check(
    "net is revenue minus cost",
    Math.abs(totals.netUsd - (totals.revenueUsd - totals.costUsd)) < 0.0001
  );
  check(
    "empty source buckets are dropped, not shown as rows of zeros",
    totals.sources.every((s) => s.count > 0)
  );
  check(
    "every source carries a chart colour",
    totals.sources.every((s) => /^#[0-9a-f]{6}$/i.test(s.color))
  );
  const series = await getDailySeries();
  check("the daily series is zero-filled", series.length >= 28);
  check(
    "every point is finite",
    series.every(
      (d) =>
        Number.isFinite(d.revenue) &&
        Number.isFinite(d.cost) &&
        Number.isFinite(d.net)
    )
  );
  check(
    "each point's net is its own revenue minus cost",
    series.every((d) => Math.abs(d.net - (d.revenue - d.cost)) < 0.0001)
  );

  /* 11. CSV. */
  console.log("\n11. CSV");
  check("a comma is quoted", csvCell("Acme, Inc") === '"Acme, Inc"');
  check("a quote is doubled", csvCell('He said "hi"') === '"He said ""hi"""');
  check("a newline is quoted", csvCell("a\nb") === '"a\nb"');
  check("a carriage return is quoted", csvCell("a\rb") === '"a\rb"');
  check("a plain value is untouched", csvCell("plain") === "plain");
  check("null becomes empty, not the text null", csvCell(null) === "");
  check("zero survives as zero, not empty", csvCell(0) === "0");
  {
    const doc = toCsv(["a", "b"], [["x,y", 'q"q']]);
    check(
      "a whole document escapes and uses CRLF",
      doc === 'a,b\r\n"x,y","q""q"',
      JSON.stringify(doc)
    );
  }
  for (const route of [
    "app/api/admin/analytics/export/route.ts",
    "app/api/admin/users/export/route.ts",
    "app/api/admin/deposits/export/route.ts",
    "app/api/admin/referrals/export/route.ts",
    "app/api/admin/ads/report/export/route.ts",
  ]) {
    const s = code(route);
    check(
      `${route.split("/").slice(-3, -1).join("/")} uses the shared escaper`,
      /@\/lib\/csv/.test(s)
    );
  }
  {
    // The bug this replaced: rows built as raw template literals that wrapped
    // values in quotes without doubling the inner ones.
    const s = code("app/api/admin/analytics/export/route.ts");
    check(
      "no branch still hand-builds a quoted row",
      !/`"\$\{/.test(s)
    );
  }

  /* 12. Charts. */
  console.log("\n12. Charts");
  {
    const s = code("components/admin/charts/series-chart-inner.tsx");
    check(
      "gradient ids are per-instance, so two charts on a page cannot collide",
      /useId\(\)/.test(s) && /id=\{`fill-\$\{uid\}/.test(s)
    );
    check(
      "an all-zero series says so rather than drawing a flat line",
      /No activity in this range/.test(s)
    );
    check(
      "an all-zero donut says so rather than rendering an invisible ring",
      /emptyLabel/.test(s)
    );
  }
  {
    const s = code("components/admin/charts/index.tsx");
    check(
      "recharts is loaded lazily, as everywhere else in the admin",
      /ssr: false/.test(s)
    );
  }

  /* 13. The console itself. */
  console.log("\n13. The console");
  {
    const s = code("app/admin/finance/page.tsx");
    const raw = src("app/admin/finance/page.tsx");
    check(
      "it is gated on finance.view, not a new permission",
      /can\(session\.user\.id, "finance\.view"\)/.test(s)
    );
    check(
      "all four tabs exist",
      /"overview"/.test(s) &&
        /"sources"/.test(s) &&
        /"ledger"/.test(s) &&
        /"users"/.test(s)
    );
    check(
      "the range selector is server-side links, so figures cannot drift",
      /\/admin\/finance\?tab=/.test(s)
    );
    check(
      "both scopes are shown side by side rather than one silently chosen",
      /balances\.real\.walletLiabilityUsd/.test(s) &&
        /balances\.all\.walletLiabilityUsd/.test(s)
    );
    check("the reconciliation gap is surfaced", /recon\.differenceUsd/.test(s));
    check("the UTC-day convention is disclosed", /Days are UTC/.test(raw));
    check(
      "the invoice-details warning appears when the business details are blank",
      /billingIncomplete/.test(s) && /billing\.seller_name/.test(s)
    );
    check(
      "pending payouts are labelled as already deducted from balances",
      /already left wallets/.test(raw)
    );
  }
  {
    const s = code("app/api/admin/finance/ledger/route.ts");
    check("the ledger route is gated on finance.view", /"finance\.view"/.test(s));
    check(
      "it can export exactly what is on screen",
      /sp\.get\("format"\) === "csv"/.test(s) && /csvResponse\(/.test(s)
    );
    check(
      "it marks staff rows, so a staff-driven figure is visible in the list",
      /isStaff/.test(s)
    );
    check(
      "it reports whether the count is exact under a source filter",
      /totalIsExact/.test(s)
    );
  }
  {
    const s = code("components/admin/finance/ledger-tab.tsx");
    check(
      "a row opens a drilldown that shows how it was classified",
      /Counts as/.test(src("components/admin/finance/ledger-tab.tsx")) &&
        /ModalShell/.test(s)
    );
    check(
      "source colours come from the shared taxonomy, so admin and wallet agree",
      /SOURCE_META/.test(s)
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
