"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, Loader2, Sparkles, Crown, Zap, Shield, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { TIER_GRADIENT } from "@/lib/tiers";

type Tier = "FREE" | "STARTER" | "PRO" | "ELITE" | "VIP";
type Duration = "MONTHLY" | "QUARTERLY" | "YEARLY" | "LIFETIME";
type Method = "POINTS" | "CASH" | "CARD" | "BKASH" | "NAGAD" | "BINANCE";

// Hardcoded display sets per legacy tier slug. Falls back to the FREE entry
// when the plan slug isn't one of the original 5 (since admin can now create
// arbitrary slugs like "pro-monthly").
function tierVisualKey(slug: string): Tier {
  const upper = slug.toUpperCase();
  if (upper === "FREE" || upper === "STARTER" || upper === "PRO" || upper === "ELITE" || upper === "VIP") {
    return upper;
  }
  return "FREE";
}

interface PackageRow {
  id: string;
  /** Slug — free-form identifier, e.g. "free", "pro-monthly". */
  tier: string;
  name: string;
  description?: string;
  priceMonthly: number;
  priceYearly?: number;
  dailyTaskLimit: number;
  withdrawalFee: number;
}

interface PackagesViewProps {
  packages: PackageRow[];
  currentTier: string;
  cashBalance: number;
  pointsBalance: number;
}

const TIER_ICON: Record<Tier, React.ReactNode> = {
  FREE: <Shield className="w-5 h-5" />,
  STARTER: <Zap className="w-5 h-5" />,
  PRO: <Sparkles className="w-5 h-5" />,
  ELITE: <Crown className="w-5 h-5" />,
  VIP: <Crown className="w-5 h-5" />,
};

// NOTE: these marketing blurbs diverge from the real economics in
// @/lib/tiers (e.g. FREE advertises a "$5–$500 withdrawal range" but
// TIER_LIMITS.FREE is actually {min:0,max:0}). Kept local on purpose —
// reconciling the copy is a product decision, not a mechanical dedup.
const FEATURES: Record<Tier, string[]> = {
  FREE: ["$5–$500 withdrawal range", "1× earning multiplier", "0% fee discount", "Standard support"],
  STARTER: ["$5–$1,000 withdrawal", "1.1× multiplier", "10% fee discount", "Standard support"],
  PRO: ["$10–$5,000 withdrawal", "1.25× multiplier", "25% fee discount", "Priority support"],
  ELITE: ["$20–$25,000 withdrawal", "1.5× multiplier", "40% fee discount", "High priority support"],
  VIP: ["$50–$100,000 withdrawal", "2× multiplier", "50% fee discount", "Dedicated support"],
};

const DURATION_DISCOUNT: Record<Duration, number> = {
  MONTHLY: 0,
  QUARTERLY: 0.1,
  YEARLY: 0.2,
  LIFETIME: 0.5,
};

