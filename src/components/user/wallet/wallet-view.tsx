"use client";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "@/lib/toast";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import {
  Wallet,
  Users,
  ArrowUpRight,
  Plus,
  Lock,
  Sparkles,
  TrendingUp,
  Coins,
  Trophy,
  Gift,
  Send,
  Banknote,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRightLeft,
  Loader2,
  Calendar,
} from "lucide-react";
import { BalanceCard } from "@/components/user/primitives/balance-card";
import { StatCard } from "@/components/user/primitives/stat-card";
import { TransactionRow } from "@/components/user/primitives/transaction-row";
import { TransactionHistory } from "@/components/user/wallet/transaction-history";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { deriveSource } from "@/lib/tx-sources";
import { History } from "lucide-react";
import { cn, usd } from "@/lib/utils";
import { runInterstitial } from "@/lib/reward-interstitial";

export interface WalletTransaction {
  id: string;
  type: string;
  status: string;
  points: number;
  amount: number;
  description: string | null;
  reference?: string | null;
  createdAt: string;
}

export interface ReferralStats {
  l1Count: number;
  l2Count: number;
  l3Count: number;
  l1Earned: number;
  l2Earned: number;
  l3Earned: number;
  totalEarned: number;
}

export interface WalletDeposit {
  id: string;
  amount: number;
  method: string;
  status: string;
  txnId: string | null;
  createdAt: string;
}

export interface WalletViewProps {
  pointsBalance: number;
  cashBalance: number;
  /** Non-withdrawable ad credit (USD). */
  adCreditBalance?: number;
  totalEarnings: number;
  totalWithdrawn: number;
  /** Withdrawn this month (USD). */
  monthlyIncome?: number;
  /** Referral earnings credited today (USD). */
  todayReferralBonus?: number;
  packageTier: string;
  transactions: WalletTransaction[];
  deposits?: WalletDeposit[];
  referralStats: ReferralStats;
  pendingWithdrawals: number;
  /** Admin-configurable points-per-$1 rate (default 1000). */
  /** Points per USD (admin setting) — required, see BalanceCard. */
  pointsPerUsd: number;
  /** Min points before the convert-to-cash option unlocks. */
  convertThreshold?: number;
  /** Effective withdrawal fee % (admin setting minus package discount). */
  withdrawalFeePct?: number;
}

type Tab = "balance" | "history" | "deposits" | "referral" | "withdraw";

