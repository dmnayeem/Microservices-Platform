"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Coins,
  Sparkles,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

type State =
  | { phase: "loading" }
  | {
      phase: "success";
      points: number;
      xp: number;
      newBalance?: number;
      keyValue: string;
    }
  | { phase: "error"; message: string; keyValue: string };

export default function ArticleTaskCompleteClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [copied, setCopied] = useState(false);

  const taskId = params.get("task");
  const key = params.get("key");
  const token = params.get("eg");

  useEffect(() => {
    let active = true;
    (async () => {
      if (!taskId || !key || !token) {
        setState({
          phase: "error",
          message:
            "Missing parameters in the URL — please start the task again from your dashboard.",
          keyValue: key ?? "",
        });
        return;
      }
      try {
        // Decode the token to find the submissionId without contacting our API.
        // The token is { s, t, u, iat, exp } base64url-JSON, signature appended.
        const submissionId = decodeSubmissionId(token);
        if (!submissionId) {
          throw new Error("Invalid session token");
        }

        const res = await fetch(`/api/tasks/${taskId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submissionId,
            uniqueKey: key,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setState({
            phase: "error",
            message: data.error ?? `HTTP ${res.status}`,
            keyValue: key,
          });
          return;
        }
        setState({
          phase: "success",
          points: data.rewards?.points ?? 0,
          xp: data.rewards?.xp ?? 0,
          newBalance: data.newBalance,
          keyValue: key,
        });
      } catch (err) {
        if (!active) return;
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Submit failed",
          keyValue: key ?? "",
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [taskId, key, token]);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(state.phase === "loading" ? "" : state.keyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-(--app-line) bg-(--app-surface) p-6 shadow-xl">
        {state.phase === "loading" && (
          <div className="flex flex-col items-center text-center py-6 gap-3">
            <Loader2 className="w-8 h-8 text-(--app-accent-ink) animate-spin" />
            <p className="text-sm text-(--app-ink-2)">
              Verifying your unique key…
            </p>
          </div>
        )}

        {state.phase === "success" && (
          <div className="space-y-5">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <h1 className="text-xl font-bold text-white">
                Task completed!
              </h1>
              <p className="text-sm text-(--app-ink-3)">
                Your unique key was verified and your reward has been
                credited automatically.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <RewardCard
                icon={<Coins className="w-5 h-5 text-amber-400" />}
                label="Points"
                value={`+${state.points.toLocaleString()}`}
                tone="bg-amber-500/10 border-amber-500/30 text-amber-200"
              />
              <RewardCard
                icon={<Sparkles className="w-5 h-5 text-(--app-accent-ink)" />}
                label="XP"
                value={`+${state.xp.toLocaleString()}`}
                tone="bg-(--app-cta)/10 border-(--app-accent-edge)/30 text-(--app-accent-ink)"
              />
            </div>

            <div className="rounded-lg bg-(--app-page) border border-(--app-line) p-3">
              <p className="text-[10px] uppercase tracking-wider text-(--app-ink-3) font-bold mb-1">
                Your Unique Key
              </p>
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-mono text-(--app-ink-2) break-all">
                  {state.keyValue}
                </code>
                <button
                  onClick={copyKey}
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-(--app-surface-2) hover:bg-(--app-surface-2) text-(--app-ink-2) rounded-md"
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <AdRenderer placement="TASK_COMPLETE" />

            <div className="flex gap-2">
              <Link
                href="/article-tasks"
                className="flex-1 py-2.5 text-center text-sm font-semibold rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-2) text-(--app-ink)"
              >
                More tasks
              </Link>
              <Link
                href="/dashboard"
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold rounded-lg bg-linear-to-r from-emerald-500 to-indigo-500 hover:from-emerald-600 hover:to-indigo-600 text-white"
              >
                Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {state.phase === "error" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
              <h1 className="text-xl font-bold text-white">
                We couldn&apos;t verify your key
              </h1>
              <p className="text-sm text-red-300">{state.message}</p>
            </div>

            {state.keyValue && (
              <div className="rounded-lg bg-(--app-page) border border-(--app-line) p-3">
                <p className="text-[10px] uppercase tracking-wider text-(--app-ink-3) font-bold mb-1">
                  Your Generated Key
                </p>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs font-mono text-(--app-ink-2) break-all">
                    {state.keyValue}
                  </code>
                  <button
                    onClick={copyKey}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-(--app-surface-2) hover:bg-(--app-surface-2) text-(--app-ink-2) rounded-md"
                  >
                    {copied ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-[11px] text-(--app-ink-3) mt-2">
                  Save this key — you can paste it manually on the task
                  page if needed.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => router.refresh()}
                className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-2) text-(--app-ink)"
              >
                Retry
              </button>
              <Link
                href="/article-tasks"
                className="flex-1 inline-flex items-center justify-center py-2.5 text-sm font-semibold rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta)"
              >
                Back to tasks
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RewardCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={`rounded-lg border p-3 flex items-center gap-2 ${tone}`}>
      {icon}
      <div>
        <p className="text-[10px] uppercase tracking-wider opacity-80">
          {label}
        </p>
        <p className="text-base font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

/** Decode a base64url-JSON token body to extract the submissionId. */
function decodeSubmissionId(token: string): string | null {
  try {
    const body = token.split(".")[0];
    const pad = body.length % 4 === 0 ? "" : "=".repeat(4 - (body.length % 4));
    const b64 = body.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const json = atob(b64);
    const parsed = JSON.parse(json) as { s?: string };
    return parsed.s ?? null;
  } catch {
    return null;
  }
}
