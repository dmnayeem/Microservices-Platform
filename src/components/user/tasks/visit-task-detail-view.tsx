"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  MousePointerClick,
  Scissors,
  Search,
  Share2,
  Sparkles,
  Timer,
  Video as VideoIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { runInterstitial } from "@/lib/reward-interstitial";
import { TaskUpgradeNotice, isUpgradeRequired, AdblockNotice } from "@/components/user/primitives/task-upgrade-notice";
import { ensureAdsAllowed } from "@/lib/adblock";
import { TaskInstructions } from "./task-instructions";
import { InlineVideoEmbed } from "@/components/user/primitives/inline-video-embed";
import { VisitInAppViewer } from "./visit-inapp-viewer";

/**
 * A VISIT task (lib/visit-tasks.ts).
 *  DIRECT: Open link → stay the shown time → come back → Claim. Back too soon
 *  = no points (open it again). The time is measured on the server.
 *  DIRECT + viewer "inapp" (source direct only): the link opens in a full-screen
 *  viewer (visit-inapp-viewer.tsx) with a live checklist — scroll, stay, click.
 *  DIRECT + source "social"/"search": step-by-step instructions, new-tab flow.
 *  SHORTENER: Open link → finish every step of the short link → our page shows
 *  your code → enter it here → Claim.
 */

interface VisitTask {
  id: string;
  title: string;
  description?: string | null;
  pointsReward: number;
  xpReward: number;
  instructions?: string | null;
  instructionsColor?: string | null;
  instructionVideoUrl?: string | null;
  /** `host` only — the full link is never sent (see task-player-view). */
  visitConfig?: {
    kind?: string;
    staySeconds?: number;
    minSeconds?: number;
    host?: string | null;
    viewer?: "tab" | "inapp";
    scrollPercent?: number;
    clicks?: number;
    source?: "direct" | "social" | "search";
    searchKeyword?: string | null;
    searchEngine?: "google" | "bing";
    /** Host of the social post (source "social"). */
    postHost?: string | null;
  } | null;
}

interface UserStatus {
  hasActiveSubmission: boolean;
  activeSubmissionId?: string | null;
  completedToday: boolean;
  awaitingReview?: boolean;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; submissionId: string }
  | { kind: "awaiting_review" }
  | { kind: "completed_today" }
  | { kind: "blocked"; reason: string };

const OPEN_ERRORS: Record<string, string> = {
  NOT_FOUND: "This task isn't available any more.",
  BLOCKED: "Your account can't do tasks right now.",
  RATE_LIMITED: "Too many opens in a short time — wait a minute.",
  NO_ATTEMPT: "Press Open link from this page to start.",
  TOO_MANY_OPENS: "You've opened this link too many times for this attempt. Try again tomorrow.",
  BAD_LINK: "This task's link is broken. Please report it.",
};

