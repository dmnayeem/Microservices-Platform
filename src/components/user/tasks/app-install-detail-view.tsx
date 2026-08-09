"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Smartphone,
  Loader2,
  ArrowLeft,
  Coins,
  Sparkles,
  CheckCircle2,
  Clock,
  ExternalLink,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { ProofImageUpload } from "@/components/user/tasks/proof-image-upload";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { SmartImage } from "@/components/user/primitives/smart-image";
import {
  effectiveProofItems,
  type AppInstallConfig,
} from "@/lib/app-install-tasks";
import { runInterstitial } from "@/lib/reward-interstitial";
import {
  TaskUpgradeNotice,
  isUpgradeRequired,
  AdblockNotice,
} from "@/components/user/primitives/task-upgrade-notice";
import { ensureAdsAllowed } from "@/lib/adblock";

interface AppInstallTask {
  id: string;
  title: string;
  description?: string | null;
  pointsReward: number;
  xpReward: number;
  thumbnailUrl?: string | null;
  appInstallConfig?: AppInstallConfig | null;
}

interface UserStatus {
  hasActiveSubmission: boolean;
  activeSubmissionId?: string | null;
  completedToday: boolean;
  /** True when the active submission was already submitted (awaiting review). */
  awaitingReview?: boolean;
}

type SubmitState =
  | { kind: "ready"; submissionId: string }
  | { kind: "awaiting_review" }
  | { kind: "completed_today" }
  | { kind: "blocked"; reason: string }
  | { kind: "loading" };

