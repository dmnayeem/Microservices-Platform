"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Crown,
  Calendar,
  CreditCard,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Coins,
  Zap,
  Shield,
  TrendingUp,
  Receipt,
  History,
  RefreshCw,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { cn, usd } from "@/lib/utils";

export interface PackageData {
  tier: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number | null;
  dailyTaskLimit: number;
  withdrawalFee: number;
  minWithdrawal: number;
  features: string[];
  referralBonus: number;
  xpMultiplier: number;
}

export interface SubscriptionHistoryItem {
  id: string;
  packageTier: string;
  startDate: string;
  endDate: string;
  amount: number;
  paymentMethod: string | null;
  isActive: boolean;
  autoRenew: boolean;
  createdAt: string;
}

/** GET /api/packages/subscription — the parts this view uses. */
interface BillingState {
  autoRenewAllowed: boolean;
  activeSubscription: { autoRenew: boolean; amount: number } | null;
  pendingSubscription: {
    packageName: string;
    amount: number;
    transactionId: string | null;
  } | null;
}

export interface MyPackageViewProps {
  packageTier: string;
  packageExpiresAt: string | null;
  currentPackage: PackageData | null;
  subscriptions: SubscriptionHistoryItem[];
  hasActivePaidSubscription: boolean;
}

const TIER_GRADIENT: Record<string, string> = {
  FREE: "from-[#4b5563] to-[#374151]",
  STARTER: "from-blue-500 to-cyan-500",
  PRO: "from-purple-500 to-pink-500",
  ELITE: "from-amber-500 to-orange-500",
  VIP: "from-emerald-500 to-teal-500",
};

const TIER_RANK: Record<string, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 2,
  ELITE: 3,
  VIP: 4,
};

type Tab = "overview" | "history";

