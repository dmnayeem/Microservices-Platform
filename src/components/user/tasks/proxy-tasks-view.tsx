"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TaskInstructions } from "@/components/user/tasks/task-instructions";
import { confirmDialog } from "@/lib/confirm";
import {
  Globe,
  ShieldCheck,
  Copy,
  Check,
  Loader2,
  Upload,
  KeyRound,
  Server,
  Clock,
  Video as VideoIcon,
} from "lucide-react";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { BottomSheet } from "@/components/user/primitives/bottom-sheet";
import { InlineVideoEmbed } from "@/components/user/primitives/inline-video-embed";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { runInterstitial } from "@/lib/reward-interstitial";
import { ensureAdsAllowed } from "@/lib/adblock";
import { ProofImageUpload } from "@/components/user/tasks/proof-image-upload";
import {
  isUpgradeRequired,
  isTaskLocked,
} from "@/components/user/primitives/task-upgrade-notice";

interface ProxyTask {
  id: string;
  title: string;
  description?: string;
  pointsReward: number;
  duration: number;
  country: string;
  serverHost?: string;
  serverPort?: number;
  instructions?: string | null;
  instructionVideoUrl?: string | null;
  locked?: boolean;
}

interface SessionCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  protocol: string;
}

const CREDENTIAL_TTL_SEC = 180;

function genCredentials(task: ProxyTask): SessionCredentials {
  const rand = Math.random().toString(36).slice(2, 10);
  const cc = (task.country || "ww").toLowerCase().replace(/[^a-z]/g, "").slice(0, 2) || "ww";
  return {
    host: task.serverHost || `proxy-${cc}.earngpt.io`,
    port: task.serverPort || 8080,
    username: `eg_${rand}`,
    password: Math.random().toString(36).slice(2, 14),
    protocol: "HTTPS",
  };
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-(--app-ink-3) font-bold mb-1">
        {label}
      </p>
      <button
        onClick={copy}
        className="w-full px-3 py-2 rounded-lg bg-(--app-page) border border-(--app-line) hover:border-(--app-accent-edge)/40 transition-colors flex items-center gap-2 text-left"
      >
        <span className="flex-1 min-w-0 text-sm text-white font-mono truncate">{value}</span>
        {copied ? (
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <Copy className="w-4 h-4 text-(--app-ink-3) shrink-0" />
        )}
      </button>
    </div>
  );
}

