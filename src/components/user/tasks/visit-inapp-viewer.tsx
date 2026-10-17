"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, CheckCircle2, Circle, ExternalLink, Loader2, MousePointerClick, PartyPopper, Play, Timer, X } from "lucide-react";

/**
 * Full-screen in-app viewer for a DIRECT visit task with `viewer: "inapp"`.
 *
 * The target page is cross-origin, so nothing inside it can be read. What we
 * CAN measure is our own frame around it:
 *  - SCROLL: the iframe is made IFRAME_HEIGHT_FACTOR × the wrapper's height and
 *    sits in a scrollable wrapper; scroll % = wrapper.scrollTop / (scrollHeight − clientHeight).
 *  - TIME: a local countdown (visible tab only) starts once the scroll item is
 *    met (or on load when scroll is off). It is only a display — the tick
 *    follows the server's `have.seconds` from /visit-progress (server clock).
 *  - CLICKS: a tap into the iframe moves focus into it, which fires a window
 *    "blur" while document.activeElement is the iframe. Count it, then hand
 *    focus back to a hidden sink so the next tap is seen too.
 * Every PROGRESS_EVERY_MS (and whenever a local item is newly met) we POST
 * /visit-progress; the server's `have`/`outcome` is the truth for the ticks.
 */

/** How many wrapper-heights tall the iframe is (the scroll range is factor − 1). */
export const IFRAME_HEIGHT_FACTOR = 3;
const PROGRESS_EVERY_MS = 5000;
const LOAD_WATCHDOG_MS = 10_000;
const CLICK_DEBOUNCE_MS = 400;
const AUTO_CLAIM_MS = 1500;

export interface VisitNeed {
  seconds: number;
  scrollPercent: number;
  clicks: number;
}

interface ProgressReply {
  outcome?: "OPEN" | "DONE";
  elapsedSec?: number;
  need?: Partial<VisitNeed>;
  have?: Partial<VisitNeed>;
}

