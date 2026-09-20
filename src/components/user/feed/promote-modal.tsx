"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { Loader2, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedPost } from "./social-feed-view.types";

// ─────────────────────────────────────────────────────────────────────────────
// PromoteModal — lets an admin toggle PROMOTED, set an expiry, and tag a sponsor.
// ─────────────────────────────────────────────────────────────────────────────
export function PromoteModal({
  post,
  onClose,
  onSaved,
}: {
  post: FeedPost;
  onClose: () => void;
  onSaved: (patch: Partial<FeedPost>) => void;
}) {
  const initialUntil = post.promotedUntil
    ? new Date(post.promotedUntil)
    : null;
  const [enabled, setEnabled] = useState(!!post.isPromoted);
  const [duration, setDuration] = useState<"1d" | "7d" | "30d" | "forever">(
    initialUntil ? "7d" : "forever"
  );
  const [note, setNote] = useState(post.promotedNote ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      let until: string | null = null;
      if (enabled && duration !== "forever") {
        const days = duration === "1d" ? 1 : duration === "7d" ? 7 : 30;
        until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      }
      const res = await fetch(`/api/admin/feed/${post.id}/promote`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPromoted: enabled,
          until,
          note: enabled ? note.trim() || null : null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      onSaved({
        isPromoted: !!d.isPromoted,
        promotedUntil: d.promotedUntil ?? null,
        promotedNote: d.promotedNote ?? null,
      });
      toast.success(enabled ? "Post promoted" : "Promotion removed");
    } catch (err) {
      toast.error("Couldn't update promotion", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-(--app-page) shadow-2xl p-5 space-y-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-base font-bold text-white inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Promote Post
            </p>
            <p className="text-[11px] text-(--app-ink-3) mt-0.5">
              Promoted posts get a PROMOTED badge and are interleaved through the feed.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-(--app-ink-3) hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-(--app-line) bg-(--app-surface) px-3 py-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded bg-(--app-surface-2) border-(--app-line) text-amber-500 focus:ring-amber-500"
          />
          <span className="text-sm font-semibold text-white">
            Show PROMOTED badge
          </span>
        </label>

        {enabled && (
          <>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-(--app-ink-3) font-bold mb-1.5">
                Duration
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(["1d", "7d", "30d", "forever"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    type="button"
                    className={cn(
                      "px-2 py-1.5 rounded-md text-xs font-bold border",
                      duration === d
                        ? "bg-amber-500 border-amber-500 text-(--app-on-bright)"
                        : "bg-(--app-surface) border-(--app-line) text-(--app-ink-3) hover:text-white"
                    )}
                  >
                    {d === "forever" ? "Forever" : d.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-(--app-ink-3) font-bold block mb-1.5">
                Sponsor / Note (optional)
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={120}
                placeholder='e.g. "NordVPN", "Coinbase"'
                className="w-full bg-(--app-surface) border border-(--app-line) rounded-lg px-3 py-2 text-sm text-(--app-ink) placeholder:text-(--app-ink-3) focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-(--app-ink-3) mt-1">
                Shown as a tooltip on the PROMOTED badge.
              </p>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={busy}
            type="button"
            className="px-4 py-2 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-2) text-(--app-ink) text-sm font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            type="button"
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-(--app-on-bright) text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {enabled ? "Save promotion" : "Remove promotion"}
          </button>
        </div>
      </div>
    </div>
  );
}
