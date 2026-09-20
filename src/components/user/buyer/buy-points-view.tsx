"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Wallet,
  Loader2,
  ArrowRight,
  Info,
  Plus,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, usd, pts } from "@/lib/utils";
import { TASK_CREDIT } from "@/lib/task-credit-theme";

/** Ready-made amounts, so the common case is one tap rather than typing. */
const PRESETS = [5_000, 10_000, 25_000, 50_000, 100_000];

export function BuyPointsView({
  cashBalance,
  taskCredit,
  pointsPerUsd,
  minPoints,
  maxPoints,
}: {
  cashBalance: number;
  taskCredit: number;
  pointsPerUsd: number;
  minPoints: number;
  maxPoints: number;
}) {
  const router = useRouter();
  const [points, setPoints] = useState(Math.max(minPoints, 10_000));
  const [busy, setBusy] = useState(false);

  const rate = pointsPerUsd > 0 ? pointsPerUsd : 1000;
  const costUsd = points / rate;
  const affordablePoints = Math.floor(cashBalance * rate);

  const error =
    points < minPoints
      ? `The smallest purchase is ${pts(minPoints)} points.`
      : points > maxPoints
        ? `You can buy at most ${pts(maxPoints)} points at a time.`
        : costUsd > cashBalance
          ? `You need ${usd(costUsd - cashBalance)} more in your wallet.`
          : null;

  const buy = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/task-credit/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: Math.floor(points) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Purchase failed");
      toast.success(`${pts(data.points)} task credit added`, {
        description: `Balance: ${pts(data.balance)} points`,
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-white">
          <Sparkles className={cn("h-6 w-6", TASK_CREDIT.text)} />
          Buy {TASK_CREDIT.label}
        </h1>
        <p className="mt-0.5 text-sm text-(--app-ink-3)">
          What you spend to run tasks. Separate from the points you earn.
        </p>
      </header>

      {/* Balances — the two pots, side by side, so the difference is obvious. */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className={cn(
            "rounded-xl border p-3",
            TASK_CREDIT.border,
            TASK_CREDIT.bg
          )}
        >
          <div className={cn("flex items-center gap-1.5", TASK_CREDIT.text)}>
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {TASK_CREDIT.label}
            </span>
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums text-white">
            {pts(taskCredit)}
          </p>
          <p className="text-[10px] text-(--app-ink-3)">{TASK_CREDIT.blurb}</p>
        </div>
        <div className="rounded-xl border border-(--app-line) bg-(--app-surface)/60 p-3">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <Wallet className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Wallet
            </span>
          </div>
          <p className="mt-1 text-lg font-bold tabular-nums text-white">
            {usd(cashBalance)}
          </p>
          <p className="text-[10px] text-(--app-ink-3)">
            buys {pts(affordablePoints)} pts
          </p>
        </div>
      </div>

      <div className="glass space-y-4 rounded-xl p-4">
        <div>
          <label className="mb-2 block text-xs font-medium text-(--app-ink-3)">
            How many points?
          </label>
          <div className="mb-2 flex flex-wrap gap-2">
            {PRESETS.filter((v) => v >= minPoints && v <= maxPoints).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setPoints(v)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  points === v
                    ? cn(TASK_CREDIT.border, TASK_CREDIT.bgStrong, TASK_CREDIT.textStrong)
                    : "border-(--app-line) text-(--app-ink-3) hover:text-white"
                )}
              >
                {pts(v)}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={minPoints}
            max={maxPoints}
            step={100}
            value={points}
            onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
            className="w-full rounded-lg border border-(--app-line) bg-(--app-page) px-4 py-2.5 text-(--app-ink) focus:border-violet-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5 border-t border-white/10 pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-(--app-ink-3)">
              {pts(points)} points at {pts(rate)} per $1
            </span>
            <span className="tabular-nums text-(--app-ink)">{usd(costUsd)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span className="text-white">Charged to your wallet</span>
            <span className="tabular-nums text-white">{usd(costUsd)}</span>
          </div>
          <p className="pt-1 text-[11px] leading-relaxed text-(--app-ink-3)">
            No fee to buy. The platform fee, if any, is charged per completion
            and is shown on the task page before you publish.
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            {error}
          </p>
        )}

        <button
          onClick={buy}
          disabled={busy || !!error}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50",
            TASK_CREDIT.solid
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Buy {pts(points)} points
        </button>

        {costUsd > cashBalance && (
          <Link
            href="/deposit"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-(--app-line) py-2.5 text-sm font-semibold text-white hover:border-emerald-500/40"
          >
            <Plus className="h-4 w-4" /> Add funds to your wallet
          </Link>
        )}
      </div>

      {/*
        Said plainly, because it is the thing people get wrong: this balance is
        not the balance they earn from, and it does not come back out as money.
      */}
      <div className="flex gap-2 rounded-xl border border-(--app-line) bg-(--app-page)/50 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-(--app-ink-3)" />
        <div className="space-y-1 text-[11px] leading-relaxed text-(--app-ink-3)">
          <p>
            <span className={TASK_CREDIT.textStrong}>{TASK_CREDIT.label}</span>{" "}
            is only for funding tasks. It cannot be converted to cash or
            withdrawn, and it is never mixed with the points you earn from
            completing tasks yourself.
          </p>
          <p>
            Credit is charged as your tasks are completed, not when you create
            them: advertise to 100 people and only 10 finish, and you pay for
            10. Nothing is held or reserved, so there is never anything stuck
            in a task waiting to be refunded.
          </p>
        </div>
      </div>

      <Link
        href="/buyer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-(--app-ink-3) hover:text-white"
      >
        Back to Buyer Hub <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