export function WalletView(props: WalletViewProps) {
  // Honor ?tab= deep-links (the withdrawal page links to ?tab=transactions).
  //
  // Read with `useSearchParams`, which is SSR-safe, so the tab is correct on the
  // FIRST render. This used to read `window.location.search` inside an effect —
  // the page painted the Balance tab, then swapped to the requested one a frame
  // later, which is a visible flash and an extra render of the whole view. The
  // effect existed to dodge a hydration mismatch; the hook removes the need for
  // both.
  const searchParams = useSearchParams();
  const requestedTab = ((): Tab => {
    const t = searchParams.get("tab");
    if (t === "transactions" || t === "history") return "history";
    if (t === "deposits" || t === "referral" || t === "withdraw") return t;
    return "balance";
  })();
  const [tab, setTab] = useState<Tab>(requestedTab);

  const isFreeTier = props.packageTier === "FREE";
  const pointsPerUsd = props.pointsPerUsd;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Wallet className="w-6 h-6 text-indigo-400" />
          Wallet
        </h1>
        <p className="text-gray-400 text-sm mt-0.5">
          Your earnings, referral commission, and payouts.
        </p>
      </header>

      <AdRenderer placement="WALLET_TOP" />

      <BalanceCard
        points={props.pointsBalance}
        cash={props.cashBalance}
        adCredit={props.adCreditBalance}
        packageTier={props.packageTier}
        pointsPerUsd={pointsPerUsd}
      />

      <ConvertCard
        points={props.pointsBalance}
        threshold={props.convertThreshold ?? 10000}
        pointsPerUsd={pointsPerUsd}
      />

      <div className="flex gap-2">
        <Link
          href="/deposit"
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold"
        >
          <Plus className="w-4 h-4" />
          Add funds
        </Link>
        <Link
          href="/withdrawal"
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-bold"
        >
          <ArrowUpRight className="w-4 h-4" />
          Withdraw
        </Link>
      </div>

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-gray-800 overflow-x-auto scrollbar-none">
        {(
          [
            { key: "balance", label: "Balance", icon: Coins },
            { key: "history", label: "History", icon: History },
            { key: "deposits", label: "Deposits", icon: Banknote },
            { key: "referral", label: "Referral", icon: Users },
            { key: "withdraw", label: "Withdraw", icon: ArrowUpRight },
          ] as const
        ).map((t) => {
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
                isActive
                  ? "text-white border-indigo-500"
                  : "text-gray-500 border-transparent hover:text-white"
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "balance" && (
        <BalanceTab
          totalEarnings={props.totalEarnings}
          totalWithdrawn={props.totalWithdrawn}
          monthlyIncome={props.monthlyIncome}
          todayReferralBonus={props.todayReferralBonus}
          transactions={props.transactions}
        />
      )}

      {tab === "history" && <TransactionHistory />}

      {tab === "deposits" && (
        <DepositsTab deposits={props.deposits ?? []} />
      )}

      {tab === "referral" && (
        <ReferralTab stats={props.referralStats} />
      )}

      {tab === "withdraw" && (
        <WithdrawTab
          isFreeTier={isFreeTier}
          cashBalance={props.cashBalance}
          points={props.pointsBalance}
          convertThreshold={props.convertThreshold ?? 10000}
          pendingWithdrawals={props.pendingWithdrawals}
          packageTier={props.packageTier}
          feePct={props.withdrawalFeePct ?? 0}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Convert points → cash
// ─────────────────────────────────────────────────────────────────────────────

function ConvertCard({
  points,
  threshold,
  pointsPerUsd,
}: {
  points: number;
  threshold: number;
  pointsPerUsd: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Amount of points the user chooses to convert (defaults to the whole balance).
  const [amountStr, setAmountStr] = useState<string>(String(points));
  const canConvert = points >= threshold;
  const pct = Math.min(100, threshold > 0 ? (points / threshold) * 100 : 0);
  const remaining = Math.max(0, threshold - points);
  const minConvert = Math.max(1, Math.ceil(pointsPerUsd)); // ≥ $1 worth

  const amount = Math.min(points, Math.max(0, Math.floor(Number(amountStr) || 0)));
  const previewUsd = amount / pointsPerUsd;
  const amountValid = canConvert && amount >= minConvert && amount <= points;

  if (points <= 0) return null;

  const onAmountChange = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
    setAmountStr(digits);
  };

  const convert = async () => {
    if (!amountValid || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/wallet/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ points: amount }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      await runInterstitial();
      toast.success(d.message ?? "Points converted to cash");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't convert", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-sky-500/25 bg-linear-to-br from-sky-500/10 to-indigo-500/5 p-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-white flex items-center gap-1.5">
          <ArrowRightLeft className="w-4 h-4 text-sky-400 shrink-0" />
          Convert points to cash
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {canConvert
            ? "Choose how many points to move into withdrawable cash."
            : `Earn ${remaining.toLocaleString()} more points to unlock — converting opens at ${threshold.toLocaleString()} pts.`}
        </p>
      </div>

      {canConvert ? (
        <>
          <div className="mt-3 flex items-stretch gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                inputMode="numeric"
                value={amountStr}
                onChange={(e) => onAmountChange(e.target.value)}
                placeholder={String(minConvert)}
                className="w-full pl-3 pr-14 py-2 bg-gray-950 border border-gray-800 rounded-lg text-white text-sm font-bold tabular-nums focus:outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={() => setAmountStr(String(points))}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md bg-gray-800 text-[10px] font-bold text-sky-300 hover:bg-gray-700"
              >
                MAX
              </button>
            </div>
            <button
              onClick={convert}
              disabled={!amountValid || busy}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
              Convert
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] mt-1.5">
            <span className="text-gray-500">
              Balance {points.toLocaleString()} pts · min {minConvert.toLocaleString()}
            </span>
            <span className="text-sky-300 font-semibold tabular-nums">≈ {usd(previewUsd)}</span>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div className="h-full bg-linear-to-r from-sky-400 to-indigo-400" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mt-1 tabular-nums">
            <span>{points.toLocaleString()} pts</span>
            <span>{threshold.toLocaleString()} pts</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Balance tab
// ─────────────────────────────────────────────────────────────────────────────

function BalanceTab({
  totalEarnings,
  totalWithdrawn,
  monthlyIncome = 0,
  todayReferralBonus = 0,
  transactions,
}: {
  totalEarnings: number;
  totalWithdrawn: number;
  monthlyIncome?: number;
  todayReferralBonus?: number;
  transactions: WalletTransaction[];
}) {
  // Aggregate earnings by type for the breakdown chart. Social credits are
  // generic EARNING rows tagged with a `social_` reference — split them out so
  // "social earn points" get their own slice; anything else lands in "Other".
  const breakdown = useMemo(() => {
    // Every earning source is itemised. Spend / payout / deposit / refund types
    // are NOT earnings and are skipped even though they carry positive `points`.
    const SPEND = new Set([
      "WITHDRAWAL", "PURCHASE", "PENALTY", "COURSE_PURCHASE",
      "DEPOSIT", "REFUND", "COURSE_REFUND",
    ]);
    // Display order + styling for each earning source. `OTHER` is a forward-safe
    // catch-all so any future credit type still shows up (never silently lost).
    const META: { key: string; label: string; color: string }[] = [
      { key: "TASK", label: "Task Earnings", color: "bg-indigo-500" },
      { key: "SOCIAL", label: "Social Earnings", color: "bg-rose-500" },
      { key: "REFERRAL", label: "Referral Earnings", color: "bg-purple-500" },
      { key: "BONUS", label: "Bonuses", color: "bg-amber-500" },
      { key: "LOTTERY_WIN", label: "Lottery", color: "bg-pink-500" },
      { key: "CHECKIN", label: "Check-ins", color: "bg-emerald-500" },
      { key: "GIFT", label: "Gifts", color: "bg-teal-500" },
      { key: "COURSE_TUTOR_EARNING", label: "Course Earnings", color: "bg-sky-500" },
      { key: "OTHER", label: "Other", color: "bg-gray-500" },
    ];
    const buckets: Record<string, number> = Object.fromEntries(
      META.map((m) => [m.key, 0])
    );
    for (const tx of transactions) {
      if (tx.status !== "COMPLETED") continue;
      if (tx.points <= 0) continue;
      if (SPEND.has(tx.type)) continue;
      if (tx.type === "EARNING") {
        // Social credits are EARNING rows tagged with a `social_` reference.
        if (tx.reference?.startsWith("social_")) buckets.SOCIAL += tx.points;
        else buckets.TASK += tx.points;
      } else if (tx.type in buckets) {
        buckets[tx.type] += tx.points;
      } else {
        buckets.OTHER += tx.points;
      }
    }
    const total = Object.values(buckets).reduce((a, b) => a + b, 0);
    if (total === 0) return [];
    return META.map((m) => ({ ...m, value: buckets[m.key] }))
      .filter((b) => b.value > 0)
      .map((b) => ({ ...b, pct: (b.value / total) * 100 }));
  }, [transactions]);

  return (
    <div className="space-y-4">
      {/* Earnings dashboard — lifetime + this-month + today at a glance.
          These were four hand-rolled tiles with `text-2xl … truncate` in a
          ~134px box, so a 5-figure balance clipped ($12,345.67 needs ~144px).
          StatCard is the one tile that handles that. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label="Total Earn"
          value={usd(totalEarnings)}
          icon={<TrendingUp className="w-5 h-5" />}
          tone="green"
        />
        <StatCard
          label="Total Income"
          value={usd(totalWithdrawn)}
          icon={<ArrowUpRight className="w-5 h-5" />}
          tone="purple"
        />
        <StatCard
          label="Monthly Income"
          value={usd(monthlyIncome)}
          icon={<Calendar className="w-5 h-5" />}
          tone="blue"
        />
        <StatCard
          label="Today's Referral"
          value={usd(todayReferralBonus)}
          icon={<Gift className="w-5 h-5" />}
          tone="amber"
        />
      </div>

      {/* Clarifier — answers "where do converted points show in Total Earn?" */}
      <p className="text-[11px] leading-relaxed text-gray-400 -mt-1">
        <span className="font-semibold text-gray-300">Total Earn</span> is the $
        value of everything you&apos;ve earned — points count the moment you earn
        them, so converting points to cash doesn&apos;t change it.{" "}
        <span className="font-semibold text-gray-300">Total Income</span> is what
        you&apos;ve withdrawn.
      </p>

      {/* Earnings Breakdown bar — always shown (empty-state when no points yet) */}
      {breakdown.length === 0 ? (
        <div className="glass rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
            <Coins className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Points Breakdown</p>
            <p className="text-xs text-gray-400 mt-0.5">
              No points earned yet — complete tasks or post to start earning.
            </p>
          </div>
        </div>
      ) : (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white">Earnings Breakdown</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">
              From {transactions.filter((t) => t.points > 0).length} tx
            </p>
          </div>
          {/* Segmented bar */}
          <div className="h-2.5 rounded-full overflow-hidden flex bg-gray-800">
            {breakdown.map((b) => (
              <div
                key={b.key}
                className={cn("h-full", b.color)}
                style={{ width: `${b.pct}%` }}
                title={`${b.label}: ${b.pct.toFixed(1)}%`}
              />
            ))}
          </div>
          {/* Legend */}
          <div className="grid grid-cols-2 gap-1.5">
            {breakdown.map((b) => (
              <div key={b.key} className="flex items-center justify-between gap-1.5 text-xs min-w-0">
                <div className="flex items-center gap-1.5 text-gray-300 min-w-0">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", b.color)} />
                  <span className="truncate">{b.label}</span>
                </div>
                <span className="text-gray-500 tabular-nums shrink-0">
                  {b.pct.toFixed(0)}% · {b.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-white">Recent Transactions</p>
          {transactions.length > 10 && (
            <span className="text-[11px] text-gray-500">
              Showing latest 10
            </span>
          )}
        </div>

        {transactions.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No transactions yet"
            description="Complete a task or claim a reward to see activity here."
          />
        ) : (
          <div className="space-y-1.5">
            {transactions.slice(0, 10).map((tx) => {
              const isOutflow =
                tx.type === "WITHDRAWAL" ||
                tx.type === "PURCHASE" ||
                tx.type === "PENALTY" ||
                tx.type === "AD_CREDIT_PURCHASE";
              const usePoints = tx.points !== 0;
              const magnitude = usePoints
                ? Math.abs(tx.points)
                : Math.abs(tx.amount);
              return (
                <TransactionRow
                  key={tx.id}
                  source={deriveSource(tx.type, tx.reference)}
                  description={tx.description ?? tx.type.replace(/_/g, " ")}
                  amount={isOutflow ? -magnitude : magnitude}
                  unit={usePoints ? "pts" : "USD"}
                  status={
                    tx.status as
                      | "PENDING"
                      | "COMPLETED"
                      | "FAILED"
                      | "CANCELLED"
                  }
                  date={tx.createdAt}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Deposits tab — funding history (add-money requests)
// ─────────────────────────────────────────────────────────────────────────────

const DEPOSIT_STATUS: Record<string, { label: string; tone: string; icon: typeof Clock }> = {
  PENDING: { label: "Pending review", tone: "text-amber-400 bg-amber-500/10 border-amber-500/30", icon: Clock },
  APPROVED: { label: "Approved", tone: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2 },
  REJECTED: { label: "Rejected", tone: "text-red-400 bg-red-500/10 border-red-500/30", icon: XCircle },
};

function DepositsTab({ deposits }: { deposits: WalletDeposit[] }) {
  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">Add money to your wallet</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Deposit via bKash, Nagad, Binance or PayPal — an admin verifies it, then your cash
            balance is credited.
          </p>
        </div>
        <Link
          href="/deposit"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold"
        >
          <Plus className="w-3.5 h-3.5" /> Add funds
        </Link>
      </div>

      {deposits.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No deposits yet"
          description="Add funds to top up your wallet — your deposit history shows up here."
          action={{ label: "Add funds", href: "/deposit" }}
        />
      ) : (
        <div className="space-y-1.5">
          {deposits.map((d) => {
            const meta = DEPOSIT_STATUS[d.status] ?? DEPOSIT_STATUS.PENDING;
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950 p-3"
              >
                <div className={cn("w-9 h-9 rounded-lg grid place-items-center border shrink-0", meta.tone)}>
                  <meta.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {usd(d.amount)}
                    <span className="ml-2 text-xs font-medium text-gray-500">
                      {d.method.replace("MANUAL_", "")}
                    </span>
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {new Date(d.createdAt).toLocaleDateString()}
                    {d.txnId ? ` · TXN ${d.txnId}` : ""}
                  </p>
                </div>
                <span className={cn("shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold border", meta.tone)}>
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Referral tab
// ─────────────────────────────────────────────────────────────────────────────

function ReferralTab({ stats }: { stats: ReferralStats }) {
  const totalCount = stats.l1Count + stats.l2Count + stats.l3Count;

  return (
    <div className="space-y-4">
      {/* Header earnings card */}
      <div className="rounded-2xl bg-linear-to-r from-purple-500/20 to-pink-500/10 border border-purple-500/30 backdrop-blur-xl p-5">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-400" />
          <p className="text-xs uppercase tracking-wider text-purple-300 font-bold">
            Total Referral Earnings
          </p>
        </div>
        <p className="text-4xl font-extrabold text-white tabular-nums mt-2">
          {usd(stats.totalEarned)}
        </p>
        <p className="text-xs text-purple-200/80 mt-1">
          From {totalCount} {totalCount === 1 ? "referral" : "referrals"} across
          3 levels
        </p>
        <Link
          href="/referrals"
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold"
        >
          <Send className="w-3.5 h-3.5" />
          Open Referral Page
        </Link>
      </div>

      {/* L1 / L2 / L3 cards */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
          Commission By Level
        </p>
        {(
          [
            {
              level: 1,
              label: "Level 1 (Direct)",
              pct: 10,
              count: stats.l1Count,
              earned: stats.l1Earned,
              tone: "emerald",
            },
            {
              level: 2,
              label: "Level 2",
              pct: 5,
              count: stats.l2Count,
              earned: stats.l2Earned,
              tone: "purple",
            },
            {
              level: 3,
              label: "Level 3",
              pct: 2,
              count: stats.l3Count,
              earned: stats.l3Earned,
              tone: "amber",
            },
          ] as const
        ).map((row) => {
          const tones = {
            emerald: "border-emerald-500/30 bg-emerald-500/10",
            purple: "border-purple-500/30 bg-purple-500/10",
            amber: "border-amber-500/30 bg-amber-500/10",
          } as const;
          const dotTones = {
            emerald: "bg-emerald-500 text-emerald-100",
            purple: "bg-purple-500 text-purple-100",
            amber: "bg-amber-500 text-amber-100",
          } as const;
          return (
            <div
              key={row.level}
              className={cn(
                "rounded-xl border backdrop-blur-xl p-3 flex items-center gap-3",
                tones[row.tone]
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold",
                  dotTones[row.tone]
                )}
              >
                {row.level}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{row.label}</p>
                <p className="text-[11px] text-gray-400">
                  {row.pct}% commission · {row.count}{" "}
                  {row.count === 1 ? "user" : "users"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-base font-extrabold text-white tabular-nums">
                  {usd(row.earned)}
                </p>
                <p className="text-[10px] text-gray-500">earned</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Withdraw tab
// ─────────────────────────────────────────────────────────────────────────────

function WithdrawTab({
  isFreeTier,
  cashBalance,
  points,
  convertThreshold,
  pendingWithdrawals,
  packageTier,
  feePct,
}: {
  isFreeTier: boolean;
  cashBalance: number;
  points: number;
  convertThreshold: number;
  pendingWithdrawals: number;
  packageTier: string;
  feePct: number;
}) {
  // Only CASH is withdrawable. Points must be converted to cash first (see the
  // Convert card on the Balance tab). Show a nudge when the user has convertible
  // points but not enough cash yet.
  const hasCash = cashBalance > 0;
  const canConvertPoints = points >= convertThreshold;

  return (
    <div className="space-y-4">
      {isFreeTier && (
        <div className="rounded-xl border border-amber-500/30 bg-linear-to-r from-amber-500/15 to-orange-500/5 p-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">
                Withdrawals are locked on the FREE plan
              </p>
              <p className="text-xs text-amber-200/90 mt-1">
                Upgrade to STARTER or higher to unlock instant withdrawals
                with low fees.
              </p>
              <Link
                href="/packages"
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
              >
                <Sparkles className="w-3.5 h-3.5" />
                See plans
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="glass rounded-2xl p-5">
        <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">
          Withdrawable cash
        </p>
        <p className="text-4xl font-extrabold text-white tabular-nums mt-1">
          {usd(cashBalance)}
        </p>
        <p className="text-sm text-gray-500 mt-0.5">
          From course/marketplace/affiliate sales, deposits &amp; converted points
        </p>

        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Your points</span>
            <span className="text-white tabular-nums font-semibold">
              {points.toLocaleString()} pts
              {canConvertPoints && (
                <span className="text-sky-400 ml-1">· convertible</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Pending requests</span>
            <span className="text-white tabular-nums font-semibold">
              {pendingWithdrawals}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Withdrawal fee</span>
            <span className="text-white tabular-nums font-semibold">
              {feePct > 0 ? `${feePct.toFixed(1)}%` : "No fee"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Your tier</span>
            <span className="text-white font-semibold">{packageTier}</span>
          </div>
        </div>
        {feePct > 0 && cashBalance > 0 && (
          <p className="mt-2 text-[11px] text-gray-500">
            On {usd(cashBalance)} you&apos;d receive ~
            {usd(cashBalance * (1 - feePct / 100))} after the {feePct.toFixed(1)}% fee.
          </p>
        )}

        {!hasCash && canConvertPoints && (
          <p className="mt-3 text-[11px] text-sky-300">
            Convert your points to cash on the Balance tab to withdraw.
          </p>
        )}

        <Link
          href="/withdrawal"
          className={cn(
            "mt-4 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all",
            isFreeTier || !hasCash
              ? "bg-gray-800 text-gray-500 cursor-not-allowed pointer-events-none"
              : "bg-linear-to-r from-indigo-500 to-purple-600 text-white hover:scale-[1.02]"
          )}
        >
          <ArrowUpRight className="w-4 h-4" />
          {isFreeTier
            ? "Locked — Upgrade required"
            : !hasCash
              ? "No withdrawable cash yet"
              : "Request Withdrawal"}
        </Link>
      </div>

      {/* Withdrawal info */}
      <div className="glass rounded-xl p-4 space-y-2 text-xs text-gray-400">
        <p className="font-semibold text-white text-sm flex items-center gap-1.5">
          <Gift className="w-4 h-4 text-amber-400" />
          How withdrawals work
        </p>
        <ul className="space-y-1 list-disc list-inside marker:text-gray-600">
          <li>
            Most withdrawals are processed within 24–48 hours after admin
            approval.
          </li>
          <li>
            Supported methods: bKash, Nagad, Rocket, Binance, PayPal — manage
            them in <Link href="/profile" className="text-indigo-400 hover:underline">Profile</Link>.
          </li>
          <li>
            Higher tiers get reduced fees and lower minimums (see{" "}
            <Link href="/packages" className="text-indigo-400 hover:underline">
              Packages
            </Link>).
          </li>
        </ul>
      </div>
    </div>
  );
}

// Avoid unused-import warning for icons reserved for future use
void Trophy;
