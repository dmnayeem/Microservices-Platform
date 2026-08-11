"use client";

import { useState } from "react";
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
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

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

export interface MyPackageViewProps {
  packageTier: string;
  packageExpiresAt: string | null;
  currentPackage: PackageData | null;
  subscriptions: SubscriptionHistoryItem[];
  hasActivePaidSubscription: boolean;
}

const TIER_GRADIENT: Record<string, string> = {
  FREE: "from-gray-600 to-gray-700",
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

  const tierGradient = TIER_GRADIENT[packageTier] ?? TIER_GRADIENT.FREE;
  const isFree = packageTier === "FREE";

  const cancel = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/packages/subscription", {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success("Subscription cancelled", {
        description:
          "Your plan stays active until the end of the current billing period.",
      });
      setShowCancelModal(false);
      router.refresh();
    } catch (err) {
      toast.error("Couldn't cancel", {
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
        <p className="text-gray-400 text-sm mt-0.5">
          Your current plan, benefits, and billing history.
        </p>
      </header>

      {/* Current plan hero card */}
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border p-5 shadow-2xl",
          isFree
            ? "border-gray-700 bg-gray-900"
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
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-300">
              Current Plan
            </p>
            <p className="text-3xl font-extrabold text-white">
              {currentPackage?.name ?? "Free"}
            </p>
            {currentPackage?.description && (
              <p className="text-xs text-gray-300/90 mt-0.5">
                {currentPackage.description}
              </p>
            )}
            {packageExpiresAt && !isFree && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-200">
                <Calendar className="w-3.5 h-3.5 text-amber-300" />
                Expires {format(new Date(packageExpiresAt), "PP")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-gray-800 overflow-x-auto scrollbar-none">
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
                  ? "text-white border-indigo-500"
                  : "text-gray-500 border-transparent hover:text-white"
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.key === "history" && subscriptions.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-800 text-gray-300 tabular-nums">
                  {subscriptions.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === "overview" && (
        <OverviewTab
          isFree={isFree}
          currentPackage={currentPackage}
          packageTier={packageTier}
          hasActivePaidSubscription={hasActivePaidSubscription}
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
                  Cancel subscription?
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Your plan stays active until {packageExpiresAt
                    ? format(new Date(packageExpiresAt), "PP")
                    : "the end of the period"}, then drops to FREE. No refund
                  for the remaining time.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-sm font-bold disabled:opacity-50"
              >
                Keep plan
              </button>
              <button
                onClick={cancel}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Cancel
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
  onCancelClick,
}: {
  isFree: boolean;
  currentPackage: PackageData | null;
  packageTier: string;
  hasActivePaidSubscription: boolean;
  onCancelClick: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Benefits checklist */}
      {currentPackage && (
        <section className="glass rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-3 flex items-center gap-1.5">
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
                className="flex items-start gap-2 text-sm text-gray-200"
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
          <p className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-3 flex items-center gap-1.5">
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
              value={`$${currentPackage.minWithdrawal.toFixed(2)}`}
              tone="emerald"
            />
            <PowerCell
              icon={Crown}
              label="Monthly price"
              value={
                currentPackage.priceMonthly === 0
                  ? "Free"
                  : `$${currentPackage.priceMonthly.toFixed(2)}/mo`
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
          className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 text-white font-bold hover:scale-[1.01] transition-transform"
        >
          <CreditCard className="w-4 h-4" />
          {isFree ? "Upgrade Plan" : "Change Plan"}
          <ArrowUpRight className="w-4 h-4" />
        </Link>

        {hasActivePaidSubscription && !isFree && (
          <button
            onClick={onCancelClick}
            className="w-full py-2.5 rounded-xl bg-gray-800 hover:bg-red-500/15 hover:text-red-400 text-gray-400 text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <XCircle className="w-4 h-4" />
            Cancel subscription
          </button>
        )}
      </div>

      {/* Tier ladder */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <p className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-3">
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
                    ? "border-indigo-500/50 bg-indigo-500/10"
                    : isPast
                      ? "border-emerald-500/20 bg-gray-950"
                      : "border-gray-800 bg-gray-950/50 opacity-70"
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
                        : "text-gray-400"
                  )}
                >
                  {t}
                </span>
                {isCurrent && (
                  <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-indigo-500 text-white font-bold">
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
        <Receipt className="w-10 h-10 text-gray-600 mx-auto mb-2" />
        <p className="text-sm font-bold text-white">No billing history yet</p>
        <p className="text-xs text-gray-500 mt-1">
          Once you upgrade to a paid plan, your subscription history will
          appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl divide-y divide-gray-800">
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
                  <span className="text-[10px] text-indigo-400">
                    · auto-renew
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500">
                {format(new Date(s.startDate), "PP")} →{" "}
                {format(new Date(s.endDate), "PP")}
                {s.paymentMethod && ` · ${s.paymentMethod}`}
              </p>
            </div>
            <span className="text-sm font-bold text-emerald-400 tabular-nums">
              ${s.amount.toFixed(2)}
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
    indigo: "text-indigo-400",
    purple: "text-purple-400",
    amber: "text-amber-400",
    emerald: "text-emerald-400",
  } as const;
  return (
    <div className="rounded-lg bg-gray-950 border border-gray-800 p-3">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("w-3.5 h-3.5", tones[tone])} />
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
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
