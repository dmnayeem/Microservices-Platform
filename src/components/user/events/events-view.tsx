"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Clock, Coins, Loader2, CheckCircle2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { ProofImageUpload } from "@/components/user/tasks/proof-image-upload";
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

export function EventsView() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [proofByEvent, setProofByEvent] = useState<Record<string, string>>({});
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/events", { cache: "no-store" });
      const d = r.ok ? await r.json() : { events: [] };
      setEvents(d.events ?? []);
    } catch {
      setEvents([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(() => load(true));

  const claim = async (ev: EventItem, tierThreshold?: number) => {
    setClaiming(tierThreshold != null ? `${ev.id}:${tierThreshold}` : ev.id);
    try {
      const body: { proofUrl?: string; tierThreshold?: number } = {};
      if (ev.actionType === "UPLOAD_PROOF")
        body.proofUrl = proofByEvent[ev.id] ?? ev.proofUrl ?? "";
      if (tierThreshold != null) body.tierThreshold = tierThreshold;
      const r = await fetch(`/api/events/${ev.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't claim");
      await runInterstitial();
      toast.success(
        `Reward claimed — +${d.rewardPoints} points${d.rewardXp ? ` / +${d.rewardXp} XP` : ""}!`
      );
      load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't claim");
    } finally {
      setClaiming(null);
    }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
        <Sparkles className="w-6 h-6 text-amber-400" /> Events
      </h1>
      <p className="text-sm text-gray-400 -mt-1">
        Limited-time challenges. Hit the target before the timer runs out and
        claim your reward.
      </p>

      <AdRenderer placement="TASK_LIST" />

      {loading && <ListSkeleton rows={3} />}

      {!loading && events.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="No events right now"
          description="New events drop regularly — check back soon."
        />
      )}

      {!loading && events.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {events.map((ev) => {
            const pct = Math.min(
              100,
              Math.round((ev.progress / Math.max(1, ev.threshold)) * 100)
            );
            const meta = EVENT_ACTION_META[ev.actionType];
            const isUpload = ev.actionType === "UPLOAD_PROOF";
            const uploaded = isUpload
              ? !!(proofByEvent[ev.id] || ev.proofUrl)
              : false;
            const canClaim =
              !ev.claimed && (isUpload ? uploaded : ev.completable);
            return (
              <div
                key={ev.id}
                className="rounded-2xl border border-gray-800 bg-gray-900 p-4 flex flex-col"
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-linear-to-br from-amber-500 to-pink-500 grid place-items-center text-xl shrink-0">
                    🎯
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white line-clamp-2">
                      {ev.title}
                    </p>
                    <p className="text-[11px] text-gray-500 inline-flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" /> {timeLeft(ev.endAt)}
                    </p>
                  </div>
                </div>

                {ev.description && (
                  <p className="text-xs text-gray-400 mt-2 line-clamp-2">
                    {ev.description}
                  </p>
                )}

                {/* Progress */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-gray-400">{meta.label}</span>
                    <span className="text-white font-bold tabular-nums">
                      {isUpload
                        ? uploaded
                          ? "Uploaded"
                          : "Not uploaded"
                        : `${ev.progress}/${ev.threshold} ${meta.unit}`}
                    </span>
                  </div>
                  {!isUpload && (
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full bg-linear-to-r from-amber-500 to-pink-500 transition-[width]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Upload proof (UPLOAD_PROOF events) */}
                {isUpload && !ev.claimed && (
                  <div className="mt-3">
                    <ProofImageUpload
                      value={proofByEvent[ev.id] ?? ev.proofUrl ?? ""}
                      onChange={(url) =>
                        setProofByEvent((p) => ({ ...p, [ev.id]: url }))
                      }
                      placeholder="Upload your proof"
                    />
                  </div>
                )}

                {ev.tierViews.length > 0 ? (
                  /* Multi-tier: each tier claims independently. */
                  <div className="mt-3 space-y-1.5">
                    {ev.tierViews.map((t) => {
                      const busy = claiming === `${ev.id}:${t.threshold}`;
                      return (
                        <div
                          key={t.threshold}
                          className="flex items-center justify-between gap-2 rounded-lg bg-gray-950/60 border border-gray-800 px-2.5 py-1.5"
                        >
                          <span className="text-xs text-gray-300">
                            {t.threshold} {meta.unit} →{" "}
                            <span className="text-amber-400 font-bold">
                              +{t.rewardPoints}
                            </span>
                            {t.rewardXp ? (
                              <span className="text-violet-400"> +{t.rewardXp}xp</span>
                            ) : null}
                          </span>
                          {t.claimed ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Done
                            </span>
                          ) : (
                            <button
                              onClick={() => claim(ev, t.threshold)}
                              disabled={!t.reached || busy}
                              className={cn(
                                "inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold",
                                t.reached
                                  ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                                  : "bg-gray-800 text-gray-500 cursor-not-allowed"
                              )}
                            >
                              {busy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trophy className="w-3.5 h-3.5" />
                              )}
                              {t.reached ? "Claim" : "Locked"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-amber-400 font-bold text-sm">
                      <Coins className="w-4 h-4" /> +{ev.rewardPoints}
                      {ev.rewardXp ? (
                        <span className="text-violet-400 ml-1">
                          +{ev.rewardXp}xp
                        </span>
                      ) : null}
                    </span>
                    {ev.claimed ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-sm font-bold">
                        <CheckCircle2 className="w-4 h-4" /> Claimed
                      </span>
                    ) : (
                      <button
                        onClick={() => claim(ev)}
                        disabled={!canClaim || claiming === ev.id}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold",
                          canClaim
                            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                            : "bg-gray-800 text-gray-500 cursor-not-allowed"
                        )}
                      >
                        {claiming === ev.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trophy className="w-4 h-4" />
                        )}
                        {canClaim ? "Claim" : "In progress"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