export function VisitInAppViewer({
  taskId,
  title,
  submissionId,
  need,
  pointsReward,
  claiming,
  onClaim,
  onClose,
  onFallback,
}: {
  taskId: string;
  title: string;
  submissionId: string;
  need: VisitNeed;
  pointsReward: number;
  claiming: boolean;
  onClaim: () => void | Promise<void>;
  onClose: () => void;
  /** Called synchronously from a click — the parent opens the new-tab flow. */
  onFallback: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [started, setStarted] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadSlow, setLoadSlow] = useState(false);
  const [wrapH, setWrapH] = useState(0);

  // Local measurements (best so far).
  const [scrollPct, setScrollPct] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [localSec, setLocalSec] = useState(0);
  // Server truth.
  const [server, setServer] = useState<{ seconds: number; scrollPercent: number; clicks: number; done: boolean }>({
    seconds: 0,
    scrollPercent: 0,
    clicks: 0,
    done: false,
  });
  const [serverNeed, setServerNeed] = useState<VisitNeed>(need);

  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sinkRef = useRef<HTMLButtonElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const lastClickAt = useRef(0);
  const posting = useRef(false);
  const postAgain = useRef(false);
  const autoClaimed = useRef(false);
  const latest = useRef({ scrollPct: 0, clicks: 0 });
  useEffect(() => {
    latest.current = { scrollPct, clicks };
  }, [scrollPct, clicks]);
  // The parent's claim is a fresh function each render — keep the latest one
  // without restarting the auto-claim timer.
  const onClaimRef = useRef(onClaim);
  useEffect(() => {
    onClaimRef.current = onClaim;
  }, [onClaim]);

  const needScroll = Math.max(0, serverNeed.scrollPercent || 0);
  const needClicks = Math.max(0, serverNeed.clicks || 0);
  const needSec = Math.max(0, serverNeed.seconds || 0);

  const scrollMetLocal = needScroll === 0 || scrollPct >= needScroll;
  const scrollTick = needScroll === 0 || server.scrollPercent >= needScroll;
  const timeTick = server.done || server.seconds >= needSec;
  const clicksTick = needClicks === 0 || server.clicks >= needClicks;
  const allDone = server.done;
  const phase: "intro" | "running" | "done" = !started ? "intro" : allDone ? "done" : "running";
  const timerRunning = phase === "running" && loaded && scrollMetLocal && !timeTick;
  const secLeft = Math.max(0, needSec - Math.max(localSec, server.seconds));

  useEffect(() => setMounted(true), []);

  // Lock the page behind the viewer.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Wrapper height → iframe height.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || phase === "intro") return;
    const ro = new ResizeObserver(() => setWrapH(el.clientHeight));
    ro.observe(el);
    setWrapH(el.clientHeight);
    return () => ro.disconnect();
  }, [phase]);

  // ── Server progress ─────────────────────────────────────────────
  const postProgress = useCallback(async (): Promise<void> => {
    // One request at a time; a call made meanwhile runs once it's back.
    if (posting.current) {
      postAgain.current = true;
      return;
    }
    posting.current = true;
    try {
      const r = await fetch(`/api/tasks/${taskId}/visit-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          scrollPercent: Math.round(latest.current.scrollPct),
          clicks: latest.current.clicks,
        }),
      });
      const d = (await r.json().catch(() => null)) as ProgressReply | null;
      if (!r.ok || !d) return;
      if (d.need) {
        setServerNeed((n) => ({
          seconds: typeof d.need?.seconds === "number" ? d.need.seconds : n.seconds,
          scrollPercent: typeof d.need?.scrollPercent === "number" ? d.need.scrollPercent : n.scrollPercent,
          clicks: typeof d.need?.clicks === "number" ? d.need.clicks : n.clicks,
        }));
      }
      setServer((s) => ({
        seconds: Math.max(s.seconds, Number(d.have?.seconds ?? d.elapsedSec ?? 0) || 0),
        scrollPercent: Math.max(s.scrollPercent, Number(d.have?.scrollPercent ?? 0) || 0),
        clicks: Math.max(s.clicks, Number(d.have?.clicks ?? 0) || 0),
        done: s.done || d.outcome === "DONE",
      }));
    } catch {
      /* offline for a moment — the next beat retries */
    } finally {
      posting.current = false;
      if (postAgain.current) {
        postAgain.current = false;
        void postProgressRef.current?.();
      }
    }
  }, [taskId, submissionId]);
  const postProgressRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    postProgressRef.current = postProgress;
  }, [postProgress]);

  // Heartbeat while running and visible.
  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void postProgress();
    }, PROGRESS_EVERY_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void postProgress();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [phase, postProgress]);

  // Post right away when a local item is newly met.
  const clicksMetLocal = needClicks === 0 || clicks >= needClicks;
  const timeMetLocal = localSec >= needSec;
  useEffect(() => {
    if (phase === "running" && (scrollMetLocal || clicksMetLocal || timeMetLocal)) void postProgress();
  }, [phase, scrollMetLocal, clicksMetLocal, timeMetLocal, postProgress]);

  // Each counted click is sent (clicks are few).
  useEffect(() => {
    if (phase === "running" && clicks > 0) void postProgress();
  }, [phase, clicks, postProgress]);

  // Local countdown — visible tab only.
  useEffect(() => {
    if (!timerRunning) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") setLocalSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [timerRunning]);

  // Server says DONE → celebrate, then claim.
  useEffect(() => {
    if (phase !== "done" || autoClaimed.current) return;
    const t = setTimeout(() => {
      if (autoClaimed.current) return;
      autoClaimed.current = true;
      void onClaimRef.current();
    }, AUTO_CLAIM_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // ── Load watchdog ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running" || loaded) return;
    const t = setTimeout(() => setLoadSlow(true), LOAD_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [phase, loaded]);

  // ── Scroll ──────────────────────────────────────────────────────
  const onWrapScroll = () => {
    const el = wrapRef.current;
    if (!el || phase !== "running") return;
    const range = el.scrollHeight - el.clientHeight;
    if (range <= 0) return;
    const pct = Math.min(100, Math.max(0, (el.scrollTop / range) * 100));
    setScrollPct((p) => (pct > p ? pct : p));
  };

  // ── Clicks into the iframe ──────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const onBlur = () => {
      // activeElement is updated just after the blur event.
      setTimeout(() => {
        if (document.activeElement !== iframeRef.current) return;
        const now = Date.now();
        if (now - lastClickAt.current >= CLICK_DEBOUNCE_MS) {
          lastClickAt.current = now;
          setClicks((c) => c + 1);
        }
        // Hand focus back so the next tap blurs the window again.
        setTimeout(() => {
          sinkRef.current?.focus({ preventScroll: true });
          window.focus();
        }, 60);
      }, 0);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [phase]);

  // ── Close / keyboard ────────────────────────────────────────────
  const requestClose = useCallback(() => {
    if (phase === "done" || phase === "intro") return onClose();
    setConfirmLeave(true);
  }, [phase, onClose]);

  const dialogRef = confirmLeave ? confirmRef : phase === "intro" ? introRef : null;
  useEffect(() => {
    const box = dialogRef?.current;
    box?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (confirmLeave) setConfirmLeave(false);
        else requestClose();
        return;
      }
      if (e.key !== "Tab" || !box) return;
      const items = Array.from(
        box.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialogRef, confirmLeave, requestClose]);

  const fallback = () => {
    onFallback();
    onClose();
  };

  if (!mounted) return null;

  const steps: { key: string; icon: ReactNode; label: string; detail: string; done: boolean }[] = [];
  if (needScroll > 0) {
    steps.push({
      key: "scroll",
      icon: <ArrowDown className="h-4 w-4" />,
      label: `Scroll ${needScroll}%`,
      detail: scrollTick ? "Done" : `${Math.round(scrollPct)}%`,
      done: scrollTick,
    });
  }
  steps.push({
    key: "stay",
    icon: <Timer className="h-4 w-4" />,
    label: `Stay ${needSec}s`,
    detail: timeTick ? "Done" : scrollMetLocal ? (secLeft > 0 ? `${secLeft}s left` : "Checking…") : "After scrolling",
    done: timeTick,
  });
  if (needClicks > 0) {
    steps.push({
      key: "clicks",
      icon: <MousePointerClick className="h-4 w-4" />,
      label: `Click ${needClicks} time${needClicks === 1 ? "" : "s"}`,
      detail: clicksTick ? "Done" : `${Math.min(clicks, needClicks)}/${needClicks}`,
      done: clicksTick,
    });
  }

  const introText: Record<string, string> = {
    scroll: `Scroll down the page until you've seen at least ${needScroll}% of it.`,
    stay: `Stay on the page for ${needSec} seconds${needScroll > 0 ? " — the timer starts once you've scrolled" : ""}. Keep this tab open; the timer pauses if you leave.`,
    clicks: `Tap or click on the page ${needClicks} time${needClicks === 1 ? "" : "s"} (open something that interests you).`,
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Visit: ${title}`}
      className="fixed inset-0 z-1000 flex flex-col bg-(--app-page) pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      {/* Focus sink: focus returns here after each tap into the page. */}
      <button ref={sinkRef} type="button" tabIndex={-1} aria-hidden="true" className="sr-only" />

      {/* Header */}
      <header className="shrink-0 border-b border-(--app-line) bg-(--app-surface) px-3 py-2">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-(--app-ink)">{title}</p>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close viewer"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-(--app-surface-2) text-(--app-ink-2) hover:text-(--app-ink)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Checklist" aria-live="polite">
          {steps.map((s) => (
            <li
              key={s.key}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                s.done ? "bg-emerald-500/15 text-emerald-400" : "bg-(--app-surface-2) text-(--app-ink-2)"
              }`}
            >
              {s.done ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3.5 w-3.5" aria-hidden />}
              <span>{s.label}</span>
              <span className={s.done ? "sr-only" : "text-(--app-ink-3)"}>· {s.detail}</span>
              {s.done && <span className="sr-only">done</span>}
            </li>
          ))}
        </ul>
      </header>

      {/* Body */}
      <div className="relative min-h-0 flex-1">
        {phase !== "intro" && (
          <div ref={wrapRef} onScroll={onWrapScroll} className="absolute inset-0 overflow-y-auto overscroll-contain">
            {/* A thin rail on the right is part of the wrapper, not the page —
                drag/scroll there when the page itself swallows the scroll. */}
            <div className="flex">
              <iframe
                ref={iframeRef}
                title={`Task page — ${title}`}
                src={`/go/task/${taskId}?s=${encodeURIComponent(submissionId)}&inapp=1`}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                onLoad={() => setLoaded(true)}
                style={{ height: wrapH > 0 ? wrapH * IFRAME_HEIGHT_FACTOR : "300vh" }}
                className="block min-w-0 flex-1 border-0 bg-white"
              />
              <div aria-hidden className="w-3 shrink-0 bg-(--app-surface-2)" />
            </div>
          </div>
        )}

        {phase === "running" && !loaded && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Loader2 className="h-7 w-7 text-sky-400 motion-safe:animate-spin" aria-label="Loading page" />
          </div>
        )}

        {phase === "running" && loaded && !scrollTick && needScroll > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white">
              Scroll down <ArrowDown className="h-3.5 w-3.5 motion-safe:animate-bounce" aria-hidden />
            </span>
          </div>
        )}

        {phase === "running" && loadSlow && !loaded && (
          <div className="absolute inset-x-3 top-3 rounded-xl border border-amber-500/30 bg-(--app-surface) p-3 text-sm text-(--app-ink-2) shadow-lg">
            <p>The page is taking a long time to load.</p>
            <button
              type="button"
              onClick={fallback}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2 text-sm font-bold text-white hover:bg-sky-500"
            >
              <ExternalLink className="h-4 w-4" /> Open in a new tab
            </button>
          </div>
        )}

        {/* Intro popup */}
        {phase === "intro" && (
          <div className="absolute inset-0 grid place-items-center bg-black/50 p-4">
            <div
              ref={introRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="visit-intro-title"
              className="w-full max-w-sm rounded-2xl border border-(--app-line) bg-(--app-surface) p-5 shadow-xl"
            >
              <h2 id="visit-intro-title" className="text-base font-bold text-(--app-ink)">
                What to do
              </h2>
              <ol className="mt-3 space-y-3">
                {steps.map((s, i) => (
                  <li key={s.key} className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-500/15 text-sky-400">{s.icon}</span>
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold text-(--app-ink)">
                        {i + 1}. {s.label}
                      </p>
                      <p className="text-(--app-ink-2)">{introText[s.key]}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-(--app-ink-3)">Each item gets a tick when it&apos;s done. When all are ticked, your points are claimed.</p>
              <button
                type="button"
                data-autofocus
                onClick={() => setStarted(true)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) py-3 text-sm font-bold text-white hover:opacity-90"
              >
                <Play className="h-4 w-4" /> Start
              </button>
            </div>
          </div>
        )}

        {/* All done */}
        {phase === "done" && (
          <div className="absolute inset-0 grid place-items-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-emerald-500/30 bg-(--app-surface) p-5 text-center shadow-xl" role="status">
              <PartyPopper className="mx-auto h-10 w-10 text-emerald-400" aria-hidden />
              <h2 className="mt-2 text-lg font-bold text-(--app-ink)">All done!</h2>
              <p className="mt-1 text-sm text-(--app-ink-2)">Every item is ticked.</p>
              <button
                type="button"
                onClick={() => {
                  autoClaimed.current = true;
                  void onClaim();
                }}
                disabled={claiming}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {claiming && <Loader2 className="h-4 w-4 motion-safe:animate-spin" />} Claim {pointsReward} pts
              </button>
            </div>
          </div>
        )}

        {/* Leave? */}
        {confirmLeave && (
          <div className="absolute inset-0 grid place-items-center bg-black/50 p-4">
            <div
              ref={confirmRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="visit-leave-title"
              className="w-full max-w-xs rounded-2xl border border-(--app-line) bg-(--app-surface) p-5 shadow-xl"
            >
              <h2 id="visit-leave-title" className="text-sm font-bold text-(--app-ink)">
                Leave? Your progress on this visit will be lost.
              </h2>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  data-autofocus
                  onClick={() => setConfirmLeave(false)}
                  className="flex-1 rounded-lg bg-(--app-surface-2) py-2 text-sm font-semibold text-(--app-ink)"
                >
                  Stay
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-500"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Always-there fallback */}
      <footer className="shrink-0 border-t border-(--app-line) bg-(--app-surface) px-3 py-1.5 text-center">
        <button type="button" onClick={fallback} className="inline-flex items-center gap-1 text-xs text-(--app-ink-2) underline-offset-2 hover:underline">
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Page not loading? Open in a new tab
        </button>
      </footer>
    </div>,
    document.body,
  );
}
