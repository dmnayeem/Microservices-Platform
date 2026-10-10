"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, Coins, ExternalLink, Loader2, Scissors, Sparkles, Timer } from "lucide-react";
import { toast } from "@/lib/toast";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { runInterstitial } from "@/lib/reward-interstitial";
import { TaskUpgradeNotice, isUpgradeRequired, AdblockNotice } from "@/components/user/primitives/task-upgrade-notice";
import { ensureAdsAllowed } from "@/lib/adblock";

/**
 * A VISIT task (lib/visit-tasks.ts).
 *  DIRECT: Open link → stay the shown time → come back → Claim. Back too soon
 *  = no points (open it again). The time is measured on the server.
 *  SHORTENER: Open link → finish every step of the short link → our page shows
 *  your code → enter it here → Claim.
 */

interface VisitTask {
  id: string;
  title: string;
  description?: string | null;
  pointsReward: number;
  xpReward: number;
  visitConfig?: { kind?: string; staySeconds?: number; minSeconds?: number } | null;
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

  const kind = task?.visitConfig?.kind === "SHORTENER" ? "SHORTENER" : "DIRECT";
  const stay = task?.visitConfig?.staySeconds ?? 30;
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

        {kind === "DIRECT" ? (
          <div className="rounded-xl bg-(--app-surface-2) p-4 text-center">
            <p className="inline-flex items-center gap-2 text-sm text-(--app-ink-2)">
              <Timer className="h-4 w-4 text-sky-400" /> Stay on the link for at least
            </p>
            <p className="mt-1 text-4xl font-black text-(--app-ink)">{stay}s</p>
            <p className="mt-1 text-xs text-(--app-ink-3)">Coming back sooner earns nothing — you can open it again.</p>
          </div>
        ) : (
          <ol className="list-decimal space-y-1 rounded-xl bg-(--app-surface-2) p-4 pl-8 text-sm text-(--app-ink-2)">
            <li>Press <b>Open link</b>.</li>
            <li>Go through every step of the short link (wait, press continue…).</li>
            <li>At the end you&apos;ll see your own code on a RevType page.</li>
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
                <button
                  type="button"
                  onClick={openLink}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) py-3 text-sm font-bold text-white hover:opacity-90"
                >
                  <ExternalLink className="h-4 w-4" /> {openedAt != null || result ? "Open link again" : "Open link"}
                </button>
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
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Claim {task.pointsReward} pts
              </button>
            )}
          </div>
        )}
      </div>

      <AdRenderer placement="TASK_START" />
    </div>
  );
}
