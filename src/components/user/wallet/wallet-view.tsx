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
  /** The levels and rates the admin set (lib/team.ts). */
  levels: Array<{ level: number; rateLabel: string; count: number; earnedUsd: number }>;
  totalCount: number;
  totalEarned: number;
}

/** Points earned by source, last 30 days (lib/dashboard-earnings.ts). */
export interface EarningSource {
  key: string;
  label: string;
  color: string;
  value: number;
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
  /** Task credit, when this account can create tasks. Omitted otherwise. */
  taskCreditPoints?: number;
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
  earningSources: EarningSource[];
  /** Points earned today / last 7 days / last 30 days. */
  earnPeriods: { today: number; week: number; month: number };
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
    <div className="space-y-(--app-gap)">
      <header>
        <h1 className="t-title text-white inline-flex items-center gap-2.5">
          <Wallet className="w-6 h-6 text-(--app-ink-3)" />
          Wallet
        </h1>
        <p className="t-body text-(--app-ink-3) mt-1">
          Your earnings, referral commission, and payouts.
        </p>
      </header>

      <AdRenderer placement="WALLET_TOP" />

      <BalanceCard
        points={props.pointsBalance}
        cash={props.cashBalance}
        adCredit={props.adCreditBalance}
        taskCredit={props.taskCreditPoints}
        packageTier={props.packageTier}
        pointsPerUsd={pointsPerUsd}
        addFundsHref="/deposit"
        withdrawHref="/withdrawal"
      />

      {props.pendingWithdrawals > 0 && (
        <button
          type="button"
          onClick={() => setTab("withdraw")}
          className="app-card app-press flex w-full items-center gap-3 text-left"
        >
          <span className="app-icon shrink-0">
            <Clock className="w-4 h-4 text-amber-400" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-white">
              {props.pendingWithdrawals} withdrawal{props.pendingWithdrawals === 1 ? "" : "s"} being processed
            </span>
            <span className="block text-xs text-(--app-ink-3)">We&apos;ll notify you when it is paid.</span>
          </span>
          <span className="t-meta shrink-0 font-extrabold text-(--app-accent-ink)">View</span>
        </button>
      )}

