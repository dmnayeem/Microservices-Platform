"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn, usd } from "@/lib/utils";
import { addFundHref, adPointsToUsd, type PaySource } from "@/lib/pay-source";

/**
 * The "pay with Ad Points or Ad Fund" chooser shared by every platform
 * purchase (spotlight, lottery, promotions, badge, plans, ad credit, task
 * credit). Earn Points and Cash are never offered here — owner, 2026-10-16.
 */

export interface SpendBalances {
  adPoints: number;
  adFundUsd: number;
  /** $1 = rate Ad Points. */
  rate: number;
  cashUsd: number;
}

/** Reads the member's spend balances from GET /api/wallet. */
export function useSpendBalances(): { balances: SpendBalances | null; reload: () => void } {
  const [balances, setBalances] = useState<SpendBalances | null>(null);
  const reload = useCallback(() => {
    fetch("/api/wallet", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.balance) return;
        setBalances({
          adPoints: Number(d.balance.adPoints ?? 0),
          adFundUsd: Number(d.balance.adFund ?? 0),
          rate: Number(d.balance.adPointsPerUsd ?? 100) || 100,
          cashUsd: Number(d.balance.cash ?? 0),
        });
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);
  return { balances, reload };
}

export function PaySourcePicker({
  adPoints,
  usdPrice,
  balances,
  value,
  onChange,
  className,
}: {
  /** Price in Ad Points. */
  adPoints: number;
  /**
   * The Ad Fund price when the item has its own dollar price (quotePlatformPrice
   * with usdFixed). Omitted = the Ad Points price at the rate.
   */
  usdPrice?: number;
  balances: SpendBalances | null;
  /** null = not chosen yet (the server then uses whichever covers it). */
  value: PaySource | null;
  onChange: (v: PaySource) => void;
  className?: string;
}) {
  // Pre-select whichever balance covers the price, once balances arrive.
  useEffect(() => {
    if (value || !balances) return;
    const need = usdPrice ?? adPointsToUsd(adPoints, balances.rate);
    const d =
      balances.adPoints >= Math.ceil(adPoints) ? "AD_POINTS" : balances.adFundUsd + 1e-9 >= need ? "AD_FUND" : null;
    if (d) onChange(d);
  }, [value, balances, adPoints, usdPrice, onChange]);

  if (!balances) return null;
  const needUsd = usdPrice ?? adPointsToUsd(adPoints, balances.rate);
  const opts: { key: PaySource; label: string; price: string; have: string; ok: boolean }[] = [
    {
      key: "AD_POINTS",
      label: "Ad Points",
      price: `${Math.ceil(adPoints).toLocaleString()} Ad Points`,
      have: `You have ${balances.adPoints.toLocaleString()}`,
      ok: balances.adPoints >= Math.ceil(adPoints),
    },
    {
      key: "AD_FUND",
      label: "Ad Fund",
      price: usd(needUsd),
      have: `You have ${usd(balances.adFundUsd)}`,
      ok: balances.adFundUsd + 1e-9 >= needUsd,
    },
  ];
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-xs font-semibold text-(--app-ink-2)">Pay with</p>
      <div className="grid grid-cols-2 gap-2">
        {opts.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={value === o.key}
            onClick={() => onChange(o.key)}
            className={cn(
              "app-press min-w-0 rounded-lg border p-2 text-left",
              value === o.key
                ? "border-(--app-accent-edge) bg-(--app-nav-wash)"
                : "border-(--app-line) bg-(--app-surface-2)"
            )}
          >
            <span className="block text-xs font-bold text-white">{o.label}</span>
            <span className="block text-sm font-black tabular-nums text-(--app-ink)">{o.price}</span>
            <span className={cn("block text-[11px]", o.ok ? "text-(--app-ink-3)" : "text-amber-400")}>
              {o.ok ? o.have : `${o.have} — not enough`}
            </span>
          </button>
        ))}
      </div>
      {!opts[0].ok && !opts[1].ok && (
        <Link
          href={addFundHref(Math.max(0, needUsd - balances.adFundUsd), currentPath())}
          className="inline-flex items-center gap-1 text-xs font-bold text-(--app-accent-ink) hover:underline"
        >
          <Plus className="h-3 w-3" /> Add fund
        </Link>
      )}
    </div>
  );
}

export interface PayErrorState {
  message: string;
  addFund?: string;
}

/** An insufficient-balance message with its "Add fund" link (from the API's `addFund`). */
export function PayErrorNote({ error, className }: { error: PayErrorState | null; className?: string }) {
  if (!error) return null;
  return (
    <div role="alert" className={cn("rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200", className)}>
      {error.message}
      {error.addFund && (
        <Link href={error.addFund} className="ml-1 font-bold text-white underline-offset-2 hover:underline">
          Add fund →
        </Link>
      )}
    </div>
  );
}

function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

/** The same choice without a single price (pages with several buy buttons). */
export function PaySourceToggle({
  balances,
  value,
  onChange,
  className,
}: {
  balances: SpendBalances | null;
  value: PaySource | null;
  onChange: (v: PaySource) => void;
  className?: string;
}) {
  if (!balances) return null;
  const opts: { key: PaySource; label: string; have: string }[] = [
    { key: "AD_POINTS", label: "Ad Points", have: balances.adPoints.toLocaleString() },
    { key: "AD_FUND", label: "Ad Fund", have: usd(balances.adFundUsd) },
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-xs", className)}>
      <span className="font-semibold text-(--app-ink-2)">Pay with</span>
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "app-press rounded-full border px-3 py-1.5 font-bold",
            value === o.key
              ? "border-(--app-accent-edge) bg-(--app-nav-wash) text-(--app-nav-on)"
              : "border-(--app-line) bg-(--app-surface-2) text-(--app-ink-2)"
          )}
        >
          {o.label} · {o.have}
        </button>
      ))}
      <Link href={addFundHref(undefined, currentPath())} className="font-bold text-(--app-accent-ink) hover:underline">
        Add fund
      </Link>
    </div>
  );
}
