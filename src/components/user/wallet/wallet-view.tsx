"use client";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

import { useMemo, useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { BalanceCard } from "@/components/user/primitives/balance-card";
import { TransactionRow, type TxType } from "@/components/user/primitives/transaction-row";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { cn } from "@/lib/utils";

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

export interface WalletViewProps {
  pointsBalance: number;
  cashBalance: number;
  totalEarnings: number;
  totalWithdrawn: number;
  packageTier: string;
  transactions: WalletTransaction[];
  referralStats: ReferralStats;
  pendingWithdrawals: number;
  /** Admin-configurable points-per-$1 rate (default 1000). */
  pointsPerUsd?: number;
}

type Tab = "balance" | "referral" | "withdraw";

const TX_TYPE_MAP: Record<string, TxType> = {
  EARNING: "EARN_TASK",
  BONUS: "EARN_BONUS",
  REFERRAL: "EARN_REFERRAL",
  LOTTERY_WIN: "EARN_LOTTERY",
  CHECKIN: "EARN_BONUS",
  GIFT: "EARN_BONUS",
  WITHDRAWAL: "WITHDRAWAL",
  PURCHASE: "PURCHASE",
  REFUND: "REFUND",
  PENALTY: "EARN_OTHER",
};

const MIN_WITHDRAW_PTS = 5000;

export function WalletView(props: WalletViewProps) {
  const [tab, setTab] = useState<Tab>("balance");

  const isFreeTier = props.packageTier === "FREE";
  const withdrawablePts = Math.max(0, props.pointsBalance);
  const pointsPerUsd = props.pointsPerUsd ?? 1000;

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
        packageTier={props.packageTier}
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
          transactions={props.transactions}
        />
      )}

      {tab === "referral" && (
        <ReferralTab stats={props.referralStats} />
      )}

      {tab === "withdraw" && (
        <WithdrawTab
          isFreeTier={isFreeTier}
          withdrawablePts={withdrawablePts}
          pendingWithdrawals={props.pendingWithdrawals}
          packageTier={props.packageTier}
          pointsPerUsd={pointsPerUsd}
        />
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
  transactions,
}: {
  totalEarnings: number;
  totalWithdrawn: number;
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
      {/* Lifetime stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400">
              Total Earned
            </span>
          </div>
          <p className="text-2xl font-extrabold text-white tabular-nums mt-1">
            ${totalEarnings.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3">
          <div className="flex items-center gap-1.5">
            <ArrowUpRight className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[10px] uppercase tracking-wider font-bold text-purple-400">
              Total Withdrawn
            </span>
          </div>
          <p className="text-2xl font-extrabold text-white tabular-nums mt-1">
            ${totalWithdrawn.toFixed(2)}
          </p>
        </div>
      </div>

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
              <div key={b.key} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-gray-300">
                  <span className={cn("w-2 h-2 rounded-full", b.color)} />
                  {b.label}
                </div>
                <span className="text-gray-500 tabular-nums">
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
              const txType = TX_TYPE_MAP[tx.type] ?? "EARN_OTHER";
              const isEarning =
                tx.type !== "WITHDRAWAL" &&
                tx.type !== "PURCHASE" &&
                tx.type !== "PENALTY";
              const showPoints = tx.points > 0;
              return (
                <TransactionRow
                  key={tx.id}
                  type={txType}
                  description={tx.description ?? tx.type.replace("_", " ")}
                  amount={
                    showPoints
                      ? (isEarning ? tx.points : -tx.points)
                      : (isEarning ? tx.amount : -tx.amount)
                  }
                  unit={showPoints ? "pts" : "USD"}
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
          ${stats.totalEarned.toFixed(2)}
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
                  ${row.earned.toFixed(2)}
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
  withdrawablePts,
  pendingWithdrawals,
  packageTier,
  pointsPerUsd,
}: {
  isFreeTier: boolean;
  withdrawablePts: number;
  pendingWithdrawals: number;
  packageTier: string;
  pointsPerUsd: number;
}) {
  const PT_TO_USD = 1 / pointsPerUsd;
  const meetsThreshold = withdrawablePts >= MIN_WITHDRAW_PTS;
  const usdValue = withdrawablePts * PT_TO_USD;
  const minUsd = MIN_WITHDRAW_PTS * PT_TO_USD;

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
          Withdrawable
        </p>
        <p className="text-4xl font-extrabold text-white tabular-nums mt-1">
          {withdrawablePts.toLocaleString()}
          <span className="text-base font-bold text-gray-400 ml-1">pts</span>
        </p>
        <p className="text-sm text-gray-500 mt-0.5">
          ≈ ${usdValue.toFixed(2)} USD
        </p>

        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Minimum payout</span>
            <span className="text-white tabular-nums font-semibold">
              {MIN_WITHDRAW_PTS.toLocaleString()} pts (${minUsd.toFixed(2)})
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Pending requests</span>
            <span className="text-white tabular-nums font-semibold">
              {pendingWithdrawals}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Your tier</span>
            <span className="text-white font-semibold">{packageTier}</span>
          </div>
        </div>

        <Link
          href="/withdrawal"
          className={cn(
            "mt-4 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all",
            isFreeTier || !meetsThreshold
              ? "bg-gray-800 text-gray-500 cursor-not-allowed pointer-events-none"
              : "bg-linear-to-r from-indigo-500 to-purple-600 text-white hover:scale-[1.02]"
          )}
        >
          <ArrowUpRight className="w-4 h-4" />
          {isFreeTier
            ? "Locked — Upgrade required"
            : !meetsThreshold
              ? `Need ${(MIN_WITHDRAW_PTS - withdrawablePts).toLocaleString()} more pts`
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
