"use client";

import { Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { allocated, splitBudget, SPLIT_LABEL, type SplitMode } from "@/lib/prize-split";

/**
 * The budget line above a list of prizes: how much of the budget is given out,
 * how much is left, and one-click splits. Used by the leaderboard pools and
 * the fixed lottery prizes.
 */
export function PrizeSplitBar({
  total,
  count,
  amounts,
  onSplit,
  disabled,
  unit = "pts",
}: {
  total: number;
  count: number;
  amounts: number[];
  onSplit: (amounts: number[]) => void;
  disabled?: boolean;
  unit?: string;
}) {
  const given = allocated(amounts.slice(0, count));
  const left = total - given;
  const pct = total > 0 ? Math.min(100, (given / total) * 100) : 0;
  const over = left < 0;

  return (
    <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <span className="text-slate-400">
          Given out{" "}
          <span className="font-bold text-white tabular-nums">{given.toLocaleString()}</span> of{" "}
          <span className="font-bold text-white tabular-nums">{total.toLocaleString()}</span> {unit}
        </span>
        <span
          className={cn(
            "font-bold tabular-nums",
            over ? "text-red-400" : left === 0 ? "text-emerald-400" : "text-amber-300"
          )}
        >
          {over
            ? `${Math.abs(left).toLocaleString()} ${unit} OVER the budget`
            : left === 0
              ? "Fully allocated"
              : `${left.toLocaleString()} ${unit} left to give`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn("h-full rounded-full", over ? "bg-red-500" : left === 0 ? "bg-emerald-500" : "bg-amber-400")}
          style={{ width: `${over ? 100 : pct}%` }}
        />
      </div>
      {!disabled && count > 0 && total > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Wand2 className="h-3 w-3" /> Split {total.toLocaleString()} between {count}:
          </span>
          {(Object.keys(SPLIT_LABEL) as SplitMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onSplit(splitBudget(total, count, m))}
              className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
            >
              {SPLIT_LABEL[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
