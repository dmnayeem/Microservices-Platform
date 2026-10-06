"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, Loader2, Lock } from "lucide-react";
import { cn, usd } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { PlanCardView, type PlanCardData } from "@/components/plans/plan-display";
import { BrandIcon } from "@/components/ui/brand-icon";
import { ProofImageUpload } from "@/components/user/tasks/proof-image-upload";
import {
  isFreePlan,
  planDurations,
  planPriceUsd,
  planSavingFraction,
} from "@/lib/plan-pricing";

type Duration = "MONTHLY" | "QUARTERLY" | "YEARLY" | "LIFETIME";
type Method = "POINTS" | "CASH" | "CARD" | "BKASH" | "NAGAD" | "BINANCE" | "BITGET";

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
  /** The id of the plan the user is effectively on right now (robust "Current"). */
  currentPackageId?: string | null;
  cashBalance: number;
  pointsBalance: number;
  /**
   * Points per USD, from the admin-configurable setting. REQUIRED on purpose —
   * this used to be a hardcoded ×1000 while the purchase endpoint charged at
   * `getPointsPerUsd()`, so changing the rate quoted the user one point price
   * and took another.
   */
  pointsPerUsd: number;
  /** Plan cards + comparison, from lib/plans-display (real plan columns). */
  cards: PlanCardData[];
}

/** A free/default plan — the same definition the purchase API uses. */
function isFreePkg(p: PackageRow): boolean {
  return isFreePlan(p);
}

const OFF_PLATFORM: Method[] = ["CARD", "BKASH", "NAGAD", "BINANCE", "BITGET"];

/** The server's quote: price, credit for the plan being replaced, the charge. */
interface Quote {
  priceUsd: number;
  creditUsd: number;
  payUsd: number;
  payPoints: number;
  samePlan: boolean;
  switching: boolean;
  endDate: string;
  cardAvailable: boolean;
}

