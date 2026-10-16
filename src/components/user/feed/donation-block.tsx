"use client";

import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import type { FeedPost } from "./social-feed-view.types";

// ─────────────────────────────────────────────────────────────────────────────
// DonationBlock — progress bar + donate modal. Donations are paid in Ad Points
// and the author receives Ad Points (src/app/api/feed/[id]/donate).
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
  // The member's Ad Points, read when the modal opens (null = not loaded yet).
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/wallet")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const n = Number(d?.balance?.adPoints);
        if (alive && Number.isFinite(n)) setBalance(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  const short = balance !== null && amount > balance;

  const submit = async () => {
    if (amount < 1) {
      toast.error("Enter at least 1 Ad Point");
      return;
    }
    if (short) {
      toast.error("Not enough Ad Points", {
        description: `You have ${balance!.toLocaleString()} Ad Points.`,
      });
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
      toast.success(`Thanks! ${amount.toLocaleString()} Ad Points donated`);
      setBalance((b) => (b === null ? b : b - amount));
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
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs font-semibold text-(--app-ink-3)">
          <span className="t-eyebrow">Donation Goal</span>
          <span className="tabular-nums text-(--app-ink-2)">
            {collected.toLocaleString()} / {goal.toLocaleString()} Ad Points
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
            className="app-press app-tap-row w-full mt-2.5 rounded-(--app-r-control) bg-(--app-surface-2) border border-(--app-line) hover:border-(--app-line-strong) text-(--app-ink) text-sm font-extrabold inline-flex items-center justify-center gap-1.5"
          >
            💝 Donate Ad Points
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
            <h3 className="text-base font-bold text-white mb-1">
              Donate to this post
            </h3>
            <p className="text-xs text-(--app-ink-3) mb-3">
              Paid from your Ad Points. The author receives Ad Points.
            </p>
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <label className="text-sm font-medium text-(--app-ink-2)">
                Amount (Ad Points)
              </label>
              <span className="text-xs text-(--app-ink-3) tabular-nums">
                Available: {balance === null ? "…" : balance.toLocaleString()}
              </span>
            </div>
            <input
              type="number"
              min={1}
              max={100000}
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
              className="w-full min-h-11 px-3 bg-(--app-surface-2) border border-(--app-line) rounded-lg text-(--app-ink) text-base focus:outline-none focus:border-pink-500"
            />
            <div className="flex gap-2 mt-2">
              {[50, 100, 500, 1000].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className="app-press min-h-10 flex-1 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-sm font-semibold text-(--app-ink) tabular-nums"
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="app-press app-tap-row flex-1 rounded-lg bg-(--app-surface-2) text-(--app-ink) text-sm font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy || short}
                className="app-press app-tap-row flex-1 rounded-lg bg-linear-to-r from-pink-500 to-amber-500 text-white text-sm font-bold disabled:opacity-50"
              >
                {busy
                  ? "Processing…"
                  : short
                    ? "Not enough Ad Points"
                    : `Donate ${amount.toLocaleString()} Ad Points`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
