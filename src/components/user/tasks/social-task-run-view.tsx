"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Upload,
  Loader2,
  Sparkles,
  Copy,
  Check,
  PlayCircle,
  CheckCircle2,
  Lock,
  ShieldCheck,
  ChevronDown,
  Play,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { notifyCenter } from "@/lib/notify-center";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/ui/brand-icon";
import {
  SOCIAL_PLATFORMS,
  getAction,
  isWatchAction,
  mapSocialTaskRow,
  primarySocialVideo,
  type SocialTaskView,
  type SocialTaskItemView,
} from "@/lib/social-tasks";
import { ProofImageUpload } from "@/components/user/tasks/proof-image-upload";
import { SocialWatchModal } from "@/components/user/tasks/social-watch-modal";
import { InlineVideoEmbed } from "@/components/user/primitives/inline-video-embed";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { runInterstitial } from "@/lib/reward-interstitial";
import {
  TaskUpgradeNotice,
  isUpgradeRequired,
  TaskLockedNotice,
  isTaskLocked,
  AdblockNotice,
} from "@/components/user/primitives/task-upgrade-notice";
import { ensureAdsAllowed } from "@/lib/adblock";

type ItemProof = { url: string; screenshot: string; username: string };
const EMPTY_PROOF: ItemProof = { url: "", screenshot: "", username: "" };

const PLATFORM_LOOKUP = Object.fromEntries(
  SOCIAL_PLATFORMS.map((p) => [p.key, p])
);

/** True when this item uses the timed watch-lock (watch action + duration set). */
function isWatchLocked(item: SocialTaskItemView): boolean {
  return isWatchAction(item.action) && !!item.watchSeconds && item.watchSeconds > 0;
}

/**
 * Build the AI prompt for an action from the task's own title/description, the
 * admin's reference content (the AI-generatable field the admin filled), and any
 * extra guidance the admin added. Comment actions produce a short 1–2 line unique
 * comment; content/post actions produce an original variant of the reference.
 */
