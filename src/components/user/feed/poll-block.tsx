"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { FeedPost } from "./social-feed-view.types";

// ─────────────────────────────────────────────────────────────────────────────
// PollBlock — renders poll bars with vote button per option
// ─────────────────────────────────────────────────────────────────────────────

export function PollBlock({
  post,
  onUpdated,
}: {
  post: FeedPost;
  onUpdated: (patch: Partial<FeedPost>) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const options = post.pollOptions ?? [];
  const total = options.reduce((s, o) => s + o.voteCount, 0);
  const ended =
    post.pollEndsAt && new Date(post.pollEndsAt).getTime() < Date.now();

  const vote = async (optionId: string) => {
    if (ended || busyId) return;
    setBusyId(optionId);
    try {
      const res = await fetch(`/api/feed/${post.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onUpdated({
        pollOptions: data.pollOptions,
        myVote: data.myVote,
      });
    } catch (err) {
      toast.error("Couldn't vote", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="px-4 py-3 border-t border-gray-800 space-y-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-gray-500">
        <span>Poll</span>
        <span>
          {total} vote{total === 1 ? "" : "s"}
          {ended ? " · ended" : post.pollEndsAt ? ` · ends ${formatDistanceToNow(new Date(post.pollEndsAt), { addSuffix: true })}` : ""}
        </span>
      </div>
      <div className="space-y-1.5">
        {options.map((o) => {
          const pct = total > 0 ? (o.voteCount / total) * 100 : 0;
          const isMine = post.myVote === o.id;
          return (
            <button
              key={o.id}
              onClick={() => vote(o.id)}
              disabled={ended || busyId === o.id}
              className={cn(
                "relative w-full text-left p-2.5 rounded-lg overflow-hidden border transition-colors disabled:cursor-default",
                isMine
                  ? "border-indigo-500 bg-indigo-500/5"
                  : "border-gray-800 bg-gray-950 hover:border-gray-700"
              )}
            >
              <div
                className={cn(
                  "absolute inset-0 transition-[width]",
                  isMine ? "bg-indigo-500/15" : "bg-gray-800/40"
                )}
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <span className="text-sm text-white truncate">{o.label}</span>
                <span className="text-xs tabular-nums text-gray-300 shrink-0">
                  {pct.toFixed(0)}% · {o.voteCount}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
