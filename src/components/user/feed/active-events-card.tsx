"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Trophy,
  Clock,
  Coins,
  Loader2,
  CheckCircle2,
  ChevronRight,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { runInterstitial } from "@/lib/reward-interstitial";
import { EVENT_ACTION_META, type EventActionType } from "@/lib/events-shared";

interface TierView {
  threshold: number;
  rewardPoints: number;
  rewardXp: number;
  reached: boolean;
  claimed: boolean;
}

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  actionType: EventActionType;
  threshold: number;
  rewardPoints: number;
  rewardXp: number;
  startAt: string;
  endAt: string;
  progress: number;
  claimed: boolean;
  proofUrl: string | null;
  completable: boolean;
  tierViews: TierView[];
}

function timeLeft(endAt: string): string {
  const ms = new Date(endAt).getTime() - Date.now();
  if (ms <= 0) return "ended";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h left`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m left`;
}

/** The next reward tier the user hasn't claimed yet (or null for single-target). */
function nextTier(ev: EventItem): TierView | null {
  if (ev.tierViews.length === 0) return null;
  return ev.tierViews.find((t) => !t.claimed) ?? null;
}

/** Every reward on this event already collected (tiered = all tiers claimed). */
function isFullyClaimed(ev: EventItem): boolean {
  if (ev.tierViews.length > 0) return ev.tierViews.every((t) => t.claimed);
  return ev.claimed;
}

/** Is there a reward this user can claim on this event right now? */
function claimableNow(ev: EventItem): boolean {
  if (ev.actionType === "UPLOAD_PROOF") return false; // proof upload stays on /events
  if (ev.tierViews.length > 0) {
    const t = nextTier(ev);
    return !!t && t.reached;
  }
  return !ev.claimed && ev.completable;
}

/**
 * Compact "Active Events" widget for the feed. Shown in the desktop right rail
 * and below the banner on narrower screens (a distinct instance gated `xl:hidden` by the
 * caller). Self-fetches `/api/events` — the same per-user endpoint the full
 * events page uses — so progress + claim state are always live. Renders nothing
 * when there are no active events, so it never leaves an empty box.
 */
export function ActiveEventsCard({ className }: { className?: string }) {
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/events", { cache: "no-store" });
      const d = r.ok ? await r.json() : { events: [] };
      setEvents(d.events ?? []);
    } catch {
      setEvents((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(() => load());

  // Drop events with nothing left to do; claimable first, then soonest-ending;
  // show the 3 most relevant.
  const shown = useMemo(() => {
    if (!events) return [];
    return [...events]
      .filter((ev) => !isFullyClaimed(ev))
      .sort((a, b) => {
        const ca = claimableNow(a) ? 0 : 1;
        const cb = claimableNow(b) ? 0 : 1;
        if (ca !== cb) return ca - cb;
        return new Date(a.endAt).getTime() - new Date(b.endAt).getTime();
      })
      .slice(0, 3);
  }, [events]);

  const claim = async (ev: EventItem) => {
    const tier = nextTier(ev);
    const key = tier ? `${ev.id}:${tier.threshold}` : ev.id;
    setClaiming(key);
    try {
      const body: { tierThreshold?: number } = {};
      if (tier) body.tierThreshold = tier.threshold;
      const r = await fetch(`/api/events/${ev.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't claim");
      await runInterstitial();
      toast.success(
        `Reward claimed — +${d.rewardPoints} points${
          d.rewardXp ? ` / +${d.rewardXp} XP` : ""
        }!`
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't claim");
    } finally {
      setClaiming(null);
    }
  };

  // Nothing until we know there's at least one actionable event — no empty box.
  if (!events || shown.length === 0) return null;

  return (
    <section className={cn("glass p-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white inline-flex items-center gap-1.5">
          <span className="w-6 h-6 rounded-lg bg-violet-500/15 text-violet-300 grid place-items-center">
            <Sparkles className="w-3.5 h-3.5" />
          </span>
          Active Events
        </h3>
        <Link
          href="/events"
          className="text-xs text-violet-400 hover:text-violet-300 inline-flex items-center"
        >
          See all <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="space-y-2.5">
        {shown.map((ev) => {
          const tier = nextTier(ev);
          const meta = EVENT_ACTION_META[ev.actionType];
          const target = tier ? tier.threshold : ev.threshold;
          const rewardPoints = tier ? tier.rewardPoints : ev.rewardPoints;
          const rewardXp = tier ? tier.rewardXp : ev.rewardXp;
          const pct = Math.min(
            100,
            Math.round((ev.progress / Math.max(1, target)) * 100)
          );
          const isUpload = ev.actionType === "UPLOAD_PROOF";
          const canClaim = claimableNow(ev);
          const busy =
            claiming === ev.id ||
            (tier != null && claiming === `${ev.id}:${tier.threshold}`);
          const done = isFullyClaimed(ev);

          return (
            <div
              key={ev.id}
              className="rounded-xl bg-gray-950/40 border border-gray-800 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white truncate flex-1">
                  {ev.title}
                </p>
                <span className="text-[11px] text-gray-500 inline-flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" /> {timeLeft(ev.endAt)}
                </span>
              </div>

              {/* Progress toward the (next tier's) target */}
              <div className="mt-2">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-gray-400 truncate">{meta.label}</span>
                  <span className="text-white font-bold tabular-nums shrink-0">
                    {isUpload
                      ? ev.claimed
                        ? "Uploaded"
                        : "Proof needed"
                      : `${Math.min(ev.progress, target)}/${target} ${meta.unit}`}
                  </span>
                </div>
                {!isUpload && (
                  <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500 transition-[width]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Reward + action */}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-amber-400 font-bold text-sm tabular-nums">
                  <Coins className="w-3.5 h-3.5" />+{rewardPoints}
                  {rewardXp ? (
                    <span className="text-violet-400 ml-1 text-xs">
                      +{rewardXp} XP
                    </span>
                  ) : null}
                </span>

                {done ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Claimed
                  </span>
                ) : isUpload ? (
                  <Link
                    href="/events"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload
                  </Link>
                ) : (
                  <button
                    onClick={() => claim(ev)}
                    disabled={!canClaim || busy}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold",
                      canClaim
                        ? "bg-violet-500 hover:bg-violet-600 text-white"
                        : "bg-gray-800 text-gray-500 cursor-not-allowed"
                    )}
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trophy className="w-3.5 h-3.5" />
                    )}
                    {canClaim ? "Claim" : "In progress"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