export function VisitTaskDetailView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [task, setTask] = useState<VisitTask | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [adBlocked, setAdBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  // Direct link: opened at (local, for the countdown only), and the server's verdict.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<{ outcome: string; elapsed: number; need: number } | null>(null);
  const [code, setCode] = useState("");
  const checking = useRef(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  // The in-app viewer handed off to a new tab — a person checks that visit.
  const [outside, setOutside] = useState(false);

  const cfg = task?.visitConfig ?? null;
  const kind = cfg?.kind === "SHORTENER" ? "SHORTENER" : "DIRECT";
  const stay = cfg?.staySeconds ?? 30;
  const source = cfg?.source === "social" || cfg?.source === "search" ? cfg.source : "direct";
  const needScroll = Math.max(0, Math.min(100, Number(cfg?.scrollPercent) || 0));
  const needClicks = Math.max(0, Math.floor(Number(cfg?.clicks) || 0));
  // Social/search targets can't be framed in that path — always a new tab.
  const inApp = kind === "DIRECT" && source === "direct" && cfg?.viewer === "inapp" && !outside;
  const submissionId = state.kind === "ready" ? state.submissionId : null;

  useEffect(() => {
    const err = sp.get("error");
    if (err) toast.error(OPEN_ERRORS[err] ?? "Couldn't open the link.");
  }, [sp]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const tRes = await fetch(`/api/tasks/${taskId}`);
        if (!tRes.ok) throw new Error(await tRes.text());
        const tData = await tRes.json();
        if (cancel) return;
        setTask(tData.task as VisitTask);
        const us = (tData.userStatus ?? {}) as UserStatus;
        if (us.awaitingReview) return setState({ kind: "awaiting_review" });
        if (us.hasActiveSubmission && us.activeSubmissionId) {
          return setState({ kind: "ready", submissionId: us.activeSubmissionId });
        }
        if (us.completedToday) return setState({ kind: "completed_today" });
        if (!(await ensureAdsAllowed())) {
          if (!cancel) setAdBlocked(true);
          return;
        }
        const sRes = await fetch(`/api/tasks/${taskId}/start`, { method: "POST" });
        const sData = await sRes.json().catch(() => ({}));
        if (cancel) return;
        if (!sRes.ok) {
          if (isUpgradeRequired(sData)) return setUpgradeMsg(sData.error || "");
          const reason = sData.error ?? `HTTP ${sRes.status}`;
          if (typeof reason === "string" && /limit/i.test(reason)) return setState({ kind: "completed_today" });
          return setState({ kind: "blocked", reason });
        }
        if (sData.submission?.id) setState({ kind: "ready", submissionId: sData.submission.id });
        else setState({ kind: "blocked", reason: "Couldn't start this task." });
      } catch (e) {
        if (!cancel) setLoadError(e instanceof Error ? e.message : "Failed to load task");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [taskId]);

  // Back on this tab after opening a DIRECT link → ask the server how long it was.
  const checkReturn = useCallback(async () => {
    if (kind !== "DIRECT" || !submissionId || checking.current) return;
    checking.current = true;
    try {
      const r = await fetch(`/api/tasks/${taskId}/visit-return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      const d = await r.json().catch(() => null);
      if (d && d.outcome && d.outcome !== "NONE") {
        setResult(d);
        if (d.outcome === "EARLY") setOpenedAt(null);
      }
    } finally {
      checking.current = false;
    }
  }, [kind, submissionId, taskId]);

  useEffect(() => {
    if (openedAt == null) return;
    const onBack = () => {
      if (document.visibilityState === "visible") void checkReturn();
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
      clearInterval(t);
    };
  }, [openedAt, checkReturn]);

  // A returning visitor (already finished earlier) sees Claim straight away.
  useEffect(() => {
    if (kind === "DIRECT" && submissionId) void checkReturn();
  }, [kind, submissionId, checkReturn]);

  const openLink = () => {
    if (!submissionId) return;
    setResult(null);
    setOpenedAt(Date.now());
    window.open(`/go/task/${taskId}?s=${encodeURIComponent(submissionId)}`, "_blank", "noopener");
  };

  const copyKeyword = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy — select the words and copy them.");
    }
  };

  const openViewerFallback = () => {
    setOutside(true);
    openLink();
  };

  const claim = async () => {
    if (!task || !submissionId) return;
    if (kind === "SHORTENER" && !code.trim()) {
      toast.error("Enter the code from the end of the link.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, ...(kind === "SHORTENER" ? { visitCode: code.trim() } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      await runInterstitial();
      if (d.status === "approved") {
        toast.success("Visit counted! 🎉", { description: `+${d.rewards?.points ?? task.pointsReward} pts credited` });
      } else {
        toast.success("Sent for review", { description: `You'll get ${task.pointsReward} pts once approved.` });
      }
      router.push("/visit-tasks");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Try again";
      if (/already submitted/i.test(msg)) {
        setViewerOpen(false);
        setState({ kind: "awaiting_review" });
      } else toast.error("Couldn't claim", { description: msg });
    } finally {
      setBusy(false);
    }
  };

  if (adBlocked) return <AdblockNotice />;
  if (upgradeMsg !== null) return <TaskUpgradeNotice message={upgradeMsg} />;
  if (loadError) {
    return (
      <div className="space-y-4">
        <Link href="/visit-tasks" className="inline-flex items-center gap-1.5 text-sm text-(--app-ink-3) hover:text-(--app-ink)">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">Couldn&apos;t load this task.</div>
      </div>
    );
  }
  if (!task) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-sky-400" />
      </div>
    );
  }

  const awaySec = openedAt ? Math.floor((now - openedAt) / 1000) : 0;
  const left = Math.max(0, stay - awaySec);

  return (
    <div className="space-y-5">
      <Link href="/visit-tasks" className="inline-flex items-center gap-1.5 text-sm text-(--app-ink-3) hover:text-(--app-ink)">
        <ArrowLeft className="w-4 h-4" /> Back to visit tasks
      </Link>

      <div className="rounded-2xl border border-(--app-line) bg-(--app-surface) p-5 space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-300">
            {kind === "SHORTENER" ? <Scissors className="h-5 w-5" /> : <ExternalLink className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-(--app-ink)">{task.title}</h1>
            {task.description && <p className="mt-1 text-sm text-(--app-ink-2) whitespace-pre-line">{task.description}</p>}
            <p className="mt-2 inline-flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 font-bold text-amber-300">
                <Coins className="h-4 w-4" /> {task.pointsReward} pts
              </span>
              {task.xpReward > 0 && (
                <span className="inline-flex items-center gap-1 text-violet-300">
                  <Sparkles className="h-4 w-4" /> {task.xpReward} XP
                </span>
              )}
            </p>
          </div>
        </div>

        {/* The admin's instructions were stored but never shown on this page. */}
        <TaskInstructions value={task.instructions} color={task.instructionsColor} />

        {task.instructionVideoUrl && (
          <section className="space-y-2">
            <h2 className="inline-flex items-center gap-1.5 text-xs font-bold text-(--app-ink-2)">
              <VideoIcon className="h-3.5 w-3.5" />
              Instruction video
            </h2>
            <div className="mx-auto max-w-2xl">
              <InlineVideoEmbed url={task.instructionVideoUrl} title={`Instruction video — ${task.title}`} />
            </div>
          </section>
        )}

        {kind === "DIRECT" && inApp ? (
          <div className="rounded-xl bg-(--app-surface-2) p-4">
            <p className="text-sm font-semibold text-(--app-ink)">The page opens right here. You&apos;ll be asked to:</p>
            <ol className="mt-2 space-y-2 text-sm text-(--app-ink-2)">
              {needScroll > 0 && (
                <li className="flex items-center gap-2">
                  <ArrowDown className="h-4 w-4 shrink-0 text-sky-400" /> Scroll {needScroll}% of the page
                </li>
              )}
              <li className="flex items-center gap-2">
                <Timer className="h-4 w-4 shrink-0 text-sky-400" /> Stay {stay} seconds
                {needScroll > 0 && <span className="text-(--app-ink-3)">(the timer starts after scrolling)</span>}
              </li>
              {needClicks > 0 && (
                <li className="flex items-center gap-2">
                  <MousePointerClick className="h-4 w-4 shrink-0 text-sky-400" /> Click {needClicks} time{needClicks === 1 ? "" : "s"} on the page
                </li>
              )}
            </ol>
            <p className="mt-2 text-xs text-(--app-ink-3)">Each item gets a tick as you do it. When all are ticked, your points are claimed.</p>
          </div>
        ) : kind === "DIRECT" && source === "social" ? (
          <ol className="space-y-2 rounded-xl bg-(--app-surface-2) p-4 text-sm text-(--app-ink-2)">
            <li><b className="text-(--app-ink)">1.</b> Press <b>Open the post</b> — it opens the post
              {cfg?.postHost ? <> on <b className="text-(--app-ink)">{cfg.postHost}</b></> : null} in a new tab.</li>
            <li><b className="text-(--app-ink)">2.</b> Tap the link inside the post.</li>
            <li><b className="text-(--app-ink)">3.</b> Stay on the site for at least <b className="text-(--app-ink)">{stay} seconds</b>.</li>
            <li><b className="text-(--app-ink)">4.</b> Come back to this tab and press <b>Claim</b>.</li>
            <li className="text-xs text-(--app-ink-3)">Coming back sooner earns nothing — you can open it again.</li>
          </ol>
        ) : kind === "DIRECT" && source === "search" ? (
          <ol className="space-y-2 rounded-xl bg-(--app-surface-2) p-4 text-sm text-(--app-ink-2)">
            <li>
              <b className="text-(--app-ink)">1.</b> Press <b>Open the search</b> — {cfg?.searchEngine === "bing" ? "Bing" : "Google"} opens in a new tab.
            </li>
            <li>
              <b className="text-(--app-ink)">2.</b> Find and open the result for:
              {cfg?.searchKeyword && (
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 break-words rounded-lg border border-(--app-line) bg-(--app-surface) px-2.5 py-1.5 font-semibold text-(--app-ink)">
                    {cfg.searchKeyword}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyKeyword(cfg.searchKeyword ?? "")}
                    aria-label="Copy the search words"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-(--app-surface) text-(--app-ink-2) hover:text-(--app-ink)"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </span>
              )}
              {task.visitConfig?.host && (
                <span className="mt-1 block text-xs text-(--app-ink-3)">
                  The right result is on <b className="text-(--app-ink-2)">{task.visitConfig.host}</b>.
                </span>
              )}
            </li>
            <li><b className="text-(--app-ink)">3.</b> Stay on the site for at least <b className="text-(--app-ink)">{stay} seconds</b>.</li>
            <li><b className="text-(--app-ink)">4.</b> Come back to this tab and press <b>Claim</b>.</li>
            <li className="text-xs text-(--app-ink-3)">Coming back sooner earns nothing — you can open it again.</li>
          </ol>
        ) : kind === "DIRECT" ? (
          <div className="rounded-xl bg-(--app-surface-2) p-4 text-center">
            <p className="inline-flex items-center gap-2 text-sm text-(--app-ink-2)">
              <Timer className="h-4 w-4 text-sky-400" /> Stay on the link for at least
            </p>
            <p className="mt-1 text-4xl font-black text-(--app-ink)">{stay}s</p>
            <p className="mt-1 text-xs text-(--app-ink-2)">Coming back sooner earns nothing — you can open it again.</p>
          </div>
        ) : (
          <ol className="list-decimal space-y-1 rounded-xl bg-(--app-surface-2) p-4 pl-8 text-sm text-(--app-ink-2)">
            <li>Press <b>Open link</b>.</li>
            <li>Go through every step of the short link (wait, press continue…).</li>
            <li>At the end you&apos;ll see your code on a RevType page (a P-XXXXXX code if that browser isn&apos;t signed in).</li>
            <li>Come back here, enter the code and press <b>Claim</b>.</li>
          </ol>
        )}

        {state.kind === "loading" && <Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-400" />}
        {state.kind === "awaiting_review" && (
          <p className="inline-flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            <Clock className="h-4 w-4" /> Sent — waiting for review.
          </p>
        )}
        {state.kind === "completed_today" && (
          <p className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Done for today — come back tomorrow.
          </p>
        )}
        {state.kind === "blocked" && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.reason}</p>}

        {state.kind === "ready" && (
          <div className="space-y-3">
            {kind === "DIRECT" && result?.outcome === "DONE" ? (
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                <CheckCircle2 className="mr-1 inline h-4 w-4" /> Visit counted ({result.elapsed}s). Claim your points.
              </div>
            ) : (
              <>
                {kind === "DIRECT" && result?.outcome === "EARLY" && (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    You came back after {result.elapsed}s — you need {result.need}s. Open the link again and stay longer.
                  </p>
                )}
                {kind === "DIRECT" && openedAt != null && (
                  <p className="text-center text-sm text-(--app-ink-2)">
                    {left > 0 ? (
                      <>Keep the link open — about <b className="text-(--app-ink)">{left}s</b> left.</>
                    ) : (
                      <>Time&apos;s up — come back to this tab.</>
                    )}
                  </p>
                )}
                {kind === "DIRECT" && outside && (
                  <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                    Opened outside the viewer — your visit will be checked by a person.
                  </p>
                )}
                <button
                  type="button"
                  onClick={inApp ? () => setViewerOpen(true) : openLink}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) py-3 text-sm font-bold text-white hover:opacity-90"
                >
                  {inApp ? (
                    <>
                      <Globe className="h-4 w-4" /> Start visit
                    </>
                  ) : kind === "DIRECT" && source === "social" ? (
                    <>
                      <Share2 className="h-4 w-4" /> {openedAt != null || result ? "Open the post again" : "Open the post"}
                    </>
                  ) : kind === "DIRECT" && source === "search" ? (
                    <>
                      <Search className="h-4 w-4" /> {openedAt != null || result ? "Open the search again" : "Open the search"}
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4" /> {openedAt != null || result ? "Open link again" : "Open link"}
                    </>
                  )}
                </button>
                {/* Where the button goes, so nobody opens an unknown link blind. */}
                {task.visitConfig?.host && (
                  <p className="inline-flex w-full items-center justify-center gap-1.5 text-xs text-(--app-ink-2)">
                    <Globe className="h-3.5 w-3.5" /> Opens: <b className="text-(--app-ink)">{task.visitConfig.host}</b>
                  </p>
                )}
              </>
            )}

            {kind === "SHORTENER" && (
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Code from the end of the link (XXXX-XXXX)"
                className="w-full rounded-xl border border-(--app-line) bg-(--app-surface-2) px-3 py-2.5 text-center font-mono text-lg tracking-widest text-(--app-ink) placeholder:text-sm placeholder:tracking-normal placeholder:text-(--app-ink-3)"
              />
            )}

            {(kind === "SHORTENER" || result?.outcome === "DONE") && (
              <button
                type="button"
                onClick={claim}
                // A shortener claim needs its code — nothing to send without it.
                disabled={busy || (kind === "SHORTENER" && !code.trim())}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Claim {task.pointsReward} pts
              </button>
            )}
          </div>
        )}
      </div>

      <AdRenderer placement="TASK_START" />

      {viewerOpen && inApp && state.kind === "ready" && (
        <VisitInAppViewer
          taskId={task.id}
          title={task.title}
          submissionId={state.submissionId}
          need={{ seconds: stay, scrollPercent: needScroll, clicks: needClicks }}
          pointsReward={task.pointsReward}
          claiming={busy}
          onClaim={claim}
          onClose={() => setViewerOpen(false)}
          onFallback={openViewerFallback}
        />
      )}
    </div>
  );
}