export function ProxyTasksView() {
  const [tasks, setTasks] = useState<ProxyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ProxyTask | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [creds, setCreds] = useState<SessionCredentials | null>(null);
  const [credExpiry, setCredExpiry] = useState(0);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [proofUrl, setProofUrl] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/tasks/proxy", { cache: "no-store" });
      const d = r.ok ? await r.json() : { tasks: [] };
      setTasks(d.tasks ?? []);
    } catch {
      setTasks([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(() => load(true));

  // Single 1-second tick drives both timers.
  useEffect(() => {
    if (!active) return;
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [active]);

  // Credential auto-revoke when 3-min expiry hits 0
  useEffect(() => {
    if (!creds || !credExpiry) return;
    if (now >= credExpiry) {
      setCreds(null);
      setConnectedAt(null);
      toast.warning("Proxy credentials expired", {
        description: "Reconnect to continue the session.",
      });
    }
  }, [now, creds, credExpiry]);

  const elapsedSec = connectedAt ? Math.floor((now - connectedAt) / 1000) : 0;
  const targetSec = active ? active.duration * 60 : 0;
  const minRequiredSec = Math.floor(targetSec * 0.8);
  const sessionRemainSec = Math.max(0, targetSec - elapsedSec);
  const credRemainSec = Math.max(0, Math.floor((credExpiry - now) / 1000));
  const minTimeMet = elapsedSec >= minRequiredSec;
  const sessionPct = targetSec > 0 ? Math.min(100, (elapsedSec / targetSec) * 100) : 0;
  const minPct = targetSec > 0 ? Math.min(100, (minRequiredSec / targetSec) * 100) : 0;

  const fmt = useMemo(
    () => (s: number) => {
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      return `${mm}:${ss}`;
    },
    []
  );

  const reset = () => {
    setActive(null);
    setSubmissionId(null);
    setCreds(null);
    setCredExpiry(0);
    setConnectedAt(null);
    setProofUrl("");
    setScreenshotUrl("");
  };

  const startTask = async (t: ProxyTask) => {
    // Ad-blocker gate: refuse to start while a blocker is active.
    if (!(await ensureAdsAllowed())) return;
    setStarting(true);
    try {
      const res = await fetch(`/api/tasks/${t.id}/start`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // Daily-mission allowance exhausted → point the user to upgrade.
        if (isUpgradeRequired(err)) {
          toast.error(err.error || "Daily limit reached", {
            description: "Upgrade your plan to do more tasks.",
            action: {
              label: "Upgrade",
              onClick: () => {
                window.location.href = "/packages";
              },
            },
          });
          return;
        }
        // Blocked behind an earlier task in the chain (feature #7).
        if (isTaskLocked(err)) {
          toast.error(err.error || "Task locked", {
            description: "Complete the previous task first to unlock this one.",
          });
          return;
        }
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const d = await res.json();
      setSubmissionId(d.submission?.id ?? null);
      setActive(t);
      setProofUrl("");
      setScreenshotUrl("");
      setCreds(null);
      setCredExpiry(0);
      setConnectedAt(null);
    } catch (err) {
      toast.error("Couldn't start task", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setStarting(false);
    }
  };

  const connect = () => {
    if (!active) return;
    const c = genCredentials(active);
    const expiry = Date.now() + CREDENTIAL_TTL_SEC * 1000;
    setCreds(c);
    setCredExpiry(expiry);
    setConnectedAt((prev) => prev ?? Date.now());
    setNow(Date.now());
    toast.success("Proxy session ready", {
      description: `Credentials expire in ${CREDENTIAL_TTL_SEC / 60} minutes.`,
    });
  };

  const submit = async () => {
    if (!active || !submissionId) return;
    if (!minTimeMet) {
      toast.error("Stay connected longer", {
        description: `${minRequiredSec - elapsedSec}s remaining before you can submit.`,
      });
      return;
    }
    if (!proofUrl.trim()) {
      toast.error("Proof URL is required", {
        description: "Paste the IP-check or session log URL.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const proofImages = screenshotUrl.trim() ? [screenshotUrl.trim()] : [];
      const res = await fetch(`/api/tasks/${active.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({
          submissionId,
          proof: proofUrl.trim(),
          proofImages,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      await runInterstitial();
      toast.success(`Task complete! +${active.pointsReward} pts`);
      reset();
    } catch (err) {
      toast.error("Submission failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Globe className="w-6 h-6 text-violet-400" />
          Proxy Tasks
        </h1>
        <p className="text-(--app-ink-3) text-sm mt-1">
          Stay connected to a geo-targeted proxy session to earn — rewards credit
          once you complete the target duration.
        </p>
      </div>

      <div className="rounded-xl bg-(--app-cta)/5 border border-(--app-accent-edge)/20 p-3 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-(--app-accent-ink) mt-0.5 shrink-0" />
        <p className="text-xs text-(--app-accent-ink)">
          Connect to a proxy server for the listed duration to earn rewards.
          Credentials expire after 3 minutes — reconnect to refresh. Submit only
          becomes available once you&apos;ve stayed connected for at least 80% of
          the target duration.
        </p>
      </div>

      <AdRenderer placement="TASK_LIST" />

      {loading && <ListSkeleton rows={3} />}

      {!loading && tasks.length === 0 && (
        <EmptyState
          icon={Globe}
          title="No proxy tasks available"
          description="Check back soon."
        />
      )}

      {!loading && tasks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasks.map((t) => (
            <div key={t.id} className="card p-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {t.title}
                  </p>
                  <p className="text-[11px] text-(--app-ink-3)">
                    {t.country} · {t.duration} min session
                  </p>
                </div>
                <span className="text-amber-400 font-bold text-sm tabular-nums shrink-0">
                  +{t.pointsReward}
                </span>
              </div>
              <button
                onClick={() => !t.locked && startTask(t)}
                disabled={starting || t.locked}
                className="mt-3 w-full py-2 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
              >
                {t.locked ? (
                  <>🔒 Locked</>
                ) : starting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>Connect →</>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <BottomSheet
        open={!!active}
        onOpenChange={(o) => {
          if (!o && !connectedAt) reset();
        }}
        title={active?.title ?? "Proxy Session"}
        description={active ? `${active.country} · ${active.duration} min target` : undefined}
        footer={
          active ? (
            <div className="flex gap-2">
              <button
                disabled={submitting}
                onClick={async () => {
                  if (
                    !connectedAt ||
                    (await confirmDialog({
                      title: "Disconnect now?",
                      description: "Reward will be forfeited.",
                      tone: "danger",
                      confirmLabel: "Disconnect",
                    }))
                  ) {
                    reset();
                  }
                }}
                className="flex-1 py-2.5 rounded-lg bg-(--app-surface-2) text-(--app-ink) text-sm font-semibold disabled:opacity-50"
              >
                {connectedAt ? "Disconnect" : "Cancel"}
              </button>
              <button
                disabled={submitting || !minTimeMet || !connectedAt}
                onClick={submit}
                className="flex-1 py-2.5 rounded-lg bg-(--app-cta) text-(--app-on-cta) text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Submit Proof
              </button>
            </div>
          ) : null
        }
      >
        {active && (
          <div className="space-y-4">
            {/* One renderer for every surface — see components/user/tasks/task-instructions. */}
            <TaskInstructions
              value={active.instructions}
              className="rounded-lg bg-(--app-page) border border-(--app-line) p-3"
            />

            {active.instructionVideoUrl && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-(--app-ink-3) font-bold inline-flex items-center gap-1.5">
                  <VideoIcon className="w-3 h-3" />
                  Instruction video
                </p>
                <div className="max-w-2xl mx-auto">
                  <InlineVideoEmbed
                    url={active.instructionVideoUrl}
                    title={`Instruction video — ${active.title}`}
                  />
                </div>
              </div>
            )}

            {/* Session timer */}
            <div className="rounded-2xl bg-(--app-surface-2) p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-wider font-bold text-(--app-ink-3) inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Session Time
                </p>
                <p className="text-[10px] text-(--app-ink-3) tabular-nums">
                  {fmt(elapsedSec)} / {fmt(targetSec)}
                </p>
              </div>
              <div className="relative h-2 rounded-full bg-(--app-surface) overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full bg-linear-to-r from-(--app-grad-a) to-emerald-500 transition-[width]"
                  style={{ width: `${sessionPct}%` }}
                />
                {/* 80% threshold marker */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-amber-400/80"
                  style={{ left: `${minPct}%` }}
                  title="80% minimum"
                />
              </div>
              <p
                className={cn(
                  "text-[11px] mt-1.5 font-medium",
                  minTimeMet ? "text-emerald-400" : "text-amber-400"
                )}
              >
                {minTimeMet
                  ? `✓ Minimum time met — you can submit when ready`
                  : `Stay connected for ${fmt(Math.max(0, minRequiredSec - elapsedSec))} more to unlock submit`}
              </p>
            </div>

            {/* Credentials block */}
            {!creds && (
              <button
                onClick={connect}
                className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold inline-flex items-center justify-center gap-2"
              >
                <Server className="w-4 h-4" />
                {connectedAt ? "Refresh Credentials" : "Generate Credentials"}
              </button>
            )}

            {creds && (
              <div className="space-y-3 rounded-xl bg-(--app-page) border border-(--app-line) p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-(--app-ink-3) inline-flex items-center gap-1">
                    <KeyRound className="w-3 h-3" />
                    Proxy Credentials
                  </p>
                  <p
                    className={cn(
                      "text-[11px] font-mono tabular-nums",
                      credRemainSec < 30 ? "text-red-400" : "text-amber-400"
                    )}
                  >
                    Expires in {fmt(credRemainSec)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CopyField label="Host" value={creds.host} />
                  <CopyField label="Port" value={String(creds.port)} />
                  <CopyField label="Username" value={creds.username} />
                  <CopyField label="Password" value={creds.password} />
                </div>
                <p className="text-[10px] text-(--app-ink-3)">
                  Protocol: <span className="font-mono text-(--app-ink-2)">{creds.protocol}</span> · Region: <span className="font-mono text-(--app-ink-2)">{active.country}</span>
                </p>
              </div>
            )}

            {/* Connection status */}
            {connectedAt && (
              <div className="flex items-center justify-center gap-2 text-emerald-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Connection active · {fmt(sessionRemainSec)} until target
              </div>
            )}

            {/* Proof submission */}
            <div className="space-y-3 pt-3 border-t border-(--app-line)">
              <p className="text-[10px] uppercase tracking-wider text-(--app-ink-3) font-bold">
                Submit your proof
              </p>
              <div>
                <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
                  Proof URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={proofUrl}
                  onChange={(e) => setProofUrl(e.target.value)}
                  placeholder="https://ipinfo.io/json or session log URL"
                  className="w-full px-3 py-2 bg-(--app-surface-2) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-(--app-ink-3) mb-1.5">
                  Screenshot <span className="text-(--app-ink-3)">(optional)</span>
                </label>
                <ProofImageUpload
                  value={screenshotUrl}
                  onChange={setScreenshotUrl}
                />
              </div>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
