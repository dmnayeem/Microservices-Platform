"use client";

import { useState } from "react";
import { Loader2, Save, Settings } from "lucide-react";
import { toast } from "@/lib/toast";
import type { AffiliateConfig } from "@/lib/affiliate";

/** Admin editor for the affiliate program config (was raw SystemSetting only). */
export function AffiliateConfigForm({ initial }: { initial: AffiliateConfig }) {
  const [cfg, setCfg] = useState<AffiliateConfig>(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "affiliate",
          settings: {
            affiliate_config: {
              enabled: cfg.enabled,
              cookieWindowDays: Math.min(
                365,
                Math.max(1, Math.round(cfg.cookieWindowDays) || 30)
              ),
              requireApproval: cfg.requireApproval,
            },
          },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Affiliate settings saved");
    } catch {
      toast.error("Couldn't save affiliate settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
      <p className="text-sm font-bold text-white inline-flex items-center gap-1.5">
        <Settings className="w-4 h-4 text-slate-400" /> Program settings
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
            className="w-4 h-4 accent-indigo-500"
          />
          Program enabled
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={cfg.requireApproval}
            onChange={(e) =>
              setCfg({ ...cfg, requireApproval: e.target.checked })
            }
            className="w-4 h-4 accent-indigo-500"
          />
          Require approval to join
        </label>
        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Cookie window (days)
          </label>
          <input
            type="number"
            min={1}
            max={365}
            value={cfg.cookieWindowDays}
            onChange={(e) =>
              setCfg({ ...cfg, cookieWindowDays: Number(e.target.value) })
            }
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
          />
        </div>
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        Save settings
      </button>
    </div>
  );
}
