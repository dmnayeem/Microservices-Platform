"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Settings as SettingsIcon,
  RefreshCw,
  Loader2,
  Save,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { formatDistanceToNow } from "date-fns";
import { AdminTableShell } from "@/components/admin/ui/admin-table-shell";

interface SessionRow {
  id: string;
  userId: string;
  userName: string;
  taskId: string;
  taskTitle: string;
  duration: number | null;
  country: string | null;
  pointsReward: number;
  startedAt: string;
  elapsedSec: number;
}

interface AlertRow {
  id: string;
  userId: string;
  userName: string;
  taskTitle: string;
  reason: string;
  createdAt: string;
}

interface RepeatOffender {
  userId: string;
  name: string;
  count: number;
  lastReason: string | null;
}

interface ProxyConfig {
  defaultDurationMin?: number;
  minRewardPts?: number;
  maxRewardPts?: number;
  credentialTtlSec?: number;
  minTimePercent?: number;
}

const DEFAULT_CONFIG: Required<ProxyConfig> = {
  defaultDurationMin: 5,
  minRewardPts: 50,
  maxRewardPts: 500,
  credentialTtlSec: 180,
  minTimePercent: 80,
};

interface Props {
  canManage: boolean;
}

export function ProxyMonitor({ canManage }: Props) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [offenders, setOffenders] = useState<RepeatOffender[]>([]);
  const [config, setConfig] = useState<Required<ProxyConfig>>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, fRes, cRes] = await Promise.all([
        fetch("/api/admin/proxy/sessions"),
        fetch("/api/admin/proxy/fraud"),
        fetch("/api/admin/proxy/config"),
      ]);
      if (sRes.ok) {
        const d = await sRes.json();
        setSessions(d.sessions ?? []);
      }
      if (fRes.ok) {
        const d = await fRes.json();
        setAlerts(d.alerts ?? []);
        setOffenders(d.repeatOffenders ?? []);
      }
      if (cRes.ok) {
        const d = await cRes.json();
        setConfig({ ...DEFAULT_CONFIG, ...(d.config ?? {}) });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/proxy/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Proxy config saved");
      router.refresh();
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Sessions */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white inline-flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Active Sessions ({sessions.length})
          </h2>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        {loading ? (
          <div className="text-center py-6 text-slate-500 text-sm">Loading…</div>
        ) : sessions.length === 0 ? (
          <p className="text-center py-6 text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg">
            No active proxy sessions in the last hour.
          </p>
        ) : (
          <AdminTableShell>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="text-left py-2 pr-3">User</th>
                  <th className="text-left py-2 pr-3">Task</th>
                  <th className="text-left py-2 pr-3">Country</th>
                  <th className="text-right py-2 pr-3">Elapsed</th>
                  <th className="text-right py-2">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40">
                    <td className="py-2 pr-3 text-white">{s.userName}</td>
                    <td className="py-2 pr-3 text-slate-300 truncate max-w-xs">
                      {s.taskTitle}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-400">
                      {s.country ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-300">
                      {Math.floor(s.elapsedSec / 60)}m {s.elapsedSec % 60}s
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-500">
                      {s.duration ? `${s.duration}m` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableShell>
        )}
      </div>

      {/* Fraud alerts */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h2 className="text-base font-semibold text-white inline-flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Fraud Alerts (last 7 days)
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Rejected proxy task submissions. Review repeat offenders below.
        </p>

        {offenders.length > 0 && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <p className="text-xs uppercase tracking-wider font-bold text-red-400 mb-2">
              ⚠ Repeat Offenders ({offenders.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {offenders.map((o) => (
                <div
                  key={o.userId}
                  className="flex items-center justify-between text-sm bg-slate-950 rounded p-2"
                >
                  <span className="text-white truncate">{o.name}</span>
                  <span className="text-red-400 font-bold tabular-nums shrink-0 ml-2">
                    {o.count} rejection{o.count > 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-6 text-slate-500 text-sm">Loading…</div>
        ) : alerts.length === 0 ? (
          <p className="text-center py-6 text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg">
            No fraud alerts. All proxy submissions in the last week were clean.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {alerts.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800"
              >
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {a.userName} — {a.taskTitle}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {a.reason} ·{" "}
                    {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Global config */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h2 className="text-base font-semibold text-white inline-flex items-center gap-2 mb-1">
          <SettingsIcon className="w-4 h-4 text-cyan-400" />
          Global Proxy-Task Config
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Default values applied when creating new proxy tasks and validating
          submissions.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Default duration (minutes)">
            <input
              type="number"
              min={1}
              max={60}
              value={config.defaultDurationMin}
              onChange={(e) =>
                setConfig({
                  ...config,
                  defaultDurationMin: parseInt(e.target.value) || 1,
                })
              }
              disabled={!canManage}
              className={inp}
            />
          </Field>
          <Field label="Credential expiry (seconds)">
            <input
              type="number"
              min={60}
              max={900}
              value={config.credentialTtlSec}
              onChange={(e) =>
                setConfig({
                  ...config,
                  credentialTtlSec: parseInt(e.target.value) || 60,
                })
              }
              disabled={!canManage}
              className={inp}
            />
          </Field>
          <Field label="Min reward (pts)">
            <input
              type="number"
              min={0}
              value={config.minRewardPts}
              onChange={(e) =>
                setConfig({
                  ...config,
                  minRewardPts: parseInt(e.target.value) || 0,
                })
              }
              disabled={!canManage}
              className={inp}
            />
          </Field>
          <Field label="Max reward (pts)">
            <input
              type="number"
              min={0}
              value={config.maxRewardPts}
              onChange={(e) =>
                setConfig({
                  ...config,
                  maxRewardPts: parseInt(e.target.value) || 0,
                })
              }
              disabled={!canManage}
              className={inp}
            />
          </Field>
          <Field label="Min connect time (% of duration)">
            <input
              type="number"
              min={50}
              max={100}
              value={config.minTimePercent}
              onChange={(e) =>
                setConfig({
                  ...config,
                  minTimePercent: parseInt(e.target.value) || 80,
                })
              }
              disabled={!canManage}
              className={inp}
            />
          </Field>
        </div>

        {canManage && (
          <div className="flex justify-end mt-4 pt-4 border-t border-slate-800">
            <button
              onClick={saveConfig}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Config
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-60";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
