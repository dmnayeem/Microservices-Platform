import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownToLine,
  Banknote,
  Coins,
  CreditCard,
  Download,
  GitBranch,
  GraduationCap,
  Landmark,
  Megaphone,
  Scale,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { usd, pts } from "@/lib/utils";
import { toNum } from "@/lib/money";
import { getSetting } from "@/lib/system-settings";
import { StatCard } from "@/components/admin/stat-card";
import { SeriesChart, DonutChart } from "@/components/admin/charts";
import { LedgerTab } from "@/components/admin/finance/ledger-tab";
import {
  getBalances,
  getObligations,
  getReconciliation,
} from "@/lib/finance/scope";
import { getRevenueBreakdown } from "@/lib/finance/revenue";
import { getDailySeries, getLedgerTotals } from "@/lib/finance/series";

export const revalidate = 60;

/**
 * The finance console.
 *
 * Replaces a page that had no charts, no date range, no drilldown and no export
 * — every figure was a scalar or an all-time table — and whose headline
 * liability was wrong by three orders of magnitude because it counted seeded
 * staff balances as money owed to users.
 *
 * Four tabs behind `?tab=`, and a `?range=` window, both plain server-side links
 * so the whole thing stays a server component and the numbers cannot drift
 * between a client cache and the database.
 */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "sources", label: "Sources" },
  { id: "ledger", label: "Ledger" },
  { id: "users", label: "Users" },
] as const;

const RANGES = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "12m", label: "12 months", days: 365 },
  { id: "all", label: "All time", days: null },
] as const;

function rangeOf(id: string) {
  return RANGES.find((r) => r.id === id) ?? RANGES[1];
}

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; range?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session.user.id, "finance.view"))) redirect("/admin");

  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab)?.id ?? "overview";
  const range = rangeOf(sp.range ?? "30d");
  const from = range.days
    ? (() => {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - (range.days - 1));
        return d;
      })()
    : undefined;

  const [balances, obligations, recon, revenue, totals, series, sellerName, taxId] =
    await Promise.all([
      getBalances(),
      getObligations(),
      getReconciliation(),
      getRevenueBreakdown({ from }),
      getLedgerTotals({ from }),
      getDailySeries({ from }),
      getSetting<string>("billing.seller_name", ""),
      getSetting<string>("billing.tax_id", ""),
    ]);

  const billingIncomplete = !String(sellerName || "").trim() || !String(taxId || "").trim();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Landmark className="w-6 h-6 text-emerald-400" />
            Finance
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Every money flow on the platform. Days are UTC.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
          {RANGES.map((r) => (
            <Link
              key={r.id}
              href={`/admin/finance?tab=${tab}&range=${r.id}`}
              className={`px-3 py-1.5 text-xs font-semibold ${
                range.id === r.id
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      {/* The owner asked for this: an invoice goes out with a blank header until
          the business details are filled in. Warns, never blocks. */}
      {billingIncomplete && (
        <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-200/90">
            <b>Invoice details are incomplete.</b> Your business name and
            VAT/BIN number are not set, so every invoice and receipt you send
            goes out with a blank header. Fill them in under{" "}
            <Link href="/admin/monetization" className="underline font-semibold">
              Monetization → Invoice details
            </Link>
            .
          </p>
        </div>
      )}

      <nav className="flex gap-1 border-b border-slate-800">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/finance?tab=${t.id}&range=${range.id}`}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
              tab === t.id
                ? "text-white border-emerald-500"
                : "text-slate-500 border-transparent hover:text-slate-300"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <OverviewTab
          revenue={revenue}
          totals={totals}
          series={series}
          balances={balances}
          obligations={obligations}
          rangeLabel={range.label}
        />
      )}

      {tab === "sources" && (
        <SourcesTab revenue={revenue} totals={totals} rangeLabel={range.label} />
      )}

      {tab === "ledger" && <LedgerTab days={range.days} />}

      {tab === "users" && (
        <UsersTab balances={balances} recon={recon} obligations={obligations} />
      )}
    </div>
  );
}

