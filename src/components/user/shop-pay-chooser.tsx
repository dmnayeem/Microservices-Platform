"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wallet, PiggyBank } from "lucide-react";
import { cn, usd } from "@/lib/utils";
import { addFundHref, BALANCE_INFO, type ShopSource } from "@/lib/pay-source";

/**
 * "Pay with" for products, services and courses: Cash or Ad Fund (default
 * Cash). Ad Points and Earn Points never appear — they can't buy these.
 * Reads both balances from GET /api/wallet and, when the chosen one is short,
 * says so — with an Add fund link (pre-filled, returns here) for Ad Fund.
 */

export type ShopBalances = { cash: number; adFund: number };

export function useShopBalances(): ShopBalances | null {
  const [b, setB] = useState<ShopBalances | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/wallet", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d) return;
        setB({
          cash: Number(d.balance?.cash ?? 0) || 0,
          adFund: Number(d.balance?.adFund ?? 0) || 0,
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return b;
}

export function ShopPayChooser({
  value,
  onChange,
  amountUsd,
  addFundUrl,
  className,
}: {
  value: ShopSource;
  onChange: (v: ShopSource) => void;
  /** What will be charged, when known — drives the "not enough" note. */
  amountUsd?: number | null;
  /** An `addFund` link the server sent back with a shortfall reply. */
  addFundUrl?: string | null;
  className?: string;
}) {
  const balances = useShopBalances();
  const pathname = usePathname() || "/";
  const need = amountUsd != null && Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : null;
  const have = balances ? (value === "AD_FUND" ? balances.adFund : balances.cash) : null;
  const short = need != null && have != null && have + 1e-9 < need ? need - have : 0;
  const fundLink =
    value !== "AD_FUND" ? null : addFundUrl || (short > 0 ? addFundHref(short, pathname) : null);

  const options: { key: ShopSource; label: string; amount: number | null; Icon: typeof Wallet }[] = [
    { key: "CASH", label: BALANCE_INFO.CASH.name, amount: balances?.cash ?? null, Icon: Wallet },
    { key: "AD_FUND", label: BALANCE_INFO.AD_FUND.name, amount: balances?.adFund ?? null, Icon: PiggyBank },
  ];

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-[10px] uppercase tracking-wider text-(--app-ink-3) font-bold">Pay with</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pay with">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={value === o.key}
            onClick={() => onChange(o.key)}
            className={cn(
              "app-press text-left rounded-lg border p-2.5 min-w-0",
              value === o.key
                ? "border-(--app-accent-edge) bg-(--app-cta)/10"
                : "border-(--app-line) bg-(--app-surface-2)/50"
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-bold text-(--app-ink)">
              <o.Icon className="w-3.5 h-3.5 shrink-0" /> {o.label}
            </span>
            <span className="mt-0.5 block text-[11px] text-(--app-ink-3) tabular-nums truncate">
              {o.amount == null ? "…" : usd(o.amount)}
            </span>
          </button>
        ))}
      </div>
      {short > 0 && (
        <p className="text-[11px] text-amber-400">
          Not enough {value === "AD_FUND" ? "Ad Fund" : "Cash"} — you need {usd(short)} more.
          {value === "CASH" && " Try Ad Fund, or convert Earn Points to Cash in your wallet."}
        </p>
      )}
      {fundLink && (
        <Link
          href={fundLink}
          className="inline-flex text-[11px] font-semibold text-(--app-accent-ink) hover:underline"
        >
          Add fund →
        </Link>
      )}
    </div>
  );
}
