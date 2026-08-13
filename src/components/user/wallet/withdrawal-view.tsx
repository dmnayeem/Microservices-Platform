"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, AlertTriangle, Loader2, Lock, Plus, ShieldCheck, Banknote, Clock } from "lucide-react";
import { BrandIcon } from "@/components/ui/brand-icon";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { BalanceCard } from "@/components/user/primitives/balance-card";
import { newIdempotencyKey } from "@/lib/idempotency-key";

interface PaymentMethod {
  id: string;
  type: string;
  label: string;
  isDefault: boolean;
}

interface WithdrawalViewProps {
  cashBalance: number;
  pointsBalance: number;
  /** Admin-configured minimum withdrawal (USD). */
  min: number;
  /** Admin-configured maximum withdrawal (USD). */
  max: number;
  /** Effective fee percentage (0–100), after any package discount. */
  feePct: number;
  /** Whether this user may withdraw (global switch + package feature). */
  withdrawalsEnabled: boolean;
  /** True when the lock is specifically because an active subscription is required. */
  subscriptionRequired: boolean;
  /** Admin-configured estimated payout time, e.g. "1-3 business days". */
  payoutMessage: string;
  methods: PaymentMethod[];
  kycStatus: string;
  requireKyc: boolean;
  /** Admin-configurable points-per-$1 rate (default 1000). */
  pointsPerUsd?: number;
}