/* ── Overview ───────────────────────────────────────────────────────────── */

function OverviewTab({
  revenue,
  totals,
  series,
  balances,
  obligations,
  rangeLabel,
}: {
  revenue: Awaited<ReturnType<typeof getRevenueBreakdown>>;
  totals: Awaited<ReturnType<typeof getLedgerTotals>>;
  series: Awaited<ReturnType<typeof getDailySeries>>;
  balances: Awaited<ReturnType<typeof getBalances>>;
  obligations: Awaited<ReturnType<typeof getObligations>>;
  rangeLabel: string;
}) {
  const net = revenue.totalUsd - totals.costUsd;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Revenue"
          value={usd(revenue.totalUsd)}
          subtext={`${rangeLabel} · fees, ads, subscriptions`}
          icon={TrendingUp}
          tone="green"
        />
        <StatCard
          title="Paid to users"
          value={usd(totals.costUsd)}
          subtext={`${rangeLabel} · tasks, bonuses, referrals`}
          icon={TrendingDown}
          tone="red"
        />
        <StatCard
          title="Net"
          value={usd(net)}
          subtext={net >= 0 ? "revenue exceeds payouts" : "payouts exceed revenue"}
          icon={Scale}
          tone={net >= 0 ? "green" : "amber"}
        />
        <StatCard
          title="Owed to users"
          value={usd(balances.real.walletLiabilityUsd)}
          subtext={`real users · all accounts ${usd(balances.all.walletLiabilityUsd)}`}
          icon={Wallet}
          tone="purple"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Pending payouts"
          value={usd(obligations.pendingPayoutsUsd)}
          subtext={`${obligations.pendingPayoutsCount} withdrawal(s) — cash already left wallets`}
          icon={ArrowDownToLine}
          tone="amber"
          href="/admin/withdrawals"
        />
        <StatCard
          title="Escrow held"
          value={usd(obligations.escrowHeldUsd)}
          subtext={`${obligations.escrowCount} open deal(s)`}
          icon={Coins}
          tone="indigo"
        />
        <StatCard
          title="Ad budget unspent"
          value={usd(obligations.adBudgetUnspentUsd)}
          subtext="funded, not yet delivered"
          icon={Megaphone}
          tone="blue"
          href="/admin/ads"
        />
        <StatCard
          title="Pending deposits"
          value={usd(obligations.pendingDepositsUsd)}
          subtext={`${obligations.pendingDepositsCount} awaiting approval`}
          icon={Banknote}
          tone="slate"
          href="/admin/deposits"
        />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold text-white">
            Money in vs money out
          </p>
          <p className="text-[11px] text-slate-500">
            Days are UTC (00:00–24:00 UTC), not your local day.
          </p>
        </div>
        <SeriesChart
          data={series as unknown as Array<Record<string, string | number>>}
          xKey="date"
          kind="bar"
          money
          height={240}
          series={[
            { key: "revenue", label: "Revenue", color: "#10b981" },
            { key: "cost", label: "Paid to users", color: "#ef4444" },
          ]}
          emptyLabel="No settled money movement in this range."
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm font-semibold text-white mb-2">Revenue by stream</p>
          <DonutChart
            money
            height={240}
            data={revenue.streams
              .filter((s) => s.usd > 0)
              .map((s, i) => ({
                name: s.label,
                value: s.usd,
                color: [
                  "#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b",
                  "#f43f5e", "#06b6d4", "#a855f7", "#22c55e",
                ][i % 8],
              }))}
            emptyLabel="No revenue recorded in this range yet."
          />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm font-semibold text-white mb-2">
            Where money moved
          </p>
          <DonutChart
            money
            height={240}
            data={totals.sources
              .filter((s) => s.costUsd + s.revenueUsd + s.internalUsd > 0)
              .map((s) => ({
                name: s.label,
                value: s.costUsd + s.revenueUsd + s.internalUsd,
                color: s.color,
              }))}
            emptyLabel="No ledger activity in this range."
          />
        </div>
      </div>
    </div>
  );
}

/* ── Sources ────────────────────────────────────────────────────────────── */