export function PackagesView({
  packages,
  currentTier,
  currentPackageId,
  cashBalance,
  pointsBalance,
  pointsPerUsd,
  cards,
}: PackagesViewProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [duration, setDuration] = useState<Duration>("MONTHLY");
  const [method, setMethod] = useState<Method>("CASH");
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  // ONE key per intended purchase: made when the review step opens and reused
  // by every click on Confirm, so a double click / retry replays the first
  // request instead of buying twice. Renewed only after a refused request, so
  // a corrected retry (topped-up wallet, fixed txn id) is not stuck replaying.
  const [purchaseKey, setPurchaseKey] = useState<string | null>(null);

  const selectedPkg = packages.find((p) => p.tier === selectedTier);
  const isOffPlatform = OFF_PLATFORM.includes(method);

  // Price from the shared plan math; the server quote (below) adds any credit
  // for the plan being replaced and is what Confirm actually charges.
  const listPrice = selectedPkg ? (planPriceUsd(selectedPkg, duration) ?? 0) : 0;
  const price = quote ? quote.payUsd : listPrice;
  const ptCost = quote ? quote.payPoints : Math.ceil(price * pointsPerUsd);
  const insufficientCash = method === "CASH" && cashBalance < price;
  const insufficientPts = method === "POINTS" && pointsBalance < ptCost;
  const offPlatformIncomplete =
    isOffPlatform && (transactionId.trim().length < 4 || !proofUrl);

  // Fetch the quote whenever plan / duration / method change past step 1.
  useEffect(() => {
    if (!selectedPkg || step < 2 || isFreePkg(selectedPkg)) return;
    let cancelled = false;
    const qs = new URLSearchParams({ packageId: selectedPkg.id, duration, method });
    fetch(`/api/packages/purchase?${qs}`, { cache: "no-store" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!cancelled) setQuote(ok ? (d as Quote) : null);
      })
      .catch(() => {
        if (!cancelled) setQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPkg, duration, method, step]);

  // A plan sold only yearly (or a duration no longer valid) snaps to one it has.
  useEffect(() => {
    if (selectedPkg && !planDurations(selectedPkg).includes(duration)) {
      setDuration(planDurations(selectedPkg)[0]);
    }
  }, [selectedPkg, duration]);

  // Card is offered only while a payment gateway is configured.
  const cardAvailable = quote?.cardAvailable ?? false;
  useEffect(() => {
    if (method === "CARD" && quote && !quote.cardAvailable) setMethod("CASH");
  }, [method, quote]);

  const openReview = () => {
    setPurchaseKey(newIdempotencyKey());
    setStep(4);
  };

  const purchaseFree = async (slug: string) => {
    const pkg = packages.find((x) => x.tier === slug);
    if (!pkg) return;
    setBusy(true);
    try {
      const res = await fetch("/api/packages/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ packageId: pkg.id, duration: "MONTHLY", method: "CASH" }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStep(5);
    } catch (err) {
      toast.error("Could not switch plan", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const purchase = async () => {
    if (!selectedPkg) return;
    setBusy(true);
    const key = purchaseKey ?? newIdempotencyKey();
    if (!purchaseKey) setPurchaseKey(key);
    try {
      const res = await fetch("/api/packages/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({
          packageId: selectedPkg.id,
          duration,
          method,
          ...(isOffPlatform ? { transactionId: transactionId.trim(), proofUrl } : {}),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A refused request is memoized under its key — use a new one next time.
        setPurchaseKey(newIdempotencyKey());
        throw new Error(d.details ? `${d.error} — ${d.details}` : d.error || "Try again");
      }
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
              step >= s ? "bg-(--app-cta)" : "bg-(--app-surface-2)"
            )}
          />
        ))}
      </div>
      <p className="text-xs text-(--app-ink-3) text-center">
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
        <div className="space-y-6">
          <div className="grid gap-5 pt-3 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((c, i) => {
              const p = packages.find((x) => x.id === c.id);
              const isCurrent = currentPackageId ? c.id === currentPackageId : c.slug === currentTier;
              const free = p ? isFreePkg(p) : c.priceMonthly <= 0;
              return (
                <PlanCardView
                  key={c.id}
                  plan={c}
                  index={i}
                  variant="app"
                  current={isCurrent}
                  selected={c.slug === selectedTier}
                  footer={
                    <button
                      type="button"
                      disabled={isCurrent || busy || !p}
                      onClick={() => {
                        setSelectedTier(c.slug);
                        if (free) {
                          // Free activates straight away (no duration/payment).
                          setTimeout(() => void purchaseFree(c.slug), 0);
                        } else {
                          setStep(2);
                        }
                      }}
                      className={cn(
                        "inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-colors disabled:opacity-60",
                        c.isPopular
                          ? "bg-(--app-cta) text-(--app-on-cta) hover:opacity-90"
                          : "bg-(--app-surface-2) text-(--app-ink) hover:bg-(--app-cta)/15"
                      )}
                    >
                      {isCurrent ? (
                        "Your current plan"
                      ) : busy && c.slug === selectedTier ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          {free ? "Switch to Free" : `Choose ${c.name}`}
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  }
                />
              );
            })}
          </div>

        </div>
      )}

      {step === 2 && selectedPkg && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {planDurations(selectedPkg).map((d) => {
              const total = planPriceUsd(selectedPkg, d) ?? 0;
              const discount = planSavingFraction(selectedPkg, d);
              return (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-colors",
                    duration === d
                      ? "border-(--app-accent-edge) bg-(--app-cta)/5"
                      : "border-(--app-line) bg-(--app-surface)"
                  )}
                >
                  <p className="text-sm font-bold text-white capitalize">
                    {d.toLowerCase()}
                  </p>
                  <p className="text-lg font-extrabold text-white tabular-nums mt-1">
                    {usd(total)}
                  </p>
                  {discount > 0 && (
                    <p className="text-[10px] font-bold text-emerald-400">
                      Save {Math.round(discount * 100)}%
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-3 rounded-xl bg-(--app-surface-2) text-(--app-ink) font-bold"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-3 rounded-xl bg-(--app-cta) text-(--app-on-cta) font-bold"
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
              { value: "CASH", label: "Cash Balance", info: `Avail: ${usd(cashBalance)}` },
              { value: "POINTS", label: "Points", info: `Avail: ${pointsBalance.toLocaleString()} pts` },
              { value: "CARD", label: "Credit Card", info: "Stripe" },
              { value: "BKASH", label: "bKash", info: "Mobile" },
              { value: "NAGAD", label: "Nagad", info: "Mobile" },
              { value: "BINANCE", label: "Binance Pay", info: "Crypto" },
              { value: "BITGET", label: "Bitget", info: "Crypto" },
            ] as const
          ).filter((m) => m.value !== "CARD" || cardAvailable).map((m) => (
            <label
              key={m.value}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                method === m.value
                  ? "border-(--app-accent-edge) bg-(--app-cta)/5"
                  : "border-(--app-line) bg-(--app-surface)"
              )}
            >
              <input
                type="radio"
                checked={method === m.value}
                onChange={() => setMethod(m.value)}
                className="accent-(--app-cta)"
              />
              {m.value !== "CASH" && m.value !== "POINTS" && (
                <BrandIcon brand={m.value} colored className="w-5 h-5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{m.label}</p>
                <p className="text-[11px] text-(--app-ink-3)">{m.info}</p>
              </div>
            </label>
          ))}
          {isOffPlatform && (
            <div className="space-y-2">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-200">
                Fastest: <Link href="/deposit" className="font-bold underline">add funds to your wallet</Link> via
                Binance / bKash / manual, then pay with <b>Cash Balance</b>. Otherwise send the payment, then
                enter its transaction ID and upload a screenshot — an admin verifies it before activating.
                {quote?.switching && " Credit for your current plan applies to Cash / Points payments only."}
              </div>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="Transaction ID of your payment"
                maxLength={120}
                className="w-full rounded-xl border border-(--app-line) bg-(--app-surface) px-3 py-2.5 text-sm text-white placeholder:text-(--app-ink-3)"
              />
              <ProofImageUpload
                value={proofUrl}
                onChange={setProofUrl}
                placeholder="Upload a screenshot of your payment"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-3 rounded-xl bg-(--app-surface-2) text-(--app-ink) font-bold"
            >
              Back
            </button>
            <button
              onClick={openReview}
              disabled={offPlatformIncomplete}
              className="flex-1 py-3 rounded-xl bg-(--app-cta) text-(--app-on-cta) font-bold disabled:opacity-50"
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
              <span className="text-(--app-ink-3)">Plan</span>
              <span className="font-bold text-white">{selectedPkg.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-(--app-ink-3)">Duration</span>
              <span className="font-bold text-white capitalize">
                {duration.toLowerCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-(--app-ink-3)">Payment Method</span>
              <span className="font-bold text-white">{method}</span>
            </div>
            {quote && quote.creditUsd > 0 && !isOffPlatform && (
              <>
                <div className="flex justify-between">
                  <span className="text-(--app-ink-3)">Plan price</span>
                  <span className="font-bold text-white tabular-nums">{usd(quote.priceUsd)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-(--app-ink-3)">Credit for unused time on your current plan</span>
                  <span className="font-bold text-emerald-400 tabular-nums">-{usd(quote.creditUsd)}</span>
                </div>
              </>
            )}
            {quote?.switching && (
              <p className="text-[11px] text-amber-300">
                Your current plan ends now and the new one starts today. Unused time is only ever
                taken off this price - it is never paid out or added as extra days.
              </p>
            )}
            {quote?.samePlan && (
              <p className="text-[11px] text-(--app-ink-3)">
                Added on top of your current plan - it runs until{" "}
                {new Date(quote.endDate).toLocaleDateString()}.
              </p>
            )}
            <div className="flex justify-between pt-2 border-t border-(--app-line)">
              <span className="text-(--app-ink-2) font-semibold">Total</span>
              <span className="font-extrabold text-emerald-400 text-lg tabular-nums">
                {method === "POINTS"
                  ? `${ptCost.toLocaleString()} pts`
                  : `${usd(price)}`}
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
              className="flex-1 py-3 rounded-xl bg-(--app-surface-2) text-(--app-ink) font-bold"
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
            {isOffPlatform && selectedPkg && !isFreePkg(selectedPkg)
              ? "Request sent"
              : `Welcome to ${selectedPkg?.name}!`}
          </h2>
          <p className="text-(--app-ink-3) mb-6">
            {isOffPlatform && selectedPkg && !isFreePkg(selectedPkg)
              ? "An admin will check your payment and activate the plan shortly."
              : "Your upgrade is active. Enjoy your new benefits."}
          </p>
          <button
            onClick={() => router.push("/my-package")}
            className="px-5 py-2.5 rounded-lg bg-(--app-cta) text-(--app-on-cta) font-bold"
          >
            View My Package
          </button>
        </div>
      )}
    </div>
  );
}
