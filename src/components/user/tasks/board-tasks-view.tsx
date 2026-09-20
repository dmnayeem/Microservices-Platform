"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Pin,
  Coins,
  Users,
  Clock,
  ChevronLeft,
  CheckCircle2,
  Circle,
  Lock,
  Trophy,
  Loader2,
  Sparkles,
  Zap,
  Gift,
  X,
} from "lucide-react";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { format } from "date-fns";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { runInterstitial } from "@/lib/reward-interstitial";
import { ensureAdsAllowed } from "@/lib/adblock";
import { ScrollFadeRow } from "@/components/user/primitives/scroll-fade-row";

interface Board {
  id: string;
  name: string;
  description?: string;
  iconEmoji?: string | null;
  thumbnailUrl?: string | null;
  category?: string | null;
  taskCount: number;
  totalRewardPts: number;
  xpReward?: number;
  participants: number;
  expiresAt?: string | null;
  claimed?: boolean;
  lockedBy?: { id: string; title: string } | null;
}

type TaskUserStatus = "DONE" | "PENDING" | "AVAILABLE";

interface BoardTask {
  id: string;
  title: string;
  type: string;
  pointsReward: number;
  xpReward: number;
  duration?: number | null;
  thumbnailUrl?: string | null;
  userStatus: TaskUserStatus;
}

interface BoardDetail {
  board: {
    id: string;
    title: string;
    description?: string | null;
    iconEmoji?: string | null;
    imageUrl?: string | null;
    category?: string | null;
    expiresAt?: string | null;
    isExpired?: boolean;
    pointsReward: number;
    xpReward: number;
    lockedBy?: { id: string; title: string } | null;
  };
  tasks: BoardTask[];
  progress: { done: number; total: number; allDone: boolean };
  claimedAt: string | null;
}

const BOARD_CATEGORIES = [
  "Marketing",
  "Development",
  "Design",
  "Sales",
  "Learning",
  "Other",
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  Marketing: "bg-pink-500/10 border-pink-500/30 text-pink-300",
  Development: "bg-(--app-cta)/10 border-(--app-accent-edge)/30 text-(--app-accent-ink)",
  Design: "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300",
  Sales: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  Learning: "bg-sky-500/10 border-sky-500/30 text-sky-300",
  Other: "bg-(--app-ink-3)/10 border-(--app-line)/30 text-(--app-ink-2)",
};

function formatCountdown(expiresAt: string): {
  label: string;
  expired: boolean;
  urgent: boolean;
} {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { label: "Expired", expired: true, urgent: false };
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const urgent = ms < 24 * 3600 * 1000;
  if (days >= 1) return { label: `${days}d ${hours}h left`, expired: false, urgent };
  if (hours >= 1) return { label: `${hours}h ${mins}m left`, expired: false, urgent };
  return { label: `${mins}m left`, expired: false, urgent };
}

const TASK_TYPE_ROUTE: Record<string, string> = {
  ARTICLE: "/article-tasks",
  VIDEO: "/video-tasks",
  QUIZ: "/quiz-tasks",
  SOCIAL: "/social-tasks",
  PROXY: "/proxy-tasks",
  MANUAL: "/manual-tasks",
};

