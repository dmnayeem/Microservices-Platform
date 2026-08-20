"use client";

import { useState } from "react";
import { Gift, Lock, CheckCircle2, Clock, Loader2, Sparkles } from "lucide-react";
import { cn, usd } from "@/lib/utils";
import { notifyCenter } from "@/lib/notify-center";
import { newIdempotencyKey } from "@/lib/idempotency-key";

export type SoloRewardStatus = "LOCKED" | "ELIGIBLE" | "CLAIMED" | "EXPIRED";

interface Criterion {
  label: string;
  current: number;
  target: number;
  unit?: string;
}

interface RewardBreakdown {
  points?: number;
  xp?: number;
  cash?: number;
  boostMultiplier?: number;
  boostHours?: number;
}

interface SoloRewardWidgetProps {
  status: SoloRewardStatus;
  criteria?: Criterion[];
  reward?: RewardBreakdown;
  resetAt?: Date | string;
  compact?: boolean;
  onClaimed?: () => void;
  className?: string;
}

export function SoloRewardWidget({
  status,
  criteria = [],
  reward,
  resetAt,
  compact = false,
  onClaimed,
  className,
}: SoloRewardWidgetProps) {
  const [claiming, setClaiming] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await fetch("/api/solo-reward/claim", {
        method: "POST",
        headers: { "Idempotency-Key": newIdempotencyKey() },
      });
      if (!res.ok) throw new Error("Claim failed");
      notifyCenter.reward({
        title: "Reward claimed!",
        description: "Your reward has been credited.",
      });
      setShowModal(false);
      onClaimed?.();
    } catch (err) {
      notifyCenter.error(
        "Failed to claim",
        err instanceof Error ? err.message : "Try again"
      );
    } finally {
      setClaiming(false);
    }
  };

  const headerByStatus: Record<SoloRewardStatus, { title: string; tone: string; icon: React.ReactNode }> = {
    LOCKED: {
      title: "Solo Reward",
      tone: "from-gray-700 to-gray-800",
      icon: <Lock className="w-4 h-4" />,
    },
    ELIGIBLE: {
      title: "Reward Ready!",
      tone: "from-amber-500 to-yellow-600",
      icon: <Gift className="w-4 h-4" />,
    },
    CLAIMED: {
      title: "Claimed",
      tone: "from-emerald-600 to-emerald-700",
      icon: <CheckCircle2 className="w-4 h-4" />,
    },
    EXPIRED: {
      title: "Expired",
      tone: "from-red-700 to-gray-800",
      icon: <Clock className="w-4 h-4" />,
    },
  };
  const meta = headerByStatus[status];

  return (
    <>
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-gray-800 bg-gray-900",
          className
        )}
      >
        <div
          className={cn(
            "px-4 py-2.5 bg-linear-to-r flex items-center gap-2 text-white",
            meta.tone
          )}
        >
          {meta.icon}
          <p className="text-sm font-bold flex-1">{meta.title}</p>
          <Sparkles className="w-3.5 h-3.5 opacity-70" />
        </div>

        <div className={cn("p-4 space-y-3", compact && "p-3 space-y-2")}>
          {status === "LOCKED" && criteria.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">
                Complete these to unlock today&apos;s reward.
              </p>
              {criteria.map((c) => {
                const pct = Math.min(100, (c.current / c.target) * 100);
                return (
                  <div key={c.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-300">{c.label}</span>
                      <span className="text-gray-500 tabular-nums">
                        {c.current}
                        {c.unit ?? ""}/{c.target}
                        {c.unit ?? ""}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full bg-linear-to-r from-indigo-500 to-purple-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {status === "ELIGIBLE" && (
            <>
              <p className="text-xs text-gray-400">
                All criteria met! Claim your reward now.
              </p>
              {reward && (
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {reward.points !== undefined && (
                    <div className="px-2 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 font-semibold">
                      +{reward.points} pts
                    </div>
                  )}
                  {reward.xp !== undefined && (
                    <div className="px-2 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 font-semibold">
                      +{reward.xp} XP
                    </div>
                  )}
                  {reward.cash !== undefined && (
                    <div className="px-2 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 font-semibold">
                      +{usd(reward.cash)}
                    </div>
                  )}
                  {reward.boostMultiplier !== undefined && (
                    <div className="px-2 py-1.5 rounded-lg bg-pink-500/10 text-pink-400 font-semibold">
                      {reward.boostMultiplier}× boost · {reward.boostHours ?? 24}h
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => setShowModal(true)}
                className="w-full py-2.5 rounded-lg bg-linear-to-r from-amber-500 to-yellow-500 text-gray-900 font-bold text-sm hover:opacity-90"
              >
                🎁 CLAIM REWARD
              </button>
            </>
          )}

          {status === "CLAIMED" && (
            <p className="text-xs text-gray-400">
              Reward successfully claimed! Resets at midnight.
              {resetAt && (
                <>
                  {" · "}
                  <span className="text-gray-500">
                    {new Date(resetAt).toLocaleString()}
                  </span>
                </>
              )}
            </p>
          )}

          {status === "EXPIRED" && (
            <p className="text-xs text-gray-400">
              Reward window passed. New reward unlocks soon.
            </p>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-100 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-linear-to-br from-amber-500 to-yellow-600 flex items-center justify-center mb-3">
              <Gift className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Claim Reward</h2>
            <p className="text-xs text-gray-400 mb-4">
              You&apos;re about to claim your daily Solo Reward.
            </p>
            <div className="flex gap-2">
              <button
                disabled={claiming}
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-semibold disabled:opacity-50"
              >
                Not Now
              </button>
              <button
                disabled={claiming}
                onClick={claim}
                className="flex-1 py-2.5 rounded-lg bg-linear-to-r from-amber-500 to-yellow-500 text-gray-900 text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {claiming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "🎁 Claim Now"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
