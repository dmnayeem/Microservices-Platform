import { cn } from "@/lib/utils";
import { Coins, DollarSign, ArrowUpRight, Megaphone, Plus } from "lucide-react";
import Link from "next/link";

interface BalanceCardProps {
  points: number;
  cash: number;
  /** Non-withdrawable ad credit (USD). When set, a third tile + top-up action show. */
  adCredit?: number;
  packageTier?: string;
  withdrawHref?: string;
  /** Where "Add funds" points (deposits). When set, an Add-funds action shows. */
  addFundsHref?: string;
  /** Where the ad-credit "Top up" points (advertiser page). */
  adTopUpHref?: string;
  className?: string;
  compact?: boolean;
  /** Admin-configurable points-per-$1 rate (default 1000). */
  pointsPerUsd?: number;
}

export function BalanceCard({
  points,
  cash,
  adCredit,
  packageTier,
  withdrawHref = "/withdrawal",
  addFundsHref,
  adTopUpHref = "/advertiser",
  className,
  compact = false,
  pointsPerUsd = 1000,
}: BalanceCardProps) {
  const ptInUsd = points / pointsPerUsd;
  const showAdCredit = adCredit !== undefined;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-linear-to-br from-indigo-600/25 via-violet-600/10 to-gray-900 p-5 elevate-2",
        className
      )}
    >
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-purple-500/20 blur-3xl pointer-events-none" />

      <div className="relative flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
            Total Balance
          </p>
          <p className="text-2xl font-extrabold text-white tabular-nums mt-0.5 truncate">
            ${(cash + ptInUsd).toFixed(2)}
          </p>
          <p className="text-[10px] text-gray-500">Cash + points value</p>
        </div>
        {packageTier && (
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold uppercase">
            {packageTier}
          </span>
        )}
      </div>

      <div className="relative grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-xl bg-gray-900/60 border border-gray-800 p-3">
          <div className="flex items-center gap-1.5 text-amber-400 mb-1">
            <Coins className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] uppercase tracking-wider font-bold">
              Points
            </span>
          </div>
          <p className="text-lg font-bold text-white tabular-nums truncate">
            {points.toLocaleString()}
          </p>
          <p className="text-[10px] text-gray-500">${ptInUsd.toFixed(2)}</p>
        </div>
        <div className="min-w-0 rounded-xl bg-gray-900/60 border border-gray-800 p-3">
          <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
            <DollarSign className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] uppercase tracking-wider font-bold">
              Cash
            </span>
          </div>
          <p className="text-lg font-bold text-white tabular-nums truncate">
            ${cash.toFixed(2)}
          </p>
          <p className="text-[10px] text-gray-500">Withdrawable</p>
        </div>

        {showAdCredit && (
          <div className="col-span-2 rounded-xl bg-gray-900/60 border border-gray-800 p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sky-400 mb-1">
                <Megaphone className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[10px] uppercase tracking-wider font-bold">
                  Ad Credit
                </span>
              </div>
              <p className="text-lg font-bold text-white tabular-nums">
                ${adCredit.toFixed(2)}
              </p>
              <p className="text-[10px] text-gray-500 truncate">Funds ad campaigns · non-withdrawable</p>
            </div>
            <Link
              href={adTopUpHref}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-semibold hover:bg-sky-500/25 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Top up
            </Link>
          </div>
        )}
      </div>

      {!compact && (
        <div className={cn("relative mt-3 grid gap-2", addFundsHref ? "grid-cols-2" : "grid-cols-1")}>
          {addFundsHref && (
            <Link
              href={addFundsHref}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-900/70 border border-gray-700 hover:border-emerald-500/40 text-white text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" /> Add funds
            </Link>
          )}
          <Link
            href={withdrawHref}
            className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-linear-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white text-sm font-semibold transition-opacity"
          >
            Withdraw <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
