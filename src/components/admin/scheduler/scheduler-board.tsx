"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  Timer,
} from "lucide-react";
import { toast } from "@/lib/toast";

export interface JobInfo {
  name: string;
  label: string;
  description: string;
  intervalMs: number;
  leaseMs: number;
}

export interface RunRow {
  id: string;
  job: string;
  windowKey: string;
  state: string;
  attempts: number;
  source: string;
  claimedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  summary: string | null;
  error: string | null;
}

function every(ms: number): string {
  if (ms >= 3_600_000) {
    const h = ms / 3_600_000;
    return h === 1 ? "every hour" : `every ${h} hours`;
  }
  const m = Math.round(ms / 60_000);
  return m === 1 ? "every minute" : `every ${m} minutes`;
}

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const STATE_STYLE: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  running: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  failed: "bg-rose-500/10 text-rose-300 border-rose-500/30",
};

export type JobMode = "auto" | "manual";

export function SchedulerBoard({
  jobs,
  initialRuns,
  initialModes,
  initialLatest,
}: {
  jobs: JobInfo[];
  initialRuns: RunRow[];
  initialModes: Record<string, JobMode>;
  initialLatest: Record<string, RunRow>;
}) {
  const [runs, setRuns] = useState<RunRow[]>(initialRuns);
  const [busy, setBusy] = useState<string | null>(null);
  const [modes, setModes] = useState<Record<string, JobMode>>(initialModes);
  const [latestByJob, setLatestByJob] =
    useState<Record<string, RunRow>>(initialLatest);
  const [savingMode, setSavingMode] = useState<string | null>(null);

  // The per-job latest comes from its own query (the recent list is dominated
  // by the every-minute jobs); a newer row in the recent list still wins.
  const latest = useMemo(() => {
    const m = new Map<string, RunRow>(Object.entries(latestByJob));
    for (const r of runs) {
      const cur = m.get(r.job);
      if (!cur || r.claimedAt > cur.claimedAt) m.set(r.job, r);
    }
    return m;
  }, [runs, latestByJob]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/scheduler", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      runs: RunRow[];
      modes?: Record<string, JobMode>;
      latest?: Record<string, RunRow>;
    };
    setRuns(data.runs);
    if (data.modes) setModes(data.modes);
    if (data.latest) setLatestByJob(data.latest);
  }, []);

  const changeMode = useCallback(async (name: string, mode: JobMode) => {
    setSavingMode(name);
    try {
      const res = await fetch("/api/admin/scheduler", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: name, mode }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error || "Could not change that job.");
        return;
      }
      setModes((m) => ({ ...m, [name]: mode }));
      toast.success(
        mode === "manual"
          ? "Manual — it now runs only when you press Run now."
          : "Auto — it runs on its schedule."
      );
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSavingMode(null);
    }
  }, []);

  const runNow = useCallback(
    async (name: string) => {
      setBusy(name);
      try {
        const res = await fetch("/api/admin/scheduler", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job: name }),
        });
        const data = (await res.json()) as {
          error?: string;
          line?: { summary?: string; error?: string; outcome?: string };
        };
        if (!res.ok) {
          toast.error(data.error || "Could not run that job.");
          return;
        }
        if (data.line?.outcome === "failed") {
          toast.error(data.line.error || "That job failed.");
        } else if (data.line?.outcome === "held-by-another-tick") {
          toast.error(data.line.summary || "Already running.");
        } else {
          toast.success(data.line?.summary || "Done.");
        }
        await refresh();
      } catch {
        toast.error("Could not reach the server.");
      } finally {
        setBusy(null);
      }
    },
    [refresh]
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Scheduler</h1>
        <p className="max-w-3xl text-sm text-slate-400">
          Everything that used to need a cron job. There is nothing to set up:
          these run off the site&apos;s own traffic, after a visitor&apos;s page
          has already been sent, so nobody ever waits for them. One due window
          runs exactly once no matter how many visitors arrive at the same
          moment. If the platform is quiet for a day, the next visitor catches
          it up.
        </p>
        <p className="max-w-3xl text-sm text-slate-400">
          Each job is <span className="text-slate-200">Auto</span> (runs on its
          schedule) or <span className="text-slate-200">Manual</span> (runs
          only when you press Run now). Run now always works, whichever you
          choose.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {jobs.map((j) => {
          const last = latest.get(j.name);
          const ok = last?.state === "completed";
          const bad = last?.state === "failed";
          return (
            <section
              key={j.name}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-white">{j.label}</h2>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <Timer className="h-3.5 w-3.5" />
                    {modes[j.name] === "manual"
                      ? "Manual — runs only when you press Run now"
                      : `Due ${every(j.intervalMs)}`}
                  </p>
                  <div
                    role="radiogroup"
                    aria-label={`${j.label} mode`}
                    className="mt-2 inline-flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5 text-xs"
                  >
                    {(["auto", "manual"] as const).map((m) => {
                      const on = (modes[j.name] ?? "auto") === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={savingMode !== null || on}
                          onClick={() => changeMode(j.name, m)}
                          className={`rounded-md px-3 py-1 font-medium transition-colors ${
                            on
                              ? m === "auto"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-amber-500/15 text-amber-300"
                              : "text-slate-400 hover:text-slate-200"
                          } disabled:cursor-default`}
                        >
                          {savingMode === j.name && !on ? (
                            <Loader2 className="inline h-3 w-3 animate-spin" />
                          ) : m === "auto" ? (
                            "Auto"
                          ) : (
                            "Manual"
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => runNow(j.name)}
                  disabled={busy !== null}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                >
                  {busy === j.name ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Run now
                </button>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                {j.description}
              </p>

              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm">
                {last ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : bad ? (
                        <AlertTriangle className="h-4 w-4 text-rose-400" />
                      ) : (
                        <Clock className="h-4 w-4 text-sky-400" />
                      )}
                      <span className="font-medium text-slate-200">
                        {ok ? "Succeeded" : bad ? "Failed" : "Running"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {ago(last.claimedAt)}
                        {last.durationMs != null
                          ? ` · ${last.durationMs}ms`
                          : ""}
                        {last.attempts > 1
                          ? ` · attempt ${last.attempts}`
                          : ""}
                      </span>
                    </div>
                    <p className="mt-2 text-slate-400">
                      {last.error || last.summary || "—"}
                    </p>
                  </>
                ) : (
                  <p className="text-slate-500">
                    Has not run yet on this deployment.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60">
        <h2 className="border-b border-slate-800 px-5 py-3 font-semibold text-white">
          Recent runs
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Job</th>
                <th className="px-5 py-2 font-medium">Window</th>
                <th className="px-5 py-2 font-medium">State</th>
                <th className="px-5 py-2 font-medium">Triggered by</th>
                <th className="px-5 py-2 font-medium">What it did</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-slate-500">
                    Nothing has run yet.
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id} className="border-t border-slate-800/70">
                    <td className="px-5 py-2 text-slate-300">{r.job}</td>
                    <td className="px-5 py-2 font-mono text-xs text-slate-500">
                      {r.windowKey}
                    </td>
                    <td className="px-5 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          STATE_STYLE[r.state] ??
                          "border-slate-700 bg-slate-800 text-slate-300"
                        }`}
                      >
                        {r.state}
                      </span>
                    </td>
                    <td className="px-5 py-2 text-xs text-slate-500">
                      {r.source === "traffic"
                        ? "site traffic"
                        : r.source === "manual"
                          ? "an admin"
                          : r.source}
                      {" · "}
                      {ago(r.claimedAt)}
                    </td>
                    <td className="px-5 py-2 text-slate-400">
                      {r.error || r.summary || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
