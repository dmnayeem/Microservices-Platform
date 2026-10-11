"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2, Mail, Play } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  FINANCE_ALERT_DEFAULTS,
  FINANCE_ALERT_DEFS,
  type FinanceAlertRule,
  type FinanceAlertSettings,
  type FinanceAlertType,
} from "@/lib/company-finance/alerts-shared";
import { api, btnGhost, btnPrimary, cardCls, inputCls, Loading } from "./ui";

/**
 * What the finance team is told about, and how. Every alert has its own
 * switch, plus in-app / email, and the "days before" for bills coming up.
 * The reminders go to everyone on the Finance team tab.
 */
export function AlertsTab() {
  const [settings, setSettings] = useState<FinanceAlertSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ settings: FinanceAlertSettings }>("/api/admin/company-finance/alerts")
      .then((d) => live && setSettings(d.settings))
      .catch((e) => {
        if (!live) return;
        toast.error(e instanceof Error ? e.message : "Couldn't load alerts");
        setSettings(FINANCE_ALERT_DEFAULTS);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!settings) return <Loading />;

  const set = (type: FinanceAlertType, patch: Partial<FinanceAlertRule>) =>
    setSettings((s) => (s ? { ...s, [type]: { ...s[type], ...patch } } : s));

  const save = async () => {
    setSaving(true);
    try {
      const d = await api<{ settings: FinanceAlertSettings }>("/api/admin/company-finance/alerts", {
        method: "POST",
        body: JSON.stringify({ settings }),
      });
      setSettings(d.settings);
      toast.success("Alerts saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const d = await api<{ summary: string }>("/api/admin/company-finance/alerts", {
        method: "POST",
        body: JSON.stringify({ action: "run" }),
      });
      toast.success("Checked bills", { description: d.summary });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't run");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4`}>
        <h3 className="flex items-center gap-2 font-semibold text-white">
          <Bell className="h-4 w-4 text-slate-400" /> Finance alerts
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          Who hears: everyone on the Finance team tab. Each alert can be switched off, or sent only in-app or only by
          email. Bill reminders are checked every few hours and each one goes out once.
        </p>
      </div>

      <div className="space-y-3">
        {FINANCE_ALERT_DEFS.map((def) => {
          const r = settings[def.type];
          return (
            <div key={def.type} className={`${cardCls} p-4 ${r.enabled ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{def.label}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{def.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.enabled}
                  aria-label={`${def.label} ${r.enabled ? "on" : "off"}`}
                  onClick={() => set(def.type, { enabled: !r.enabled })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${r.enabled ? "bg-emerald-500" : "bg-slate-700"}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${r.enabled ? "left-5.5" : "left-0.5"}`}
                  />
                </button>
              </div>
              {r.enabled && (
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-300">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={r.inApp} onChange={(e) => set(def.type, { inApp: e.target.checked })} />
                    <Bell className="h-3.5 w-3.5 text-slate-400" /> Notification
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={r.email} onChange={(e) => set(def.type, { email: e.target.checked })} />
                    <Mail className="h-3.5 w-3.5 text-slate-400" /> Email
                  </label>
                  {def.hasDays && (
                    <label className="inline-flex items-center gap-2">
                      Remind
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={r.daysBefore ?? 7}
                        onChange={(e) =>
                          set(def.type, { daysBefore: Math.min(60, Math.max(1, parseInt(e.target.value) || 1)) })
                        }
                        className={`${inputCls} !w-16 text-center`}
                      />
                      days before
                    </label>
                  )}
                  {!r.inApp && !r.email && <span className="text-xs text-amber-300">Neither is ticked — nothing will be sent.</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save alerts
        </button>
        <button type="button" className={btnGhost} onClick={runNow} disabled={running} title="Sends only what is due and not sent already">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Check bills now
        </button>
      </div>
    </div>
  );
}
