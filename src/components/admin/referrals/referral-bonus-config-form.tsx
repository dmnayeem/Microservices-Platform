"use client";

import { useState } from "react";
import { Loader2, Save, Gift } from "lucide-react";
import { toast } from "@/lib/toast";
import type { ReferralBonusConfig } from "@/lib/referral-bonus";

/** Admin editor for the referral-signup bonus amounts + anti-farm rules (#9). */
export function ReferralBonusConfigForm({
  initial,
}: {
  initial: ReferralBonusConfig;
}) {
  const [cfg, setCfg] = useState<ReferralBonusConfig>(initial);
  const [saving, setSaving] = useState(false);

  const num = (v: number) => (Number.isFinite(v) && v >= 0 ? v : 0);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "referral",
          settings: { referral_bonus_config: cfg },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Referral bonus settings saved");
    } catch {
      toast.error("Couldn't save referral bonus settings");
    } finally {
      setSaving(false);
    }
  };

  const NumField = ({
    label,
    value,
    onChange,
    hint,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    hint?: string;
  }) => (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(num(Number(e.target.value)))}
        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
      />
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-white inline-flex items-center gap-1.5">
          <Gift className="w-4 h-4 text-emerald-400" /> Referral signup bonus
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
            className="w-4 h-4 accent-emerald-500"
          />
          Enabled
        </label>
      </div>
      <p className="text-[11px] text-slate-500 -mt-2">
        Reward referrers when their invitee signs up, upgrades, and stays active.
        Referrers only earn while they meet the tier + daily-mission rule below
        (anti-farming). Points are in platform points.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <NumField
          label="Signup bonus (points)"
          value={cfg.signupPoints}
          onChange={(v) => setCfg({ ...cfg, signupPoints: v })}
          hint="Paid when the invitee verifies their email."
        />
        <NumField
          label="Subscription bonus (points)"
          value={cfg.subscriptionPoints}
          onChange={(v) => setCfg({ ...cfg, subscriptionPoints: v })}
          hint="Paid when the invitee buys any package."
        />
        <NumField
          label="Monthly bonus (points)"
          value={cfg.monthlyPoints}
          onChange={(v) => setCfg({ ...cfg, monthlyPoints: v })}
          hint="Month-end, if the invitee stayed active enough days."
        />
        <NumField
          label="Referrer min access level"
          value={cfg.minReferrerAccessLevel}
          onChange={(v) => setCfg({ ...cfg, minReferrerAccessLevel: v })}
          hint="Referrer's package accessLevel must be ≥ this."
        />
        <NumField
          label="Monthly: min mission-days"
          value={cfg.monthlyMinMissionDays}
          onChange={(v) => setCfg({ ...cfg, monthlyMinMissionDays: v })}
          hint="Distinct days the invitee completed a daily mission."
        />
        <label className="flex items-center gap-2 text-sm text-slate-200 self-end pb-2">
          <input
            type="checkbox"
            checked={cfg.requireReferrerDailyMission}
            onChange={(e) =>
              setCfg({ ...cfg, requireReferrerDailyMission: e.target.checked })
            }
            className="w-4 h-4 accent-emerald-500"
          />
          Referrer must complete own daily mission
        </label>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        Save bonus settings
      </button>
    </div>
  );
}