export function BoardTasksView() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BoardDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/tasks/boards", { cache: "no-store" });
      const d = r.ok ? await r.json() : { boards: [] };
      setBoards(d.boards ?? []);
    } catch {
      setBoards([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(() => load(true));

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/tasks/boards/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const d = (await res.json()) as BoardDetail;
      setDetail(d);
    } catch (err) {
      toast.error("Couldn't load board", {
        description: err instanceof Error ? err.message : "Try again",
      });
      setSelectedBoardId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBoardId) loadDetail(selectedBoardId);
  }, [selectedBoardId]);

  const claim = async () => {
    if (!detail) return;
    setClaiming(true);
    try {
      const res = await fetch(`/api/tasks/boards/${detail.board.id}/claim`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await runInterstitial();
      toast.success(`Board reward claimed! +${data.points} pts, +${data.xp} XP`);
      setShowConfirm(false);
      await loadDetail(detail.board.id);
    } catch (err) {
      toast.error("Claim failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setClaiming(false);
    }
  };

  // ───────────────────── Detail view ─────────────────────
  if (selectedBoardId) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => {
            setSelectedBoardId(null);
            setDetail(null);
          }}
          className="inline-flex items-center gap-1.5 text-sm text-(--app-ink-3) hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to boards
        </button>

        <AdRenderer placement="TASK_LIST" />

        {detailLoading && <ListSkeleton rows={5} />}

        {!detailLoading && detail && (() => {
          const detailCountdown = detail.board.expiresAt
            ? formatCountdown(detail.board.expiresAt)
            : null;
          const isExpired =
            detail.board.isExpired ?? detailCountdown?.expired ?? false;
          const isLocked = !!detail.board.lockedBy;
          return (
          <>
            {/* Header */}
            <div className="rounded-2xl border border-(--app-line) bg-linear-to-br from-orange-500/10 via-pink-500/5 to-(--app-surface) overflow-hidden">
              {detail.board.imageUrl && (
                <div className="relative w-full h-32 bg-(--app-surface-2)">
                  <SmartImage
                    src={detail.board.imageUrl}
                    alt=""
                    fill
                    sizes="100vw"
                    className="object-cover"
                  />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center text-2xl shrink-0">
                    {detail.board.iconEmoji || "📌"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-bold text-white">
                      {detail.board.title}
                    </h1>
                    {detail.board.description && (
                      <p className="text-xs text-(--app-ink-3) mt-1">
                        {detail.board.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {detail.board.category && (
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border",
                            CATEGORY_COLORS[detail.board.category] ??
                              CATEGORY_COLORS.Other
                          )}
                        >
                          {detail.board.category}
                        </span>
                      )}
                      {isLocked && detail.board.lockedBy && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-amber-500/40 text-amber-300 bg-amber-500/10">
                          <Lock className="w-3 h-3" />
                          Unlock by &quot;{detail.board.lockedBy.title}&quot;
                        </span>
                      )}
                      {detailCountdown && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                            detailCountdown.expired
                              ? "border-(--app-line) text-(--app-ink-3) bg-(--app-page)"
                              : detailCountdown.urgent
                              ? "border-red-500/40 text-red-300 bg-red-500/10"
                              : "border-amber-500/40 text-amber-300 bg-amber-500/10"
                          )}
                        >
                          <Clock className="w-3 h-3" />
                          {detailCountdown.expired
                            ? `Expired ${format(
                                new Date(detail.board.expiresAt!),
                                "MMM d, yyyy"
                              )}`
                            : detailCountdown.label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Reward summary */}
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="rounded-lg bg-(--app-page) border border-(--app-line) p-2.5 flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-400" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-(--app-ink-3) font-bold">
                        Board Reward
                      </p>
                      <p className="text-sm font-bold text-white tabular-nums">
                        {detail.board.pointsReward} pts
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-(--app-page) border border-(--app-line) p-2.5 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-(--app-accent-ink)" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-(--app-ink-3) font-bold">
                        XP
                      </p>
                      <p className="text-sm font-bold text-white tabular-nums">
                        +{detail.board.xpReward}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="rounded-xl border border-(--app-line) bg-(--app-surface) p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-(--app-ink-2)">
                  Progress
                </p>
                <p className="text-xs tabular-nums text-(--app-ink-3)">
                  {detail.progress.done} / {detail.progress.total} complete
                </p>
              </div>
              <div className="h-2 rounded-full bg-(--app-page) overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-orange-500 to-emerald-500 transition-[width]"
                  style={{
                    width: `${
                      detail.progress.total > 0
                        ? (detail.progress.done / detail.progress.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Task list */}
            {detail.tasks.length === 0 ? (
              <EmptyState
                icon={Pin}
                title="No tasks in this board yet"
                description="Check back soon."
              />
            ) : (
              <div className="space-y-2">
                {detail.tasks.map((t, i) => {
                  const prevDone =
                    i === 0 || detail.tasks[i - 1].userStatus === "DONE";
                  const isLocked =
                    t.userStatus === "AVAILABLE" && !prevDone && i > 0;
                  const route = TASK_TYPE_ROUTE[t.type] ?? "/tasks";
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "rounded-xl border p-3 flex items-center gap-3 transition-colors",
                        t.userStatus === "DONE"
                          ? "bg-emerald-500/5 border-emerald-500/30"
                          : t.userStatus === "PENDING"
                          ? "bg-amber-500/5 border-amber-500/30"
                          : isLocked
                          ? "bg-(--app-page) border-(--app-line) opacity-60"
                          : "bg-(--app-surface) border-(--app-line) hover:border-orange-500/40"
                      )}
                    >
                      {/* Status icon */}
                      <div className="shrink-0">
                        {t.userStatus === "DONE" ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : t.userStatus === "PENDING" ? (
                          <Circle className="w-5 h-5 text-amber-400 fill-amber-400/30" />
                        ) : isLocked ? (
                          <Lock className="w-5 h-5 text-(--app-ink-3)" />
                        ) : (
                          <Circle className="w-5 h-5 text-(--app-ink-3)" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {t.title}
                        </p>
                        <p className="text-[11px] text-(--app-ink-3)">
                          {t.type.toLowerCase()}
                          {t.duration ? ` · ${t.duration} min` : ""}
                        </p>
                        <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 border border-orange-500/30 text-orange-300">
                          <Gift className="w-3 h-3" />
                          Bundled reward
                        </span>
                      </div>

                      {t.userStatus === "DONE" ? (
                        <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400 shrink-0">
                          Done
                        </span>
                      ) : t.userStatus === "PENDING" ? (
                        <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400 shrink-0">
                          Review
                        </span>
                      ) : isLocked ? (
                        <span className="text-[10px] uppercase tracking-wider font-bold text-(--app-ink-3) shrink-0">
                          Locked
                        </span>
                      ) : (
                        <Link
                          href={route}
                          className="px-3 py-1.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-xs font-bold shrink-0"
                        >
                          Start →
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Claim CTA */}
            <button
              onClick={() => {
                if (
                  detail.progress.allDone &&
                  !detail.claimedAt &&
                  !isExpired &&
                  !isLocked
                ) {
                  setShowConfirm(true);
                }
              }}
              disabled={
                claiming ||
                !detail.progress.allDone ||
                !!detail.claimedAt ||
                isExpired ||
                isLocked
              }
              className={cn(
                "w-full py-3.5 rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors",
                detail.claimedAt || isExpired || isLocked
                  ? "bg-(--app-surface-2) text-(--app-ink-3) cursor-default"
                  : detail.progress.allDone
                  ? "bg-linear-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white"
                  : "bg-(--app-surface-2) text-(--app-ink-3) cursor-not-allowed"
              )}
            >
              {claiming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : detail.claimedAt ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  Claimed on {format(new Date(detail.claimedAt), "MMM d")}
                </>
              ) : isLocked ? (
                <>
                  <Lock className="w-4 h-4" />
                  Locked — claim &quot;{detail.board.lockedBy?.title}&quot; first
                </>
              ) : isExpired ? (
                <>
                  <Clock className="w-4 h-4" />
                  Board expired — reward unavailable
                </>
              ) : detail.progress.allDone ? (
                <>
                  <Trophy className="w-4 h-4" />
                  Claim Board Reward (+{detail.board.pointsReward} pts)
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Complete all tasks to claim
                </>
              )}
            </button>

            {/* Confirm modal */}
            {showConfirm && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                onClick={() => !claiming && setShowConfirm(false)}
              >
                <div
                  className="w-full max-w-sm rounded-2xl border border-(--app-line) bg-(--app-page) shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between p-4 border-b border-(--app-line)">
                    <h3 className="text-base font-bold text-white inline-flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-amber-400" />
                      Confirm Board Claim
                    </h3>
                    <button
                      onClick={() => !claiming && setShowConfirm(false)}
                      className="p-1 rounded-md hover:bg-(--app-surface-2) text-(--app-ink-3) hover:text-white"
                      disabled={claiming}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-4 space-y-3">
                    <p className="text-sm text-(--app-ink-2)">
                      Confirm completion of{" "}
                      <span className="font-semibold text-white">
                        {detail.board.title}
                      </span>{" "}
                      and claim:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 flex items-center gap-2">
                        <Coins className="w-5 h-5 text-amber-400 shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-amber-400/80 font-bold">
                            Points
                          </p>
                          <p className="text-base font-bold text-white tabular-nums">
                            +{detail.board.pointsReward.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-lg bg-(--app-cta)/10 border border-(--app-accent-edge)/30 p-3 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-(--app-accent-ink) shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-(--app-accent-ink)/80 font-bold">
                            XP
                          </p>
                          <p className="text-base font-bold text-white tabular-nums">
                            +{detail.board.xpReward.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-(--app-ink-3)">
                      This action cannot be undone — the board will be marked
                      as claimed.
                    </p>
                  </div>

                  <div className="flex gap-2 p-4 border-t border-(--app-line)">
                    <button
                      onClick={() => setShowConfirm(false)}
                      disabled={claiming}
                      className="flex-1 py-2.5 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-2) text-(--app-ink) text-sm font-semibold disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={claim}
                      disabled={claiming}
                      className="flex-1 py-2.5 rounded-lg bg-linear-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {claiming ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Trophy className="w-4 h-4" />
                          Confirm & Claim
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
          );
        })()}
      </div>
    );
  }

  // ───────────────────── List view ─────────────────────
  const availableCategories = Array.from(
    new Set(boards.map((b) => b.category).filter(Boolean) as string[])
  );
  const filteredBoards = categoryFilter
    ? boards.filter((b) => b.category === categoryFilter)
    : boards;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Pin className="w-6 h-6 text-amber-400" />
          Board Tasks
        </h1>
        <p className="text-(--app-ink-3) text-sm mt-1">
          Themed challenges that bundle high-reward tasks — complete the board to
          claim the full reward.
        </p>
      </div>

      {!loading && availableCategories.length > 0 && (
        <ScrollFadeRow className="-mx-1" innerClassName="flex items-center gap-2 px-1" ariaLabel="Category filter">
          <button
            onClick={() => setCategoryFilter(null)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors shrink-0",
              !categoryFilter
                ? "bg-(--app-cta) text-(--app-on-cta) border-(--app-cta)"
                : "bg-(--app-surface) text-(--app-ink-2) border-(--app-line) hover:border-(--app-line)"
            )}
          >
            All
          </button>
          {BOARD_CATEGORIES.filter((c) => availableCategories.includes(c)).map(
            (c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors shrink-0",
                  categoryFilter === c
                    ? "bg-(--app-cta) text-(--app-on-cta) border-(--app-cta)"
                    : cn(CATEGORY_COLORS[c], "hover:opacity-80")
                )}
              >
                {c}
              </button>
            )
          )}
        </ScrollFadeRow>
      )}

      {loading && <ListSkeleton rows={3} />}

      {!loading && filteredBoards.length === 0 && (
        <EmptyState
          icon={Pin}
          title={
            categoryFilter
              ? `No boards in "${categoryFilter}"`
              : "No active boards"
          }
          description={
            categoryFilter
              ? "Try a different category, or clear the filter."
              : "Boards bundle high-reward tasks into themed challenges."
          }
        />
      )}

      {!loading && filteredBoards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredBoards.map((b) => {
            const countdown = b.expiresAt
              ? formatCountdown(b.expiresAt)
              : null;
            const isExpired = countdown?.expired ?? false;
            const isLocked = !!b.lockedBy;
            return (
              <button
                key={b.id}
                onClick={async () => {
                  if (isLocked) {
                    toast.info(
                      `Locked — claim "${b.lockedBy?.title}" first.`
                    );
                    return;
                  }
                  // Ad-blocker gate: refuse to open while a blocker is active.
                  if (!(await ensureAdsAllowed())) return;
                  setSelectedBoardId(b.id);
                }}
                className={cn(
                  "block text-left card overflow-hidden relative transition-colors",
                  isLocked
                    ? "opacity-70 hover:border-amber-500/40 cursor-not-allowed"
                    : isExpired
                    ? "opacity-60 hover:border-(--app-line)"
                    : "hover:border-orange-500/40"
                )}
              >
                {b.thumbnailUrl ? (
                  <div className="relative w-full h-24 bg-(--app-surface-2)">
                    <SmartImage
                      src={b.thumbnailUrl}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-24 bg-linear-to-br from-orange-500 to-pink-500 flex items-center justify-center text-3xl">
                    {b.iconEmoji || "📌"}
                  </div>
                )}
                {isLocked && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold bg-(--app-page)/80 text-amber-300 border border-amber-500/40">
                    <Lock className="w-3 h-3" />
                    Locked
                  </span>
                )}
                {!isLocked && isExpired && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold bg-(--app-page)/80 text-(--app-ink-2) border border-(--app-line)">
                    Expired
                  </span>
                )}
                {b.claimed && !isLocked && !isExpired && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                    <CheckCircle2 className="w-3 h-3" />
                    Claimed
                  </span>
                )}
                {b.category && !isExpired && (
                  <span
                    className={cn(
                      "absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border",
                      CATEGORY_COLORS[b.category] ?? CATEGORY_COLORS.Other
                    )}
                  >
                    {b.category}
                  </span>
                )}
                <div className="p-3">
                  <p className="text-sm font-bold text-white line-clamp-1">
                    {b.name}
                  </p>
                  {b.description && (
                    <p className="text-xs text-(--app-ink-3) line-clamp-2 mt-0.5">
                      {b.description}
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-1.5 mt-3 text-[11px]">
                    <div className="flex flex-col items-center p-1.5 rounded bg-(--app-surface-2)">
                      <Pin className="w-3 h-3 text-orange-400 mb-0.5" />
                      <span className="font-bold text-white tabular-nums">
                        {b.taskCount}
                      </span>
                      <span className="text-(--app-ink-3)">tasks</span>
                    </div>
                    <div className="flex flex-col items-center p-1.5 rounded bg-(--app-surface-2)">
                      <Coins className="w-3 h-3 text-amber-400 mb-0.5" />
                      <span className="font-bold text-white tabular-nums">
                        {b.totalRewardPts}
                      </span>
                      <span className="text-(--app-ink-3)">pts</span>
                    </div>
                    <div className="flex flex-col items-center p-1.5 rounded bg-(--app-surface-2)">
                      <Users className="w-3 h-3 text-(--app-accent-ink) mb-0.5" />
                      <span className="font-bold text-white tabular-nums">
                        {b.participants}
                      </span>
                      <span className="text-(--app-ink-3)">claimed</span>
                    </div>
                  </div>
                  {isLocked && b.lockedBy && (
                    <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300">
                      <Lock className="w-3 h-3" />
                      Unlock by claiming &quot;{b.lockedBy.title}&quot;
                    </p>
                  )}
                  {!isLocked && countdown && (
                    <p
                      className={cn(
                        "mt-2 inline-flex items-center gap-1 text-[10px] font-semibold",
                        countdown.expired
                          ? "text-(--app-ink-3)"
                          : countdown.urgent
                          ? "text-red-400"
                          : "text-amber-400"
                      )}
                    >
                      <Clock className="w-3 h-3" />
                      {countdown.expired
                        ? `Expired ${format(new Date(b.expiresAt!), "MMM d")}`
                        : countdown.label}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