export function AppInstallDetailView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [task, setTask] = useState<AppInstallTask | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "loading" });
  // Per-requirement proof: { [itemId]: { image?, value? } }.
  const [proof, setProof] = useState<
    Record<string, { image?: string; value?: string }>
  >({});
  const [busy, setBusy] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [adBlocked, setAdBlocked] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      setSubmitState({ kind: "loading" });
      try {
        const tRes = await fetch(`/api/tasks/${taskId}`);
        if (!tRes.ok) throw new Error(await tRes.text());
        const tData = await tRes.json();
        if (cancel) return;
        setTask(tData.task as AppInstallTask);
        const userStatus = (tData.userStatus ?? {}) as UserStatus;

        if (userStatus.awaitingReview) {
          setSubmitState({ kind: "awaiting_review" });
          return;
        }
        if (userStatus.hasActiveSubmission && userStatus.activeSubmissionId) {
          setSubmitState({ kind: "ready", submissionId: userStatus.activeSubmissionId });
          return;
        }
        if (userStatus.completedToday) {
          setSubmitState({ kind: "completed_today" });
          return;
        }
        if (!(await ensureAdsAllowed())) {
          if (!cancel) setAdBlocked(true);
          return;
        }
        const sRes = await fetch(`/api/tasks/${taskId}/start`, { method: "POST" });
        const sData = await sRes.json().catch(() => ({}));
        if (cancel) return;
        if (!sRes.ok) {
          if (isUpgradeRequired(sData)) {
            setUpgradeMsg(sData.error || "");
            return;
          }
          const reason = sData.error ?? `HTTP ${sRes.status}`;
          if (typeof reason === "string" && /limit/i.test(reason)) {
            setSubmitState({ kind: "completed_today" });
            return;
          }
          setSubmitState({ kind: "blocked", reason });
          return;
        }
        if (sData.submission?.id) {
          setSubmitState({ kind: "ready", submissionId: sData.submission.id });
        } else {
          setSubmitState({ kind: "blocked", reason: "Couldn't start this task." });
        }
      } catch (err) {
        if (cancel) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load task");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [taskId]);

  const cfg = task?.appInstallConfig;
  const logo = cfg?.appLogo || task?.thumbnailUrl || null;
  const steps = cfg?.steps ?? [];

  const submit = async () => {
    if (!task || submitState.kind !== "ready") return;
    const items = effectiveProofItems(task.appInstallConfig);
    for (const it of items) {
      const p = proof[it.id] ?? {};
      if (it.screenshot && !p.image) {
        toast.error(`Upload a screenshot for: ${it.label}`);
        return;
      }
      if (it.valueLabel && !p.value?.trim()) {
        toast.error(`Enter ${it.valueLabel}`);
        return;
      }
    }
    const proofImages = items
      .filter((it) => it.screenshot)
      .map((it) => proof[it.id]?.image)
      .filter((u): u is string => !!u);
    const appInstallProof = items.map((it) => ({
      id: it.id,
      kind: it.kind,
      label: it.label,
      target: it.target,
      value: proof[it.id]?.value?.trim() || undefined,
    }));
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: submitState.submissionId,
          proofImages,
          appInstallProof,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      await runInterstitial();
      if (d.status === "approved") {
        toast.success("Download counted! 🎉", {
          description: `+${d.rewards?.points ?? task.pointsReward} pts credited`,
        });
      } else {
        toast.success("Proof submitted", {
          description: `You'll get ${task.pointsReward} pts once approved.`,
        });
      }
      router.push("/tasks");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Try again";
      if (/already submitted/i.test(msg)) {
        setSubmitState({ kind: "awaiting_review" });
        toast("Already submitted — awaiting review.");
      } else {
        toast.error("Failed", { description: msg });
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-green-400" />
        <p className="text-sm text-gray-500">Loading task…</p>
      </div>
    );
  }

  if (adBlocked) {
    return <AdblockNotice />;
  }

  if (upgradeMsg !== null) {
    return <TaskUpgradeNotice message={upgradeMsg} />;
  }

  if (loadError || !task) {
    return (
      <div className="space-y-4">
        <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back to tasks
        </Link>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm font-bold text-red-400 mb-1">Couldn&apos;t load this task</p>
          <p className="text-xs text-red-300/80">{loadError ?? "Task not found."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back to tasks
      </Link>

      {/* App card */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-800 overflow-hidden shrink-0 grid place-items-center">
            {logo ? (
              <SmartImage
                src={logo}
                alt=""
                width={64}
                height={64}
                className="w-full h-full object-cover"
              />
            ) : (
              <Smartphone className="w-7 h-7 text-gray-600" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] uppercase tracking-wider text-green-400 font-bold">
              App Install
            </span>
            <h1 className="text-lg sm:text-xl font-bold text-white leading-tight">
              {cfg?.appName || task.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 text-xs font-bold border border-amber-500/30">
                <Coins className="w-3.5 h-3.5" />+{task.pointsReward.toLocaleString()} pts
              </span>
              {task.xpReward > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 text-xs font-bold border border-violet-500/30">
                  <Sparkles className="w-3.5 h-3.5" />+{task.xpReward} XP
                </span>
              )}
            </div>
          </div>
        </div>

        {(cfg?.description || task.description) && (
          <p className="text-sm text-gray-300 whitespace-pre-wrap">
            {cfg?.description || task.description}
          </p>
        )}

        {/* Install buttons */}
        <div className="flex flex-wrap gap-2">
          {cfg?.playStoreUrl && (
            <a
              href={cfg.playStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold"
            >
              <Download className="w-4 h-4" /> Install on Google Play
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          )}
          {cfg?.appStoreUrl && (
            <a
              href={cfg.appStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold"
            >
              <Download className="w-4 h-4" /> Install on App Store
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          )}
        </div>
      </div>

      <AdRenderer placement="TASK_START" />

      {/* Steps */}
      {steps.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2.5">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            How to complete
          </p>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-200">
                <span className="w-5 h-5 rounded-full bg-green-500/15 text-green-400 text-[11px] font-bold grid place-items-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}

      {submitState.kind === "awaiting_review" && (
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 flex items-start gap-3">
          <Clock className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-bold text-white">Awaiting review</h2>
            <p className="text-xs text-sky-200/80 mt-1">
              You&apos;ve already submitted this — it&apos;s awaiting admin review.
              {task && task.pointsReward > 0
                ? ` You'll get ${task.pointsReward.toLocaleString()} pts once approved.`
                : ""}
            </p>
          </div>
        </section>
      )}

      {submitState.kind === "completed_today" && (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-bold text-white">Already submitted</h2>
            <p className="text-xs text-emerald-200/80 mt-1">
              Your proof is pending review or already credited.
            </p>
          </div>
        </section>
      )}

      {submitState.kind === "blocked" && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
          {submitState.reason}
        </section>
      )}

      {submitState.kind === "ready" &&
        (() => {
          const items = effectiveProofItems(cfg);
          const canSubmit = items.every(
            (it) =>
              (!it.screenshot || proof[it.id]?.image) &&
              (!it.valueLabel || proof[it.id]?.value?.trim())
          );
          return (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5 space-y-4">
              <div>
                <p className="text-sm font-bold text-white">Submit your proof</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Complete each requirement below, then submit.
                </p>
              </div>

              {items.map((it, i) => (
                <div
                  key={it.id}
                  className="rounded-lg border border-gray-800 bg-gray-950/40 p-3 space-y-2"
                >
                  <p className="text-sm font-semibold text-white">
                    <span className="text-emerald-400">{i + 1}.</span> {it.label}
                  </p>
                  {it.valueLabel && (
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">
                        {it.valueLabel}
                      </label>
                      <input
                        value={proof[it.id]?.value ?? ""}
                        onChange={(e) =>
                          setProof((p) => ({
                            ...p,
                            [it.id]: { ...p[it.id], value: e.target.value },
                          }))
                        }
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                        placeholder={
                          it.kind === "LEVEL"
                            ? `e.g. ${it.target ?? 10}`
                            : "Your answer"
                        }
                      />
                    </div>
                  )}
                  {it.screenshot && (
                    <ProofImageUpload
                      value={proof[it.id]?.image ?? ""}
                      onChange={(url) =>
                        setProof((p) => ({
                          ...p,
                          [it.id]: { ...p[it.id], image: url },
                        }))
                      }
                    />
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={submit}
                disabled={busy || !canSubmit}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white text-sm font-bold shadow-lg shadow-emerald-900/30 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Submit proof"
                )}
              </button>
            </div>
          );
        })()}
    </div>
  );
}
