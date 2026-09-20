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
    <section className={cn("app-card", className)}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="t-section text-white inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-(--app-ink-3)" />
          Active Events
        </h3>
        <Link
          href="/events"
          className="app-press app-tap-row inline-flex items-center px-2.5 -mr-2 rounded-(--app-r-chip) t-meta font-extrabold text-(--app-info) hover:bg-(--app-info-soft)"
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
              className="app-tile"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="t-card-title text-white truncate min-w-0 flex-1">
                  {ev.title}
                </p>
                <span className="t-meta text-(--app-ink-3) inline-flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" /> {timeLeft(ev.endAt)}
                </span>
              </div>

              {/* Progress toward the (next tier's) target */}
              <div className="mt-2">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-(--app-ink-3) truncate min-w-0">{meta.label}</span>
                  <span className="text-white font-bold tabular-nums shrink-0">
                    {isUpload
                      ? ev.claimed
                        ? "Uploaded"
                        : "Proof needed"
                      : `${Math.min(ev.progress, target)}/${target} ${meta.unit}`}
                  </span>
                </div>
                {!isUpload && (
                  <div className="h-2 rounded-full bg-(--app-surface) overflow-hidden">
                    <div
                      className="h-full rounded-full bg-(image:--app-rail) transition-[width]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Reward + action */}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="t-figure-sm inline-flex items-baseline gap-1 text-white">
                  <Coins className="w-4 h-4 self-center text-(--app-ink-3)" />+{rewardPoints}
                  {rewardXp ? (
                    <span className="t-meta font-bold text-(--app-ink-3) ml-1">
                      +{rewardXp} XP
                    </span>
                  ) : null}
                </span>

                {done ? (
                  <span className="app-chip app-chip-in">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Claimed
                  </span>
                ) : isUpload ? (
                  <Link
                    href="/events"
                    className="app-accent app-press app-tap-row inline-flex items-center gap-1.5 px-3.5 rounded-(--app-r-control) text-xs font-extrabold"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload
                  </Link>
                ) : (
                  <button
                    onClick={() => claim(ev)}
                    disabled={!canClaim || busy}
                    className={cn(
                      "app-press app-tap-row inline-flex items-center gap-1.5 px-3.5 rounded-(--app-r-control) text-xs font-extrabold",
                      canClaim
                        ? "app-accent"
                        : "bg-(--app-surface) border border-(--app-line) text-(--app-ink-3) cursor-not-allowed"
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