function buildAiPrompt(
  def: { aiGeneratableFields?: string[]; key?: string; label?: string } | null,
  item: SocialTaskItemView,
  task: { title?: string | null; description?: string | null }
): string {
  const genFields = def?.aiGeneratableFields ?? [];
  const keyLabel = `${def?.key ?? ""} ${def?.label ?? ""}`;
  const isReview = /review/i.test(keyLabel);
  const isComment =
    !isReview &&
    (genFields.some((k) => /comment/i.test(k)) || /comment|reply/i.test(keyLabel));
  // Use EVERY AI-generatable field the admin filled as the reference (multi-field
  // actions like postTitle+postBody / pinTitle+pinDescription would otherwise lose
  // the body).
  const adminContent = genFields
    .map((k) => (item.fields?.[k] ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const extra = (item.aiPrompt ?? "").trim();
  const topic = [task.title ?? "", task.description ?? ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(". ");

  if (isComment) {
    return [
      "Write ONE short, original, natural-sounding comment (1 to 2 lines maximum, no quotation marks, no hashtags unless they fit naturally).",
      topic && `It is about: ${topic}.`,
      adminContent &&
        `Keep a similar tone/style to this example but reword it and make it unique: "${adminContent}".`,
      extra && `Extra guidance: ${extra}.`,
      "Make it unique, human and specific. Return ONLY the comment text.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (isReview) {
    return [
      "Write an original, honest-sounding review (2 to 4 sentences) in first person.",
      topic && `It is about: ${topic}.`,
      adminContent &&
        `Similar in spirit to this example, but reworded and unique: "${adminContent}".`,
      extra && `Extra guidance: ${extra}.`,
      "Make it natural, specific and unique. Return ONLY the review text.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    "Write an original social media post — same topic and tone as the reference, but reworded and unique (do not copy it).",
    adminContent && `Reference: "${adminContent}".`,
    topic && `Topic: ${topic}.`,
    extra && `Extra guidance: ${extra}.`,
    "Keep it engaging and natural. Return ONLY the post text.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function SocialTaskRunView({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<SocialTaskView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [lockedMsg, setLockedMsg] = useState<string | null>(null);
  const [adBlocked, setAdBlocked] = useState(false);

  const [proofByIndex, setProofByIndex] = useState<Record<number, ItemProof>>({});
  const [aiOutputByIndex, setAiOutputByIndex] = useState<Record<number, string>>({});
  const [watchedByIndex, setWatchedByIndex] = useState<Record<number, boolean>>({});
  // Explicit "I did this" marks for actions that have no watch/proof to gauge
  // completion — only used to unlock the next action in a sequential bundle.
  const [doneByIndex, setDoneByIndex] = useState<Record<number, boolean>>({});
  const [watchModal, setWatchModal] = useState<
    { idx: number; url: string; seconds: number; title: string } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [generatingAi, setGeneratingAi] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // A PENDING submission is created on load (or resumed) so the submit route
  // has something to attach to, and its clock runs while the user completes
  // the actions.
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  // Gate progress-saving until the initial load + resume finished, so an empty
  // first render never overwrites previously-saved progress.
  const [hydrated, setHydrated] = useState(false);
  // Per-user auto-verify codes (item index → code), from the task GET response.
  const [verifyCodes, setVerifyCodes] = useState<Record<number, string>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror of submissionId for async callers, plus a shared in-flight /start
  // promise so mount + submit never fire two concurrent /start calls (which
  // would create duplicate PENDING submissions / double-count the daily limit).
  const submissionIdRef = useRef<string | null>(null);
  const startPromiseRef = useRef<Promise<{
    id: string | null;
    metadata?: unknown;
  }> | null>(null);

  const ensureSubmission = () => {
    if (submissionIdRef.current)
      return Promise.resolve({
        id: submissionIdRef.current,
        metadata: undefined as unknown,
      });
    if (startPromiseRef.current) return startPromiseRef.current;
    const p = (async () => {
      // Ad-blocker gate: refuse to start while a blocker is active.
      if (!(await ensureAdsAllowed())) {
        setAdBlocked(true);
        throw new Error("Ad blocker active");
      }
      const sr = await fetch(`/api/tasks/${taskId}/start`, { method: "POST" });
      const sd = await sr.json().catch(() => ({}));
      if (!sr.ok) {
        // Daily-mission allowance exhausted → surface the upgrade prompt.
        if (isUpgradeRequired(sd)) setUpgradeMsg(sd.error || "");
        // Blocked behind an earlier task in the chain (feature #7).
        if (isTaskLocked(sd)) setLockedMsg(sd.error || "");
        throw new Error(sd?.error || "Couldn't start the task");
      }
      const id = (sd.submission?.id as string | undefined) ?? null;
      if (id) {
        submissionIdRef.current = id;
        setSubmissionId(id);
      }
      return { id, metadata: sd.submission?.metadata };
    })();
    startPromiseRef.current = p;
    // On failure clear the cache so a later attempt (e.g. submit) can retry.
    p.catch(() => {
      startPromiseRef.current = null;
    });
    return p;
  };

  // Restore per-action progress saved earlier (watched flags, proof, AI) from
  // the resumed submission's metadata so a reload resumes instead of restarting.
  const hydrateProgress = (
    loadedTask: ReturnType<typeof mapSocialTaskRow>,
    metadata: unknown
  ) => {
    const rawItems =
      metadata &&
      typeof metadata === "object" &&
      Array.isArray((metadata as Record<string, unknown>).items)
        ? ((metadata as { items: unknown[] }).items as Array<
            Record<string, unknown>
          >)
        : null;
    if (!rawItems) return;
    const proof: Record<number, ItemProof> = {};
    const watched: Record<number, boolean> = {};
    const done: Record<number, boolean> = {};
    const ai: Record<number, string> = {};
    // Progress is saved positionally (items[idx] ⟷ task.items[idx]). Match by
    // INDEX, not action key — action keys aren't unique (a task can bundle the
    // same action twice), so a by-action map would collapse duplicates and, e.g.,
    // mark an unwatched item as watched.
    loadedTask.items.forEach((item, idx) => {
      const s = rawItems[idx];
      // Guard against a stale/reordered save: only apply when the action matches.
      if (!s || (typeof s.action === "string" && s.action !== item.action))
        return;
      const url = typeof s.proofUrl === "string" ? s.proofUrl : "";
      const screenshot =
        typeof s.screenshotUrl === "string" ? s.screenshotUrl : "";
      const username = typeof s.username === "string" ? s.username : "";
      if (url || screenshot || username)
        proof[idx] = { url, screenshot, username };
      if (typeof s.generatedContent === "string" && s.generatedContent.trim())
        ai[idx] = s.generatedContent;
      if (s.watched === true) watched[idx] = true;
      if (s.done === true) done[idx] = true;
    });
    if (Object.keys(proof).length) setProofByIndex(proof);
    if (Object.keys(watched).length) setWatchedByIndex(watched);
    if (Object.keys(done).length) setDoneByIndex(done);
    if (Object.keys(ai).length) setAiOutputByIndex(ai);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/tasks/${taskId}`);
        if (!r.ok) throw new Error(String(r.status));
        const d = await r.json();
        if (cancelled) return;
        if (!d?.task) {
          setNotFound(true);
          return;
        }
        const mapped = mapSocialTaskRow(d.task);
        setTask(mapped);
        if (d.socialVerifyCodes && typeof d.socialVerifyCodes === "object") {
          setVerifyCodes(d.socialVerifyCodes as Record<number, string>);
        }
        // Start (or resume) the submission so we have an id to submit with.
        // Failures here are non-fatal — submit() will retry and surface them.
        // ensureSubmission() de-dupes concurrent /start calls (see M2).
        try {
          const started = await ensureSubmission();
          if (!cancelled && started.id) {
            // Resume: rehydrate per-action progress saved earlier so a reload
            // (or leaving the page mid-task) doesn't start from scratch.
            hydrateProgress(mapped, started.metadata);
          }
        } catch {
          /* submit() retries /start */
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // ensureSubmission only closes over taskId (+ stable refs/setters); keying
    // the effect on taskId alone is intentional — it must run once per task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // Auto-save partial progress (debounced) whenever watched/proof/AI changes,
  // so leaving or reloading mid-task resumes instead of restarting.
  useEffect(() => {
    if (!hydrated || !task || !submissionId || submitted) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const t = task;
    const sid = submissionId;
    saveTimer.current = setTimeout(() => {
      const items = t.items.map((item, idx) => {
        const p = proofByIndex[idx] ?? EMPTY_PROOF;
        const ai = aiOutputByIndex[idx];
        const out: Record<string, string | boolean> = { action: item.action };
        if (p.url) out.proofUrl = p.url;
        if (p.screenshot) out.screenshotUrl = p.screenshot;
        if (p.username) out.username = p.username;
        if (ai && ai.trim()) out.generatedContent = ai;
        if (watchedByIndex[idx]) out.watched = true;
        if (doneByIndex[idx]) out.done = true;
        return out;
      });
      void fetch(`/api/tasks/${t.id}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: sid, items }),
        keepalive: true,
      }).catch(() => {});
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [
    hydrated,
    task,
    submissionId,
    submitted,
    proofByIndex,
    aiOutputByIndex,
    watchedByIndex,
    doneByIndex,
  ]);

  const platform = task ? PLATFORM_LOOKUP[task.platform] : null;

  const setProof = (idx: number, patch: Partial<ItemProof>) => {
    setProofByIndex((prev) => ({
      ...prev,
      [idx]: { ...(prev[idx] ?? EMPTY_PROOF), ...patch },
    }));
  };

  const isItemReady = (item: SocialTaskItemView, idx: number): boolean => {
    const p = proofByIndex[idx] ?? EMPTY_PROOF;
    const req = item.proofRequirements;
    if (isWatchLocked(item) && !watchedByIndex[idx]) return false;
    if (req.url && !p.url.trim()) return false;
    if (req.screenshot && !p.screenshot.trim()) return false;
    if (req.username && !p.username.trim()) return false;
    return true;
  };

  // Sequential-unlock helpers ----------------------------------------------
  // An action has a "requirement" if it's watch-locked or asks for any proof —
  // otherwise we can't tell it's done without an explicit "I did this" tap.
  const itemHasRequirement = (item: SocialTaskItemView): boolean =>
    isWatchLocked(item) ||
    item.proofRequirements.url ||
    item.proofRequirements.screenshot ||
    item.proofRequirements.username;

  // "Previous step finished" — what unlocks the next action in a sequential
  // bundle: its watch/proof requirement met, or (if it has none) marked done.
  const isItemDone = (item: SocialTaskItemView, idx: number): boolean => {
    if (!isItemReady(item, idx)) return false;
    if (itemHasRequirement(item)) return true;
    return !!doneByIndex[idx];
  };

  // Whether an item is interactive. Non-sequential tasks are all unlocked; a
  // sequential task unlocks item N only once item N-1 is done. YouTube/video
  // tasks are ALWAYS sequential (the capslock flow).
  const isItemUnlocked = (idx: number): boolean => {
    const videoFlow =
      !!task &&
      (task.platform === "YOUTUBE" ||
        task.items.some((it) => isWatchAction(it.action)));
    if ((!task?.sequential && !videoFlow) || idx === 0) return true;
    const prev = task!.items[idx - 1];
    return !!prev && isItemDone(prev, idx - 1);
  };

  const generateAi = async (idx: number, prompt: string) => {
    setGeneratingAi(idx);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.info(d.error || "AI not available — please write it yourself");
        return;
      }
      const d = await res.json();
      setAiOutputByIndex((prev) => ({ ...prev, [idx]: d.text ?? d.content ?? "" }));
      toast.success("Generated — review and post it");
    } catch {
      toast.info("Please write it yourself this time");
    } finally {
      setGeneratingAi(null);
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  };

  const submit = async () => {
    if (!task) return;
    const items = task.items;
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const req = item.proofRequirements;
      const p = proofByIndex[idx] ?? EMPTY_PROOF;
      const def = getAction(task.platform, item.action);
      const label = def?.label ?? `Action ${idx + 1}`;
      if (isWatchLocked(item) && !watchedByIndex[idx]) {
        toast.error(`${label}: watch to unlock first`);
        return;
      }
      if (req.url && !p.url.trim()) {
        toast.error(`${label}: proof URL is required`);
        return;
      }
      if (req.screenshot && !p.screenshot.trim()) {
        toast.error(`${label}: screenshot is required`);
        return;
      }
      if (req.username && !p.username.trim()) {
        toast.error(`${label}: your username is required`);
        return;
      }
      // Sequential bundle: a no-requirement action must be explicitly marked
      // done (otherwise a middle step could be skipped past).
      if (task.sequential && !itemHasRequirement(item) && !doneByIndex[idx]) {
        toast.error(`${label}: tap "I did this" first`);
        return;
      }
    }
    setBusy(true);
    try {
      // Ensure a PENDING submission exists (the submit route requires one).
      // Shares the in-flight /start promise with mount so we never create two.
      const sid = submissionId ?? (await ensureSubmission()).id;
      if (!sid) throw new Error("Couldn't start the task");

      const payloadItems = items.map((item, idx) => {
        const req = item.proofRequirements;
        const p = proofByIndex[idx] ?? EMPTY_PROOF;
        const ai = aiOutputByIndex[idx];
        const out: Record<string, string | boolean> = { action: item.action };
        if (req.url) out.proofUrl = p.url;
        if (req.screenshot) out.screenshotUrl = p.screenshot;
        if (req.username) out.username = p.username;
        if (ai && ai.trim()) out.generatedContent = ai;
        if (isWatchLocked(item) && watchedByIndex[idx]) out.watched = true;
        if (doneByIndex[idx]) out.done = true;
        return out;
      });

      const res = await fetch(`/api/tasks/${task.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: sid, items: payloadItems }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Couldn't submit the task");
      }
      await runInterstitial();
      setSubmitted(true);
      notifyCenter.success("Submitted!", "Awaiting verification.");
    } catch (err) {
      notifyCenter.error(
        "Couldn't submit",
        err instanceof Error ? err.message : "Try again"
      );
    } finally {
      setBusy(false);
    }
  };

  // ── States ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-20 flex justify-center">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (upgradeMsg !== null) {
    return <TaskUpgradeNotice message={upgradeMsg} />;
  }

  if (lockedMsg !== null) {
    return <TaskLockedNotice message={lockedMsg} />;
  }

  if (adBlocked) {
    return <AdblockNotice />;
  }

  if (notFound || !task || !platform) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-3">
        <p className="text-white font-semibold">This social task isn&apos;t available.</p>
        <Link
          href="/social-tasks"
          className="inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300"
        >
          <ArrowLeft className="w-4 h-4" /> Back to social tasks
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-9 h-9 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Submitted!</h1>
          <p className="text-sm text-gray-400 mt-1">
            Your proof is awaiting verification.{" "}
            <span className="text-amber-400 font-semibold">
              +{task.pointsReward.toLocaleString()} pts
            </span>{" "}
            pending.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Link
            href="/social-tasks"
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to social tasks
          </Link>
          <Link
            href="/social-tasks?tab=submitted"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold"
          >
            View my submissions
          </Link>
        </div>
      </div>
    );
  }

  const readyCount = task.items.filter((it, idx) => isItemReady(it, idx)).length;
  const total = task.items.length;
  const pct = total > 0 ? (readyCount / total) * 100 : 0;

  // ── YouTube/video flow: play the video first (player collapses when watched),
  //    then the actions run strictly one-at-a-time (capslock). ──
  const videoFlow =
    task.platform === "YOUTUBE" || task.items.some((it) => isWatchAction(it.action));
  const primaryVideo = videoFlow ? primarySocialVideo(task.items) : null;
  // The primary video is "watched" when: it needs no enforced watch (0s), or its
  // watch item has been completed. Non-video tasks are always "watched".
  const videoWatched =
    !primaryVideo ||
    primaryVideo.watchSeconds === 0 ||
    !!watchedByIndex[primaryVideo.itemIndex];
  // A pure WATCH action that IS the primary video is represented by the hero, so
  // it isn't re-rendered as its own step.
  const heroWatchIdx =
    primaryVideo && isWatchAction(task.items[primaryVideo.itemIndex]?.action)
      ? primaryVideo.itemIndex
      : -1;
  const openPrimaryVideo = () =>
    primaryVideo &&
    setWatchModal({
      idx: primaryVideo.itemIndex,
      url: primaryVideo.url,
      seconds: primaryVideo.watchSeconds || 30,
      title: task.title,
    });

  // ── Run page ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28">
      <Link
        href="/social-tasks"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to social tasks
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0",
              platform.brandColor
            )}
          >
            <BrandIcon brand={platform.key} fallback={platform.emoji} className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              {platform.label} · Social Task
            </p>
            <h1 className="text-lg sm:text-xl font-bold text-white mt-0.5">
              {task.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-300">
                {total} action{total > 1 ? "s" : ""}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400">
                +{task.pointsReward.toLocaleString()} pts
              </span>
              {task.difficulty && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-800 text-gray-300 capitalize">
                  {task.difficulty.toLowerCase()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-gray-400 font-medium">Your progress</span>
            <span className="text-white font-bold tabular-nums">
              {readyCount} / {total} ready
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-indigo-500 to-emerald-500 transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <AdRenderer placement="TASK_START" />

      {/* Intro */}
      {task.description && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
            About this task
          </p>
          <p className="text-sm text-gray-300 whitespace-pre-wrap">
            {task.description}
          </p>
        </div>
      )}

      {task.instructions && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">
            Steps
          </p>
          <ol className="space-y-1 text-sm text-gray-300 list-decimal pl-4">
            {task.instructions
              .split("\n")
              .filter(Boolean)
              .map((line, i) => (
                <li key={i}>{line}</li>
              ))}
          </ol>
        </div>
      )}

      {task.instructionVideoUrl && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            Instruction video
          </p>
          <InlineVideoEmbed
            url={task.instructionVideoUrl}
            title={`Instruction video — ${task.title}`}
          />
        </div>
      )}

      {total === 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          This task has no actions configured yet. Please check back later or
          contact support.
        </div>
      )}

      {/* Video-first player — for YouTube/video tasks the video opens in the
          player first; once watched it collapses to a bar and the steps unlock. */}
      {primaryVideo && (
        videoWatched ? (
          <button
            type="button"
            onClick={openPrimaryVideo}
            className="w-full flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-left"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-white truncate">
                Video watched
              </span>
              <span className="block text-[11px] text-emerald-200/80">
                Tap to replay the video
              </span>
            </span>
            <ChevronDown className="w-4 h-4 text-emerald-300 shrink-0" />
          </button>
        ) : (
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-indigo-500/20 grid place-items-center">
              <PlayCircle className="w-8 h-8 text-indigo-300" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Watch the video first</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Watch {primaryVideo.watchSeconds}s to unlock the steps below.
              </p>
            </div>
            <button
              type="button"
              onClick={openPrimaryVideo}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold"
            >
              <Play className="w-4 h-4" />
              Play video
            </button>
          </div>
        )
      )}

      {/* Ordered action cards */}
      {task.items.map((item, idx) => {
        // The primary watch video is shown by the hero above — skip its card.
        if (idx === heroWatchIdx) return null;
        const def = getAction(task.platform, item.action);
        const proof = proofByIndex[idx] ?? EMPTY_PROOF;
        const aiOutput = aiOutputByIndex[idx] ?? "";
        const req = item.proofRequirements;
        const ready = isItemReady(item, idx);
        const unlocked = isItemUnlocked(idx);
        const noReq = !itemHasRequirement(item);
        const markedDone = !!doneByIndex[idx];
        const done = isItemDone(item, idx);
        // Capslock (video flow): completed steps collapse to a ✓ row; locked
        // future steps show a compact locked row; only the active step expands.
        if (videoFlow && done) {
          return (
            <div
              key={idx}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-sm text-white truncate">
                {def ? `${def.emoji} ${def.label}` : item.action}
              </span>
              <span className="ml-auto text-emerald-400 font-bold text-xs tabular-nums shrink-0">
                +{item.points}
              </span>
            </div>
          );
        }
        if (videoFlow && (!unlocked || !videoWatched)) {
          return (
            <div
              key={idx}
              className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2.5 opacity-60"
            >
              <Lock className="w-4 h-4 text-gray-500 shrink-0" />
              <span className="text-sm text-gray-400 truncate">
                {def ? `${def.emoji} ${def.label}` : item.action}
              </span>
              <span className="ml-auto text-[10px] font-semibold uppercase text-gray-600 shrink-0">
                Locked
              </span>
            </div>
          );
        }
        return (
          <div
            key={idx}
            className={cn(
              "rounded-xl border bg-gray-900 p-4 space-y-3 transition-colors",
              !unlocked
                ? "border-gray-800 opacity-60"
                : ready
                  ? "border-emerald-500/40"
                  : "border-gray-800"
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0",
                  !unlocked
                    ? "bg-gray-800 text-gray-500"
                    : ready
                      ? "bg-emerald-500 text-white"
                      : "bg-indigo-500/20 text-indigo-300"
                )}
              >
                {!unlocked ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : ready ? (
                  <Check className="w-4 h-4" />
                ) : (
                  idx + 1
                )}
              </span>
              <p className="text-sm font-bold text-white">
                {def ? `${def.emoji} ${def.label}` : item.action}
              </p>
              <span className="ml-auto text-amber-400 font-bold text-xs tabular-nums">
                +{item.points}
              </span>
            </div>

            {!unlocked ? (
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                Complete step {idx} first to unlock this action.
              </p>
            ) : (
              <>
                {isWatchLocked(item) ? (
              watchedByIndex[idx] ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Watched
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setWatchModal({
                      idx,
                      url: item.targetUrl,
                      seconds: item.watchSeconds ?? 30,
                      title: def?.label ?? "Watch",
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold"
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  Watch {item.watchSeconds}s to unlock
                </button>
              )
            ) : (
              item.targetUrl && (
                <a
                  href={item.targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                >
                  <ExternalLink className="w-3 h-3" />
                  Open target
                </a>
              )
            )}

            {/* Auto-verify code — the user MUST include this unique code in the
                content they publish; the server fetches the URL to confirm it. */}
            {item.verify === "CODE" && verifyCodes[idx] && (
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/30 p-3 space-y-1.5">
                <p className="text-xs font-bold text-emerald-300 inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  Include this verification code in your{" "}
                  {def?.label?.toLowerCase() ?? "post"}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-gray-900 border border-emerald-500/40 text-emerald-300 font-mono text-sm tracking-widest text-center select-all">
                    {verifyCodes[idx]}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        ?.writeText(verifyCodes[idx])
                        .then(() => {
                          setCopied(`code-${idx}`);
                          setTimeout(() => setCopied(null), 1500);
                        });
                    }}
                    className="px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-semibold shrink-0"
                  >
                    {copied === `code-${idx}` ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="text-[11px] text-emerald-400/70">
                  We fetch your public link and auto-approve when the code is
                  found — no screenshot needed. Private/login-only pages fall back
                  to manual review.
                </p>
              </div>
            )}

            {/* Membership auto-verify — remind the user to link their account. */}
            {(item.verify === "TELEGRAM_MEMBER" ||
              item.verify === "DISCORD_MEMBER") && (
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/30 p-3">
                <p className="text-xs text-emerald-300 inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  Auto-verified —{" "}
                  <Link href="/profile" className="underline font-semibold">
                    link your{" "}
                    {item.verify === "TELEGRAM_MEMBER" ? "Telegram" : "Discord"}
                  </Link>{" "}
                  and join, then submit. We confirm membership automatically.
                </p>
              </div>
            )}

            {/* AI generate — builds a unique variant from the task + your content */}
            {item.aiPromptEnabled && (
              <div className="rounded-lg bg-purple-500/5 border border-purple-500/30 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <p className="text-sm font-bold text-purple-300">
                    Generate your own with AI
                  </p>
                </div>
                <p className="text-xs text-purple-200/80">
                  Creates a unique {def?.label ?? "content"} from this task — each
                  user gets a different one. Review, then post it and submit proof.
                </p>
                <button
                  type="button"
                  onClick={() => generateAi(idx, buildAiPrompt(def ?? null, item, task))}
                  disabled={generatingAi === idx}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold disabled:opacity-50"
                >
                  {generatingAi === idx ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  Generate with AI
                </button>
                {aiOutput && (
                  <div className="rounded bg-gray-950 border border-emerald-500/30 p-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">
                        Generated content
                      </p>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(aiOutput, `ai-${idx}`)}
                        className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300"
                      >
                        {copied === `ai-${idx}` ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        Copy
                      </button>
                    </div>
                    <p className="text-xs text-gray-200 whitespace-pre-wrap">
                      {aiOutput}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Static admin-provided template fields */}
            {!item.aiPromptEnabled &&
              def?.adminFields
                .filter((f) => {
                  if (f.key === "targetUrl" || f.key === "targetHandle")
                    return false;
                  const v = item.fields[f.key];
                  return v && v.trim();
                })
                .map((f) => {
                  const v = item.fields[f.key];
                  return (
                    <div
                      key={f.key}
                      className="rounded-lg bg-gray-950 border border-gray-800 p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                          {f.label}
                        </p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(v, `${idx}-${f.key}`)}
                          className="inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300"
                        >
                          {copied === `${idx}-${f.key}` ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          Copy
                        </button>
                      </div>
                      <p className="text-xs text-gray-200 whitespace-pre-wrap wrap-break-word">
                        {v}
                      </p>
                    </div>
                  );
                })}

            {/* Explicit "I did this" — only when sequential and there's no
                watch/proof to auto-detect completion (else the next action
                could never unlock). */}
            {task.sequential && noReq && (
              markedDone ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Done — next action unlocked
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setDoneByIndex((prev) => ({ ...prev, [idx]: true }))
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold"
                >
                  <Check className="w-3.5 h-3.5" />
                  I did this
                </button>
              )
            )}

            {/* Proof inputs */}
            <div className="space-y-3 pt-1 border-t border-gray-800">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                Submit your proof
              </p>

              {req.url && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Proof URL <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="url"
                    value={proof.url}
                    onChange={(e) => setProof(idx, { url: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    URL of your post / comment / share / profile.
                  </p>
                </div>
              )}

              {req.screenshot && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Screenshot <span className="text-red-400">*</span>
                  </label>
                  <ProofImageUpload
                    value={proof.screenshot}
                    onChange={(url) => setProof(idx, { screenshot: url })}
                  />
                </div>
              )}

              {req.username && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Your {platform.label} username{" "}
                    <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={proof.username}
                    onChange={(e) => setProof(idx, { username: e.target.value })}
                    placeholder="@yourhandle"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
            </div>
              </>
            )}
          </div>
        );
      })}

      {/* Sticky submit bar */}
      {total > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t border-gray-800 bg-gray-950/95 backdrop-blur px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400">
                {readyCount}/{total} ready ·{" "}
                <span className="text-amber-400 font-bold">
                  +{task.pointsReward.toLocaleString()} pts
                </span>
              </p>
            </div>
            <button
              onClick={submit}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Submit
            </button>
          </div>
        </div>
      )}

      {watchModal && (
        <SocialWatchModal
          url={watchModal.url}
          watchSeconds={watchModal.seconds}
          title={watchModal.title}
          taskId={taskId}
          submissionId={submissionId}
          onComplete={() =>
            setWatchedByIndex((prev) => ({ ...prev, [watchModal.idx]: true }))
          }
          onClose={() => setWatchModal(null)}
        />
      )}
    </div>
  );
}