export function PackagesView({
  packages,
  currentTier,
  cashBalance,
  pointsBalance,
}: PackagesViewProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [duration, setDuration] = useState<Duration>("MONTHLY");
  const [method, setMethod] = useState<Method>("CASH");
  const [busy, setBusy] = useState(false);

  const selectedPkg = packages.find((p) => p.tier === selectedTier);

  const calcPrice = () => {
    if (!selectedPkg) return 0;
    const monthly = selectedPkg.priceMonthly;
    const months =
      duration === "MONTHLY"
        ? 1
        : duration === "QUARTERLY"
          ? 3
          : duration === "YEARLY"
            ? 12
            : 36;
    return monthly * months * (1 - DURATION_DISCOUNT[duration]);
  };

  const price = calcPrice();
  const ptCost = Math.ceil(price * 1000);
  const insufficientCash = method === "CASH" && cashBalance < price;
  const insufficientPts = method === "POINTS" && pointsBalance < ptCost;

  const purchase = async () => {
    if (!selectedPkg) return;
    setBusy(true);
    try {
      const res = await fetch("/api/packages/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({
          packageId: selectedPkg.id,
          duration,
          method,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();
      if (d.checkoutUrl) {
        window.location.href = d.checkoutUrl;
      } else {
        setStep(5);
      }
    } catch (err) {
      toast.error("Purchase failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-white">Upgrade Your Plan</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <div
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              step >= s ? "bg-indigo-500" : "bg-gray-800"
            )}
          />
        ))}
      </div>
      <p className="text-xs text-gray-400 text-center">
        Step {step} of 5:{" "}
        {step === 1
          ? "Choose plan"
          : step === 2
            ? "Choose duration"
            : step === 3
              ? "Choose payment"
              : step === 4
                ? "Review"
                : "Done"}
      </p>

      {step === 1 && (
        <div className="space-y-3">
          {packages.map((p) => {
            const isCurrent = p.tier === currentTier;
            const selected = p.tier === selectedTier;
            return (
              <button
                key={p.id}
                disabled={isCurrent}
                onClick={() => setSelectedTier(p.tier)}
                className={cn(
                  "w-full text-left rounded-2xl p-4 border transition-all",
                  selected
                    ? "border-indigo-500 bg-indigo-500/5 scale-[1.01]"
                    : "glass glass-hover border-transparent",
                  isCurrent && "opacity-60"
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl bg-linear-to-br text-white flex items-center justify-center shrink-0",
                      TIER_GRADIENT[tierVisualKey(p.tier)]
                    )}
                  >
                    {TIER_ICON[tierVisualKey(p.tier)]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-bold text-white">{p.name}</p>
                      {isCurrent && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500/20 text-emerald-400">
                          Current
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {p.description}
                      </p>
                    )}
                    <p className="text-xl font-extrabold text-white mt-2 tabular-nums">
                      ${p.priceMonthly.toFixed(2)}
                      <span className="text-xs text-gray-400 font-normal">
                        /mo
                      </span>
                    </p>
                  </div>
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-1 text-[11px]">
                  {FEATURES[tierVisualKey(p.tier)].map((f: string) => (
                    <li
                      key={f}
                      className="inline-flex items-start gap-1 text-gray-300"
                    >
                      <Check className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
          <button
            disabled={!selectedTier}
            onClick={() => setStep(2)}
            className="w-full py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {step === 2 && selectedPkg && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(["MONTHLY", "QUARTERLY", "YEARLY", "LIFETIME"] as const).map((d) => {
              const months =
                d === "MONTHLY" ? 1 : d === "QUARTERLY" ? 3 : d === "YEARLY" ? 12 : 36;
              const total =
                selectedPkg.priceMonthly * months * (1 - DURATION_DISCOUNT[d]);
              const discount = DURATION_DISCOUNT[d];
              return (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-colors",
                    duration === d
                      ? "border-indigo-500 bg-indigo-500/5"
                      : "border-gray-800 bg-gray-900"
                  )}
                >
                  <p className="text-sm font-bold text-white capitalize">
                    {d.toLowerCase()}
                  </p>
                  <p className="text-lg font-extrabold text-white tabular-nums mt-1">
                    ${total.toFixed(2)}
                  </p>
                  {discount > 0 && (
                    <p className="text-[10px] font-bold text-emerald-400">
                      Save {discount * 100}%
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-3 rounded-xl bg-gray-800 text-white font-bold"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-3 rounded-xl bg-indigo-500 text-white font-bold"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {(
            [
              { value: "CASH", label: "Cash Balance", info: `Avail: $${cashBalance.toFixed(2)}` },
              { value: "POINTS", label: "Points", info: `Avail: ${pointsBalance.toLocaleString()} pts` },
              { value: "CARD", label: "Credit Card", info: "Stripe" },
              { value: "BKASH", label: "bKash", info: "Mobile" },
              { value: "NAGAD", label: "Nagad", info: "Mobile" },
              { value: "BINANCE", label: "Binance Pay", info: "Crypto" },
            ] as const
          ).map((m) => (
            <label
              key={m.value}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                method === m.value
                  ? "border-indigo-500 bg-indigo-500/5"
                  : "border-gray-800 bg-gray-900"
              )}
            >
              <input
                type="radio"
                checked={method === m.value}
                onChange={() => setMethod(m.value)}
                className="accent-indigo-500"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{m.label}</p>
                <p className="text-[11px] text-gray-500">{m.info}</p>
              </div>
            </label>
          ))}
          {["CARD", "BKASH", "NAGAD", "BINANCE"].includes(method) && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-200">
              Fastest: <Link href="/deposit" className="font-bold underline">add funds to your wallet</Link> via
              Binance / bKash / manual, then pay with <b>Cash Balance</b>. Otherwise an admin verifies your
              payment before activating.
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-3 rounded-xl bg-gray-800 text-white font-bold"
            >
              Back
            </button>
            <button
              onClick={() => setStep(4)}
              className="flex-1 py-3 rounded-xl bg-indigo-500 text-white font-bold"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 4 && selectedPkg && (
        <div className="space-y-3">
          <div className="glass rounded-2xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Plan</span>
              <span className="font-bold text-white">{selectedPkg.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Duration</span>
              <span className="font-bold text-white capitalize">
                {duration.toLowerCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Payment Method</span>
              <span className="font-bold text-white">{method}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-800">
              <span className="text-gray-300 font-semibold">Total</span>
              <span className="font-extrabold text-emerald-400 text-lg tabular-nums">
                {method === "POINTS"
                  ? `${ptCost.toLocaleString()} pts`
                  : `$${price.toFixed(2)}`}
              </span>
            </div>
          </div>
          {(insufficientCash || insufficientPts) && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 flex items-start gap-2">
              <Lock className="w-4 h-4 text-red-400 mt-0.5" />
              <p className="text-xs text-red-300">
                Insufficient {method === "CASH" ? "cash balance" : "points"}.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-3 rounded-xl bg-gray-800 text-white font-bold"
            >
              Back
            </button>
            <button
              disabled={busy || insufficientCash || insufficientPts}
              onClick={purchase}
              className="flex-1 py-3 rounded-xl bg-linear-to-r from-emerald-500 to-teal-500 text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Confirm Purchase"
              )}
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="text-center py-8">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
            <Check className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">
            Welcome to {selectedPkg?.name}!
          </h2>
          <p className="text-gray-400 mb-6">
            Your upgrade is active. Enjoy your new benefits.
          </p>
          <button
            onClick={() => router.push("/my-package")}
            className="px-5 py-2.5 rounded-lg bg-indigo-500 text-white font-bold"
          >
            View My Package
          </button>
        </div>
      )}
    </div>
  );
}