function SourcesTab({
  revenue,
  totals,
  rangeLabel,
}: {
  revenue: Awaited<ReturnType<typeof getRevenueBreakdown>>;
  totals: Awaited<ReturnType<typeof getLedgerTotals>>;
  rangeLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
          <p className="text-sm font-semibold text-white">
            What the platform earns
          </p>
          <p className="text-[11px] text-slate-500">{rangeLabel}</p>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left pb-2">Stream</th>
                <th className="text-right pb-2">Amount</th>
                <th className="text-right pb-2">Rows</th>
                <th className="text-left pb-2 pl-4">Read from</th>
              </tr>
            </thead>
            <tbody>
              {revenue.streams.map((s) => (
                <tr key={s.key} className="border-t border-slate-800">
                  <td className="py-2 text-white">
                    {s.label}
                    {s.note && (
                      <span className="block text-[10px] text-slate-500">{s.note}</span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums font-semibold text-emerald-400">
                    {/* "Nothing has happened" and "it happened and came to zero"
                        are different statements, and a finance admin needs to
                        tell them apart. */}
                    {s.measured ? usd(s.usd) : <span className="text-slate-600">no activity</span>}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-400">
                    {s.count || "—"}
                  </td>
                  <td className="py-2 pl-4 text-[10px] text-slate-600 font-mono">
                    {s.from}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-700">
                <td className="py-2 font-bold text-white">Total</td>
                <td className="py-2 text-right tabular-nums font-bold text-emerald-400">
                  {usd(revenue.totalUsd)}
                </td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm font-semibold text-white mb-3">
          Ledger movement by source
        </p>
        {totals.sources.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            No ledger activity in this range.
          </p>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left pb-2">Source</th>
                  <th className="text-right pb-2">In</th>
                  <th className="text-right pb-2">Out</th>
                  <th className="text-right pb-2">Between users</th>
                  <th className="text-right pb-2">Points</th>
                  <th className="text-right pb-2">Rows</th>
                </tr>
              </thead>
              <tbody>
                {totals.sources.map((s) => (
                  <tr key={s.key} className="border-t border-slate-800">
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1.5 text-white">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        {s.label}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-emerald-400">
                      {s.revenueUsd ? usd(s.revenueUsd) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-red-400">
                      {s.costUsd ? usd(s.costUsd) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-500">
                      {s.internalUsd ? usd(s.internalUsd) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-400">
                      {s.points ? pts(s.points) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-400">
                      {s.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-slate-500 mt-3">
          <b>Between users</b> is money that moved without touching the
          platform&apos;s own position — a buyer paying a seller, or points
          converted to cash. Counting it as either income or cost would double
          every marketplace sale.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm font-semibold text-white mb-2">Drill into a domain</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Withdrawals", href: "/admin/withdrawals", icon: Wallet },
            { label: "Deposits", href: "/admin/deposits", icon: Banknote },
            { label: "Packages", href: "/admin/packages", icon: CreditCard },
            { label: "Referrals", href: "/admin/referrals", icon: GitBranch },
            { label: "Courses", href: "/admin/courses", icon: GraduationCap },
            { label: "Marketplace", href: "/admin/marketplace", icon: ShoppingCart },
            { label: "Ad Manager", href: "/admin/ads", icon: Megaphone },
            { label: "Deposits CSV", href: "/api/admin/deposits/export?status=all", icon: Download },
          ].map((r) => (
            <Link
              key={r.label}
              href={r.href}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-800 hover:border-slate-600 text-xs text-slate-300 hover:text-white"
            >
              <r.icon className="w-4 h-4 shrink-0 text-slate-400" />
              <span className="truncate">{r.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Users ──────────────────────────────────────────────────────────────── */

async function UsersTab({
  balances,
  recon,
  obligations,
}: {
  balances: Awaited<ReturnType<typeof getBalances>>;
  recon: Awaited<ReturnType<typeof getReconciliation>>;
  obligations: Awaited<ReturnType<typeof getObligations>>;
}) {
  const topEarners = await prisma.user.findMany({
    where: { role: "USER" },
    orderBy: { totalEarnings: "desc" },
    take: 10,
    select: {
      id: true,
      name: true,
      email: true,
      totalEarnings: true,
      cashBalance: true,
      pointsBalance: true,
    },
  });

  const row = (
    label: string,
    real: string,
    all: string,
    hint?: string
  ) => (
    <tr className="border-t border-slate-800">
      <td className="py-2 text-slate-300">
        {label}
        {hint && <span className="block text-[10px] text-slate-600">{hint}</span>}
      </td>
      <td className="py-2 text-right tabular-nums text-white font-semibold">{real}</td>
      <td className="py-2 text-right tabular-nums text-slate-500">{all}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm font-semibold text-white mb-1">Balances</p>
        <p className="text-[11px] text-slate-500 mb-3">
          Staff and seeded fixture accounts hold{" "}
          <b className="text-slate-300">{usd(balances.staffOnlyUsd)}</b> that
          nobody will ever withdraw. Both figures are shown so the headline is
          never quietly inflated by them.
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left pb-2" />
              <th className="text-right pb-2">Real users</th>
              <th className="text-right pb-2">All accounts</th>
            </tr>
          </thead>
          <tbody>
            {row("Accounts", String(balances.real.users), String(balances.all.users))}
            {row("Cash", usd(balances.real.cashUsd), usd(balances.all.cashUsd))}
            {row(
              "Points",
              pts(balances.real.points),
              pts(balances.all.points),
              `${usd(balances.real.pointsUsd)} at ${balances.pointsPerUsd.toLocaleString()} points per USD`
            )}
            {row(
              "Ad credit",
              usd(balances.real.adCreditUsd),
              usd(balances.all.adCreditUsd),
              "non-withdrawable, so not part of the liability below"
            )}
            {row(
              "Wallet liability",
              usd(balances.real.walletLiabilityUsd),
              usd(balances.all.walletLiabilityUsd),
              "cash plus points at the current rate"
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm font-semibold text-white mb-1">Reconciliation</p>
        <p className="text-[11px] text-slate-500 mb-3">
          Do the wallet balances agree with the ledger that should explain them?
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { label: "Sum of cash balances", value: usd(recon.balancesUsd) },
            { label: "Sum of ledger amounts", value: usd(recon.ledgerUsd) },
            {
              label: "Unexplained",
              value: usd(recon.differenceUsd),
              tone: recon.agrees ? "text-emerald-400" : "text-amber-400",
            },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                {c.label}
              </p>
              <p className={`text-xl font-extrabold tabular-nums mt-0.5 ${c.tone ?? "text-white"}`}>
                {c.value}
              </p>
            </div>
          ))}
        </div>
        {!recon.agrees && (
          <p className="text-[11px] text-amber-200/80 mt-3">
            These do not agree. Most of the gap is balance that was written
            straight onto user rows when the database was seeded, with no ledger
            entry behind it — which is also why the staff figures above are so
            large. It is shown rather than hidden because the disagreement is
            itself the finding.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-slate-400" />
          <p className="text-sm font-semibold text-white">
            Top earners (real users)
          </p>
        </div>
        {topEarners.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No users yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="text-left pb-2">User</th>
                <th className="text-right pb-2">Earned (lifetime)</th>
                <th className="text-right pb-2">Cash</th>
                <th className="text-right pb-2">Points</th>
              </tr>
            </thead>
            <tbody>
              {topEarners.map((u) => (
                <tr key={u.id} className="border-t border-slate-800">
                  <td className="py-2 text-slate-300 truncate max-w-52">
                    {u.name || u.email}
                  </td>
                  <td className="py-2 text-right tabular-nums text-white">
                    {usd(toNum(u.totalEarnings))}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-400">
                    {usd(toNum(u.cashBalance))}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-400">
                    {pts(u.pointsBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[10px] text-slate-600 mt-3">
          Pending payouts of {usd(obligations.pendingPayoutsUsd)} have already
          been deducted from these balances — the cash leaves the wallet when a
          withdrawal is requested, not when it is paid.
        </p>
      </div>
    </div>
  );
}
