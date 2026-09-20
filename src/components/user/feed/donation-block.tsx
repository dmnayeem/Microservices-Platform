"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import type { FeedPost } from "./social-feed-view.types";

// ─────────────────────────────────────────────────────────────────────────────
// DonationBlock — progress bar + donate modal
// ─────────────────────────────────────────────────────────────────────────────

export function DonationBlock({
  post,
  onUpdated,
}: {
  post: FeedPost;
  onUpdated: (patch: Partial<FeedPost>) => void;
}) {
  const goal = post.donationGoal ?? 0;
  const collected = post.donationCollected ?? 0;
  const pct = goal > 0 ? Math.min(100, (collected / goal) * 100) : 0;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(100);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (amount < 1) {
      toast.error("Enter at least 1 pt");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/feed/${post.id}/donate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ points: amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(`Thanks! ${amount} pts donated`);
      onUpdated({
        donationCollected: data.donationCollected,
        donationGoal: data.donationGoal,
      });
      setOpen(false);
    } catch (err) {
      toast.error("Donation failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="px-4 py-3 border-t border-(--app-line) space-y-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-(--app-ink-3)">
          <span>Donation Goal</span>
          <span className="tabular-nums">
            {collected.toLocaleString()} / {goal.toLocaleString()} pts
          </span>
        </div>
        <div className="h-2 rounded-full bg-(--app-page) overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-pink-500 to-amber-500 transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
        {!post.isOwner && (
          <button
            onClick={() => setOpen(true)}
            className="app-press app-tap-row w-full mt-2.5 rounded-(--app-r-control) bg-(--app-surface-2) border border-(--app-line) hover:border-(--app-line-strong) text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
          >
            💝 Donate pts
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={busy ? undefined : () => setOpen(false)}
          />
          <div className="relative bg-(--app-surface) border border-(--app-line) rounded-xl shadow-2xl max-w-sm w-full p-5">
            <h3 className="text-base font-bold text-white mb-3">
              Donate to this post
            </h3>
            <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
              Amount (pts)
            </label>
            <input
              type="number"
              min={1}
              max={100000}
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-(--app-surface-2) border border-(--app-line) rounded-lg text-white text-sm focus:outline-none focus:border-pink-500"
            />
            <div className="flex gap-2 mt-2">
              {[50, 100, 500, 1000].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className="flex-1 py-1.5 rounded bg-(--app-surface-2) hover:bg-(--app-surface-2) text-xs text-(--app-ink-2) tabular-nums"
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 py-2.5 rounded-lg bg-(--app-surface-2) text-white text-sm font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="flex-1 py-2.5 rounded-lg bg-linear-to-r from-pink-500 to-amber-500 text-white text-sm font-bold disabled:opacity-50"
              >
                {busy ? "Processing…" : `Donate ${amount} pts`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