export function MyPackageView({
  packageTier,
  packageExpiresAt,
  currentPackage,
  subscriptions,
  hasActivePaidSubscription,
}: MyPackageViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [billing, setBilling] = useState<BillingState | null>(null);

  const tierGradient = TIER_GRADIENT[packageTier] ?? TIER_GRADIENT.FREE;
  const isFree = packageTier === "FREE";

  const loadBilling = useCallback(async () => {
    try {
      const r = await fetch("/api/packages/subscription", { cache: "no-store" });
      if (r.ok) setBilling((await r.json()) as BillingState);
    } catch {
      /* the page still works without it */
    }
  }, []);
  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  // "Cancelling" an active plan = turning auto-renew off: the plan runs to its
  // end date and then stops. Nothing is refunded and nothing is deleted.
  const setAutoRenew = async (on: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/packages/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoRenew: on }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(on ? "Auto-renew is on" : "Auto-renew is off", {
        description: on
          ? "At expiry your plan renews from your cash balance."
          : "Your plan stays active until its end date, then stops.",
      });
      setShowCancelModal(false);
      await loadBilling();
      router.refresh();
    } catch (err) {
      toast.error("Couldn't change auto-renew", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  // Withdraw a payment request that an admin has not verified yet.
  const cancelPending = async () => {
    if (!confirm("Withdraw this plan request? If you already sent the payment, contact support instead.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/packages/subscription", { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Request withdrawn");
      await loadBilling();
      router.refresh();
    } catch (err) {
      toast.error("Couldn't withdraw the request", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-400" />
          My Package
        </h1>
        <p className="text-(--app-ink-3) text-sm mt-0.5">
          Your current plan, benefits, and billing history.
        </p>
      </header>

      {/* Current plan hero card */}
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border p-5 shadow-2xl",
          isFree
            ? "border-(--app-line) bg-(--app-surface)"
            : `border-amber-500/40 bg-linear-to-br ${tierGradient} bg-opacity-20`
        )}
      >
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-3">
          <div
            className={`w-14 h-14 rounded-2xl bg-linear-to-br ${tierGradient} flex items-center justify-center text-white shadow-lg shrink-0`}
          >
            <Crown className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest font-bold text-(--app-ink-2)">
              Current Plan
            </p>
            <p className="text-3xl font-extrabold text-white">
              {currentPackage?.name ?? "Free"}
            </p>
            {currentPackage?.description && (
              <p className="text-xs text-(--app-ink-2)/90 mt-0.5">
                {currentPackage.description}
              </p>
            )}
            {packageExpiresAt && !isFree && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-(--app-ink)">
                <Calendar className="w-3.5 h-3.5 text-amber-300" />
                Expires {format(new Date(packageExpiresAt), "PP")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-(--app-line) overflow-x-auto scrollbar-none">
        {(
          [
            { key: "overview", label: "Overview", icon: TrendingUp },
            { key: "history", label: "History", icon: History },
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
                  ? "text-white border-(--app-accent-edge)"
                  : "text-(--app-ink-3) border-transparent hover:text-(--app-ink)"
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.key === "history" && subscriptions.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-(--app-surface-2) text-(--app-ink-2) tabular-nums">
                  {subscriptions.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {billing?.pendingSubscription && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm">
            <p className="font-semibold text-white">
              {billing.pendingSubscription.packageName} request awaiting verification
            </p>
            <p className="text-xs text-(--app-ink-3)">
              {usd(billing.pendingSubscription.amount)} · Txn ID{" "}
              <span className="break-all">{billing.pendingSubscription.transactionId ?? "—"}</span>
            </p>
          </div>
          <button
            onClick={cancelPending}
            disabled={busy}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-(--app-surface-2) text-xs font-bold text-(--app-ink-2) hover:text-red-400 disabled:opacity-50"
          >
            Withdraw request
          </button>
        </div>
      )}

      {tab === "overview" && (
        <OverviewTab
          isFree={isFree}
          currentPackage={currentPackage}
          packageTier={packageTier}
          hasActivePaidSubscription={hasActivePaidSubscription}
          autoRenew={billing?.activeSubscription?.autoRenew ?? false}
          autoRenewAllowed={
            !!billing?.autoRenewAllowed && (billing?.activeSubscription?.amount ?? 0) > 0
          }
          busy={busy}
          onTurnOn={() => setAutoRenew(true)}
          onCancelClick={() => setShowCancelModal(true)}
        />
      )}

      {tab === "history" && (
        <HistoryTab subscriptions={subscriptions} />
      )}

      {/* Cancel confirm modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm glass rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-base font-bold text-white">
                  Turn off auto-renew?
                </p>
                <p className="text-xs text-(--app-ink-3) mt-1">
                  Your plan will not renew. It stays active until {packageExpiresAt
                    ? format(new Date(packageExpiresAt), "PP")
                    : "the end of the period"}, then drops to the free plan. No refund
                  for the remaining time.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) text-sm font-bold disabled:opacity-50"
              >
                Keep plan
              </button>
              <button
                onClick={() => setAutoRenew(false)}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Turn off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview tab
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({
  isFree,
  currentPackage,
  packageTier,
  hasActivePaidSubscription,
  autoRenew,
  autoRenewAllowed,
  busy,
  onTurnOn,
  onCancelClick,
}: {
  isFree: boolean;
  currentPackage: PackageData | null;
  packageTier: string;
  hasActivePaidSubscription: boolean;
  autoRenew: boolean;
  autoRenewAllowed: boolean;
  busy: boolean;
  onTurnOn: () => void;
  onCancelClick: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Benefits checklist */}
      {currentPackage && (
        <section className="glass rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider font-bold text-(--app-ink-3) mb-3 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Your Benefits
          </p>
          <ul className="space-y-2">
            {(currentPackage.features.length > 0
              ? currentPackage.features
              : defaultFeaturesForTier(packageTier)
            ).map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm text-(--app-ink)"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Earning power table */}
      {currentPackage && (
        <section className="glass rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider font-bold text-(--app-ink-3) mb-3 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            Earning Power
          </p>
          <div className="grid grid-cols-2 gap-3">
            <PowerCell
              icon={TrendingUp}
              label="Daily task limit"
              value={
                currentPackage.dailyTaskLimit > 0
                  ? `${currentPackage.dailyTaskLimit}/day`
                  : "Unlimited"
              }
              tone="indigo"
            />
            <PowerCell
              icon={Zap}
              label="XP multiplier"
              value={`${currentPackage.xpMultiplier}×`}
              tone="purple"
            />
            <PowerCell
              icon={Coins}
              label="Withdrawal fee"
              value={`${(currentPackage.withdrawalFee * 100).toFixed(1)}%`}
              tone="amber"
            />
            <PowerCell
              icon={CreditCard}
              label="Min withdrawal"
              value={`${usd(currentPackage.minWithdrawal)}`}
              tone="emerald"
            />
            <PowerCell
              icon={Crown}
              label="Monthly price"
              value={
                currentPackage.priceMonthly === 0
                  ? "Free"
                  : `${usd(currentPackage.priceMonthly)}/mo`
              }
              tone="indigo"
            />
            <PowerCell
              icon={ArrowUpRight}
              label="Referral bonus"
              value={
                currentPackage.referralBonus > 0
                  ? `+${(currentPackage.referralBonus * 100).toFixed(0)}%`
                  : "Standard"
              }
              tone="purple"
            />
          </div>
        </section>
      )}

      {/* Action buttons */}
      <div className="space-y-2">
        <Link
          href="/packages"
          className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) text-white font-bold hover:scale-[1.01] transition-transform"
        >
          <CreditCard className="w-4 h-4" />
          {isFree ? "Upgrade Plan" : "Change Plan"}
          <ArrowUpRight className="w-4 h-4" />
        </Link>

        {hasActivePaidSubscription && !isFree && autoRenew && (
          <button
            onClick={onCancelClick}
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-(--app-surface-2) hover:bg-red-500/15 hover:text-red-400 text-(--app-ink-3) text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            Cancel auto-renew
          </button>
        )}
        {hasActivePaidSubscription && !isFree && !autoRenew && autoRenewAllowed && (
          <button
            onClick={onTurnOn}
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-(--app-surface-2) hover:bg-emerald-500/15 hover:text-emerald-400 text-(--app-ink-3) text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Turn on auto-renew
          </button>
        )}
        {hasActivePaidSubscription && !isFree && (
          <p className="text-[11px] text-center text-(--app-ink-3)">
            {autoRenew
              ? "Auto-renew is on: at expiry the plan renews from your cash balance (never points). If there is not enough cash, it simply ends."
              : "Auto-renew is off: the plan ends on its expiry date."}
          </p>
        )}
      </div>

      {/* Tier ladder */}
      <section className="rounded-xl border border-(--app-line) bg-(--app-surface) p-4">
        <p className="text-xs uppercase tracking-wider font-bold text-(--app-ink-3) mb-3">
          Plan Ladder
        </p>
        <div className="space-y-1.5">
          {(["FREE", "STARTER", "PRO", "ELITE", "VIP"] as const).map((t) => {
            const rank = TIER_RANK[t];
            const currentRank = TIER_RANK[packageTier];
            const isCurrent = t === packageTier;
            const isPast = rank < currentRank;
            return (
              <div
                key={t}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2 rounded-lg border",
                  isCurrent
                    ? "border-(--app-accent-edge)/50 bg-(--app-cta)/10"
                    : isPast
                      ? "border-emerald-500/20 bg-(--app-page)"
                      : "border-(--app-line) bg-(--app-page)/50 opacity-70"
                )}
              >
                <div
                  className={cn(
                    "w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold uppercase tracking-wider shrink-0",
                    `bg-linear-to-br ${TIER_GRADIENT[t]} text-white`
                  )}
                >
                  {t.charAt(0)}
                </div>
                <span
                  className={cn(
                    "text-sm font-bold",
                    isCurrent
                      ? "text-white"
                      : isPast
                        ? "text-emerald-300"
                        : "text-(--app-ink-3)"
                  )}
                >
                  {t}
                </span>
                {isCurrent && (
                  <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-(--app-cta) text-(--app-on-cta) font-bold">
                    Current
                  </span>
                )}
                {isPast && !isCurrent && (
                  <CheckCircle2 className="ml-auto w-4 h-4 text-emerald-400" />
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// History tab
// ─────────────────────────────────────────────────────────────────────────────

function HistoryTab({
  subscriptions,
}: {
  subscriptions: SubscriptionHistoryItem[];
}) {
  if (subscriptions.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <Receipt className="w-10 h-10 text-(--app-glyph) mx-auto mb-2" />
        <p className="text-sm font-bold text-white">No billing history yet</p>
        <p className="text-xs text-(--app-ink-3) mt-1">
          Once you upgrade to a paid plan, your subscription history will
          appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl divide-y divide-(--app-line)">
      {subscriptions.map((s) => {
        const tierGradient = TIER_GRADIENT[s.packageTier] ?? TIER_GRADIENT.FREE;
        // `s.isActive` is set server-side via the cancel/expire flow; we trust it
        // rather than re-computing from Date.now() (which fails React purity lint).
        const isCurrent = s.isActive;
        return (
          <div key={s.id} className="px-4 py-3 flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg bg-linear-to-br ${tierGradient} flex items-center justify-center text-white shrink-0`}
            >
              <Crown className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-white">
                  {s.packageTier}
                </p>
                {isCurrent && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-emerald-500/20 text-emerald-400 font-bold">
                    Active
                  </span>
                )}
                {s.autoRenew && (
                  <span className="text-[10px] text-(--app-accent-ink)">
                    · auto-renew
                  </span>
                )}
              </div>
              <p className="text-[11px] text-(--app-ink-3)">
                {format(new Date(s.startDate), "PP")} →{" "}
                {format(new Date(s.endDate), "PP")}
                {s.paymentMethod && ` · ${s.paymentMethod}`}
              </p>
            </div>
            <span className="text-sm font-bold text-emerald-400 tabular-nums">
              {usd(s.amount)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function PowerCell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  tone: "indigo" | "purple" | "amber" | "emerald";
}) {
  const tones = {
    indigo: "text-(--app-accent-ink)",
    purple: "text-purple-400",
    amber: "text-amber-400",
    emerald: "text-emerald-400",
  } as const;
  return (
    <div className="rounded-lg bg-(--app-page) border border-(--app-line) p-3">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("w-3.5 h-3.5", tones[tone])} />
        <p className="text-[10px] uppercase tracking-wider font-bold text-(--app-ink-3)">
          {label}
        </p>
      </div>
      <p className="text-base font-extrabold text-white tabular-nums mt-0.5">
        {value}
      </p>
    </div>
  );
}

function defaultFeaturesForTier(tier: string): string[] {
  const map: Record<string, string[]> = {
    FREE: [
      "Up to 5 tasks per day",
      "$5 minimum withdrawal",
      "5% withdrawal fee",
      "Email support",
    ],
    STARTER: [
      "20 tasks per day",
      "1.1× XP multiplier",
      "$5 min withdrawal · 3% fee",
      "Priority support",
    ],
    PRO: [
      "50 tasks per day",
      "1.25× XP multiplier",
      "$3 min withdrawal · 2% fee",
      "VIP tasks access",
      "24/7 priority support",
    ],
    ELITE: [
      "100 tasks per day",
      "1.5× XP multiplier",
      "$2 min withdrawal · 1% fee",
      "Daily bonus rewards",
      "High-priority support",
    ],
    VIP: [
      "Unlimited tasks",
      "2× XP multiplier",
      "$1 min withdrawal · 0% fee",
      "Dedicated account manager",
      "Exclusive VIP-only tasks",
    ],
  };
  return map[tier] ?? map.FREE;
}