      {/* Tabs */}
      {/* All five in view at every width — they used to sit in a row that
          scrolled sideways, and "Team" and "Withdraw" were off-screen where
          nobody found them. */}
      <nav
        aria-label="Wallet tabs"
        className="grid grid-cols-5 gap-1 rounded-(--app-r-card) border border-(--app-line) bg-(--app-surface) p-1"
      >
        {(
          [
            { key: "balance", label: "Overview", icon: Coins },
            { key: "history", label: "History", icon: History },
            { key: "deposits", label: "Deposits", icon: Banknote },
            { key: "referral", label: "Team", icon: Users },
            { key: "withdraw", label: "Withdraw", icon: ArrowUpRight },
          ] as const
        ).map((t) => {
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "app-press flex min-w-0 flex-col items-center justify-center gap-1 rounded-(--app-r-control) px-1 py-2 text-[11px] font-bold",
                isActive
                  ? "bg-(--app-nav-wash) text-(--app-nav-on)"
                  : "text-(--app-ink-3) hover:text-(--app-ink)"
              )}
            >
              <t.icon className="h-4.5 w-4.5" />
              <span className="max-w-full truncate">{t.label}</span>
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
          earningSources={props.earningSources}
          earnPeriods={props.earnPeriods}
          points={props.pointsBalance}
          convertThreshold={props.convertThreshold ?? 10000}
          pointsPerUsd={pointsPerUsd}
          onSeeAll={() => setTab("history")}
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
    /* Was a sky-tinted panel sitting directly under an indigo-tinted balance
       card: two tinted surfaces, two hues, one above the other. Neutral card,
       and the ONE accent thing inside it is the Convert button, which is the
       action. */
    <div className="app-card">
      <div className="min-w-0">
        <p className="t-section text-white flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-(--app-ink-3) shrink-0" />
          Convert points to cash
        </p>
        <p className="t-meta text-(--app-ink-3) mt-1">
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
                className="app-tap-row w-full pl-3.5 pr-16 bg-(--app-surface-2) border border-(--app-line) rounded-(--app-r-control) text-(--app-ink) text-sm font-bold tabular-nums focus:outline-none focus:border-(--app-accent-edge)"
              />
              <button
                type="button"
                onClick={() => setAmountStr(String(points))}
                className="app-press absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-(--app-r-chip) bg-(--app-surface) border border-(--app-line) text-[10px] font-extrabold text-(--app-ink-2) hover:text-(--app-ink)"
              >
                MAX
              </button>
            </div>
            <button
              onClick={convert}
              disabled={!amountValid || busy}
              className="app-accent app-press app-tap-row shrink-0 inline-flex items-center gap-1.5 px-4 rounded-(--app-r-control) text-xs font-extrabold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
              Convert
            </button>
          </div>
          <div className="flex items-center justify-between t-meta mt-2">
            <span className="text-(--app-ink-3)">
              Balance {points.toLocaleString()} pts · min {minConvert.toLocaleString()}
            </span>
            <span className="t-in font-bold tabular-nums">≈ {usd(previewUsd)}</span>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <div className="h-2 rounded-full bg-(--app-surface-2) overflow-hidden">
            <div className="h-full bg-(image:--app-rail)" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-(--app-ink-3) mt-1 tabular-nums">
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
  earningSources,
  earnPeriods,
  points,
  convertThreshold,
  pointsPerUsd,
  onSeeAll,
}: {
  totalEarnings: number;
  totalWithdrawn: number;
  monthlyIncome?: number;
  todayReferralBonus?: number;
  transactions: WalletTransaction[];
  earningSources: EarningSource[];
  earnPeriods: { today: number; week: number; month: number };
  points: number;
  convertThreshold: number;
  pointsPerUsd: number;
  onSeeAll: () => void;
}) {
  // Aggregate earnings by type for the breakdown chart. Social credits are
  // generic EARNING rows tagged with a `social_` reference — split them out so
  // "social earn points" get their own slice; anything else lands in "Other".
  // Classified on the server with the admin console's rules — the old
  // client-side version filed every EARNING (leaderboard prizes included)
  // under "Task Earnings", and only looked at the last 50 rows.
  const breakdown = useMemo(() => {
    const total = earningSources.reduce((a, b) => a + b.value, 0);
    if (total === 0) return [];
    return earningSources.map((b) => ({ ...b, pct: (b.value / total) * 100 }));
  }, [earningSources]);

  return (
    <div className="space-y-4">
      <ConvertCard points={points} threshold={convertThreshold} pointsPerUsd={pointsPerUsd} />

      {/* Points earned — the same three windows as the dashboard. */}
      <div className="app-card">
        <p className="t-section mb-2 text-white">Points earned</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Today", pts: earnPeriods.today },
            { label: "7 days", pts: earnPeriods.week },
            { label: "30 days", pts: earnPeriods.month },
          ].map((p) => (
            <div key={p.label} className="app-tile min-w-0">
              <p className="t-meta text-(--app-ink-3)">{p.label}</p>
              <p className="t-figure-sm mt-1 truncate text-white">{p.pts.toLocaleString()}</p>
              <p className="t-meta text-(--app-ink-3)">≈ {usd(p.pts / (pointsPerUsd || 1))}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Earnings dashboard — lifetime + this-month + today at a glance.
          These were four hand-rolled tiles with `text-2xl … truncate` in a
          ~134px box, so a 5-figure balance clipped ($12,345.67 needs ~144px).
          StatCard is the one tile that handles that. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          label="Total earned"
          value={usd(totalEarnings)}
          icon={<TrendingUp className="w-5 h-5" />}
          tone="green"
        />
        <StatCard
          label="Total withdrawn"
          value={usd(totalWithdrawn)}
          icon={<ArrowUpRight className="w-5 h-5" />}
          tone="purple"
        />
        <StatCard
          label="Withdrawn this month"
          value={usd(monthlyIncome)}
          icon={<Calendar className="w-5 h-5" />}
          tone="blue"
        />
        <StatCard
          label="Team bonus today"
          value={usd(todayReferralBonus)}
          icon={<Gift className="w-5 h-5" />}
          tone="amber"
        />
      </div>

      <p className="-mt-1 text-[11px] leading-relaxed text-(--app-ink-3)">
        <span className="font-semibold text-(--app-ink-2)">Total earned</span> counts
        points the moment you earn them, so converting them to cash does not change
        it. <span className="font-semibold text-(--app-ink-2)">Withdrawn</span> is
        what has been paid out to you.
      </p>

      {/* Earnings Breakdown bar — always shown (empty-state when no points yet) */}
      {breakdown.length === 0 ? (
        <div className="glass rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
            <Coins className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Points Breakdown</p>
            <p className="text-xs text-(--app-ink-3) mt-0.5">
              No points earned yet — complete tasks or post to start earning.
            </p>
          </div>
        </div>
      ) : (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white">Earnings Breakdown</p>
            <p className="text-[10px] text-(--app-ink-3) uppercase tracking-wider">
              Last 30 days
            </p>
          </div>
          {/* Segmented bar */}
          <div className="h-2.5 rounded-full overflow-hidden flex bg-(--app-surface-2)">
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
                <div className="flex items-center gap-1.5 text-(--app-ink-2) min-w-0">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", b.color)} />
                  <span className="truncate">{b.label}</span>
                </div>
                <span className="text-(--app-ink-3) tabular-nums shrink-0">
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
          <p className="text-sm font-bold text-white">Recent transactions</p>
          <button
            type="button"
            onClick={onSeeAll}
            className="app-press app-tap-row inline-flex items-center px-2.5 -mr-2 rounded-(--app-r-chip) t-meta font-extrabold text-(--app-accent-ink) hover:bg-(--app-nav-wash)"
          >
            See all
          </button>
        </div>

        {transactions.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No transactions yet"
            description="Complete a task or claim a reward to see activity here."
          />
        ) : (
          <div className="space-y-1.5">
            {transactions.slice(0, 8).map((tx) => {
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
          <p className="text-xs text-(--app-ink-3) mt-0.5">
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
                className="flex items-center gap-3 rounded-xl border border-(--app-line) bg-(--app-page) p-3"
              >
                <div className={cn("w-9 h-9 rounded-lg grid place-items-center border shrink-0", meta.tone)}>
                  <meta.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {usd(d.amount)}
                    <span className="ml-2 text-xs font-medium text-(--app-ink-3)">
                      {d.method.replace("MANUAL_", "")}
                    </span>
                  </p>
                  <p className="text-[11px] text-(--app-ink-3) truncate">
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
  const totalCount = stats.totalCount;
  const sameRate =
    stats.levels.length > 1 && stats.levels.every((l) => l.rateLabel === stats.levels[0].rateLabel);

  return (
    <div className="space-y-4">
      <div className="app-card flex items-center gap-4">
        <span className="app-icon shrink-0">
          <Users className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="t-meta text-(--app-ink-3)">Team commission earned</p>
          <p className="text-2xl font-extrabold tabular-nums text-white">{usd(stats.totalEarned)}</p>
          <p className="t-meta text-(--app-ink-3)">
            {totalCount} {totalCount === 1 ? "member" : "members"} · {stats.levels.length}{" "}
            {stats.levels.length === 1 ? "level" : "levels"}
            {sameRate ? ` · ${stats.levels[0].rateLabel} each` : ""}
          </p>
        </div>
        <Link
          href="/referrals"
          className="app-accent app-press app-tap-row shrink-0 inline-flex items-center gap-1.5 rounded-(--app-r-control) px-3 text-xs font-extrabold"
        >
          <Send className="w-3.5 h-3.5" />
          Invite
        </Link>
      </div>

      {/* Compact table — the admin's levels and rates. Ten identical cards
          took a whole screen to say "3%" ten times. */}
      <div className="overflow-hidden rounded-(--app-r-control) border border-(--app-line) bg-(--app-surface)">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-4 bg-(--app-surface-2) px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-(--app-ink-3)">
          <span>Level</span>
          <span className="text-right">Rate</span>
          <span className="text-right">Members</span>
          <span className="w-16 text-right">Earned</span>
        </div>
        {stats.levels.map((l) => (
          <div
            key={l.level}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 border-t border-(--app-line) px-3 py-2 text-sm",
              l.count === 0 && "text-(--app-ink-3)"
            )}
          >
            <span className="font-bold text-white">
              Level {l.level}
              {l.level === 1 && <span className="ml-1.5 text-[10px] font-semibold text-(--app-ink-3)">direct</span>}
            </span>
            <span className="text-right font-bold tabular-nums text-(--app-accent-ink)">{l.rateLabel}</span>
            <span className="text-right tabular-nums">{l.count.toLocaleString()}</span>
            <span className="w-16 text-right font-bold tabular-nums">{usd(l.earnedUsd)}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-(--app-ink-3)">
        Commission is paid into your wallet automatically whenever someone in your
        team earns. See who is in your team on{" "}
        <Link href="/referrals" className="font-semibold text-(--app-accent-ink) hover:underline">
          My Team
        </Link>
        .
      </p>
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
        <p className="text-xs uppercase tracking-wider text-(--app-ink-3) font-bold">
          Withdrawable cash
        </p>
        <p className="text-4xl font-extrabold text-white tabular-nums mt-1">
          {usd(cashBalance)}
        </p>
        <p className="text-sm text-(--app-ink-3) mt-0.5">
          From course/marketplace/affiliate sales, deposits &amp; converted points
        </p>

        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-(--app-ink-3)">Your points</span>
            <span className="text-white tabular-nums font-semibold">
              {points.toLocaleString()} pts
              {canConvertPoints && (
                <span className="text-sky-400 ml-1">· convertible</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-(--app-ink-3)">Pending requests</span>
            <span className="text-white tabular-nums font-semibold">
              {pendingWithdrawals}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-(--app-ink-3)">Withdrawal fee</span>
            <span className="text-white tabular-nums font-semibold">
              {feePct > 0 ? `${feePct.toFixed(1)}%` : "No fee"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-(--app-ink-3)">Your tier</span>
            <span className="text-white font-semibold">{packageTier}</span>
          </div>
        </div>
        {feePct > 0 && cashBalance > 0 && (
          <p className="mt-2 text-[11px] text-(--app-ink-3)">
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
              ? "bg-(--app-surface-2) text-(--app-ink-3) cursor-not-allowed pointer-events-none"
              : "bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) text-white hover:scale-[1.02]"
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
      <div className="glass rounded-xl p-4 space-y-2 text-xs text-(--app-ink-3)">
        <p className="font-semibold text-white text-sm flex items-center gap-1.5">
          <Gift className="w-4 h-4 text-amber-400" />
          How withdrawals work
        </p>
        <ul className="space-y-1 list-disc list-inside marker:text-(--app-glyph)">
          <li>
            Most withdrawals are processed within 24–48 hours after admin
            approval.
          </li>
          <li>
            Supported methods: bKash, Nagad, Rocket, Binance, PayPal — manage
            them in <Link href="/profile" className="text-(--app-accent-ink) hover:underline">Profile</Link>.
          </li>
          <li>
            Higher tiers get reduced fees and lower minimums (see{" "}
            <Link href="/packages" className="text-(--app-accent-ink) hover:underline">
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