export function WithdrawalView({
  cashBalance,
  pointsBalance,
  min,
  max,
  feePct,
  withdrawalsEnabled,
  subscriptionRequired,
  payoutMessage,
  methods,
  kycStatus,
  requireKyc,
  pointsPerUsd = 1000,
}: WithdrawalViewProps) {
  const router = useRouter();

  // Amount is a STRING so the field can be cleared/edited freely — binding a
  // number left a stuck leading "0" (e.g. "020"). Numeric value derives from it.
  const [amountStr, setAmountStr] = useState<string>(min > 0 ? String(min) : "");
  const amount = parseFloat(amountStr) || 0;
  const [methodId, setMethodId] = useState(
    methods.find((m) => m.isDefault)?.id ?? methods[0]?.id ?? ""
  );
  const [busy, setBusy] = useState(false);

  const onAmountChange = (raw: string) => {
    // Digits + a single decimal point, and no leading zeros ("020" → "20",
    // but keep "0" and "0.5").
    let s = raw.replace(/[^\d.]/g, "");
    const parts = s.split(".");
    if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
    s = s.replace(/^0+(?=\d)/, "");
    setAmountStr(s);
  };

  const fee = amount * (feePct / 100);
  const youReceive = Math.max(0, amount - fee);

  const kycLocked = requireKyc && kycStatus !== "APPROVED";
  const kycPending = kycStatus === "PENDING";
  const tooLow = amount < min;
  const tooHigh = amount > max;
  const overBalance = amount > cashBalance;
  const valid =
    withdrawalsEnabled &&
    !kycLocked &&
    amount > 0 &&
    !tooLow &&
    !tooHigh &&
    !overBalance &&
    !!methodId;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ amount, methodId }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Withdrawal request submitted", {
        description: `You'll receive your funds within ${payoutMessage} after approval.`,
      });
      router.push("/wallet?tab=transactions");
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
        <Banknote className="w-6 h-6 text-emerald-400" /> Withdraw
      </h1>

      <BalanceCard
        points={pointsBalance}
        cash={cashBalance}
        pointsPerUsd={pointsPerUsd}
        compact
      />

      {subscriptionRequired && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-300">
                Subscription required to withdraw
              </p>
              <p className="text-xs text-amber-400/80 mt-0.5">
                Withdrawals are only available with an active subscription.
                Subscribe to a plan to unlock cashing out your earnings.
              </p>
              <Link
                href="/packages"
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-gray-900 text-xs font-bold"
              >
                Get Subscription
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {!withdrawalsEnabled && !subscriptionRequired && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-300">
                Withdrawals locked
              </p>
              <p className="text-xs text-amber-400/80 mt-0.5">
                Withdrawals aren&apos;t available on your current plan. Upgrade to
                unlock cashing out your earnings.
              </p>
              <Link
                href="/packages"
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-gray-900 text-xs font-bold"
              >
                Upgrade Now
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {withdrawalsEnabled && kycLocked && (
        <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/30 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-indigo-300">
                {kycPending ? "KYC under review" : "Verify your identity to withdraw"}
              </p>
              <p className="text-xs text-indigo-200/80 mt-0.5">
                {kycPending
                  ? "Your KYC is being reviewed. Withdrawals unlock once it's approved."
                  : "Complete identity verification (KYC) to unlock withdrawals. Earning tasks are unaffected."}
              </p>
              {!kycPending && (
                <Link
                  href="/kyc"
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verify identity
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {withdrawalsEnabled && !kycLocked && (
        <>
          <div className="glass rounded-xl p-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Amount (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amountStr}
                  onChange={(e) => onAmountChange(e.target.value)}
                  placeholder={String(min)}
                  className="w-full pl-7 pr-3 py-2.5 bg-gray-950 border border-gray-700 rounded-lg text-white text-base font-bold tabular-nums focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] mt-1.5">
                <span className="text-gray-500">
                  Min: ${min.toLocaleString()} · Max: ${max.toLocaleString()}
                </span>
                <button
                  onClick={() =>
                    setAmountStr(String(Math.floor(Math.min(cashBalance, max) * 100) / 100))
                  }
                  className="text-indigo-400 font-semibold hover:text-indigo-300"
                >
                  Max
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-gray-950 border border-gray-800 p-3 text-xs space-y-1">
              <div className="flex justify-between text-gray-400">
                <span>Withdraw amount</span>
                <span className="tabular-nums">${amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Fee ({feePct.toFixed(1)}%)</span>
                <span className="tabular-nums text-red-400">
                  −${fee.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-white pt-1 border-t border-gray-800">
                <span>You receive</span>
                <span className="tabular-nums text-emerald-400">
                  ${youReceive.toFixed(2)}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              Funds arrive within{" "}
              <span className="text-gray-300 font-medium">{payoutMessage}</span>{" "}
              after approval.
            </p>
          </div>

          <div className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-white">Payment Method</p>
              <Link
                href="/payment-methods"
                className="inline-flex items-center gap-1 text-xs text-indigo-400"
              >
                <Plus className="w-3 h-3" />
                Add
              </Link>
            </div>
            {methods.length === 0 ? (
              <p className="text-xs text-gray-400">
                Add a payment method first.
              </p>
            ) : (
              <div className="space-y-1.5">
                {methods.map((m) => (
                  <label
                    key={m.id}
                    className={cn(
                      "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors",
                      methodId === m.id
                        ? "border-indigo-500 bg-indigo-500/5"
                        : "border-gray-700 hover:border-gray-600"
                    )}
                  >
                    <input
                      type="radio"
                      name="pm"
                      checked={methodId === m.id}
                      onChange={() => setMethodId(m.id)}
                      className="accent-indigo-500"
                    />
                    <BrandIcon brand={m.type} fallback="💳" colored className="w-4 h-4" />
                    <span className="flex-1 text-sm text-white">{m.label}</span>
                    {m.isDefault && (
                      <span className="text-[10px] font-bold text-emerald-400">
                        DEFAULT
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {amount > 0 && (tooLow || tooHigh || overBalance) && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-300">
                {overBalance
                  ? "Amount exceeds your available cash balance."
                  : tooLow
                    ? `Minimum withdrawal is $${min.toLocaleString()}.`
                    : `Maximum withdrawal is $${max.toLocaleString()}.`}
              </p>
            </div>
          )}

          <button
            disabled={!valid || busy}
            onClick={submit}
            className="w-full py-3 rounded-xl bg-linear-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUpRight className="w-4 h-4" />
            )}
            Submit Withdrawal Request
          </button>
        </>
      )}
    </div>
  );
}
