"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { FieldHelp } from "@/components/admin/field-help";
import { NumberInput } from "@/components/admin/number-input";
import { inp } from "@/components/admin/settings/keyed-settings";
import { QuestionsEditor } from "./questions-editor";
import {
  PROGRAMS,
  PROGRAM_KEYS,
  type ProgramKey,
  type ProgramRequirements,
  type RequirementsConfig,
} from "@/lib/application-requirements";

const HELP = {
  enabled:
    "Off: the program takes no new applications (for the blue badge: no new purchases). Members who already have access keep it, and pending applications can still be reviewed.",
  minLevel:
    "The member's level must be at least this to apply. 0 = no minimum. Checked when they submit, and shown as a ✓/✗ on their Apply page.",
  kycRequired:
    "On: only members whose identity (KYC) is approved can apply. Their Apply page links them to the KYC page.",
  minProfilePercent:
    "The profile ring (photo, name, bio, address, social accounts…) must reach this percentage. 0 = no minimum. The member is linked to the first missing field.",
  minAccountDays:
    "Days since sign-up. Stops brand-new accounts from applying straight away. 0 = no minimum.",
  note: "Shown to applicants on the program's card — e.g. what you look for, or how long a review takes. Leave empty for none.",
};

export function RequirementsEditor({
  initial,
  canEdit,
  ambassador,
}: {
  initial: RequirementsConfig;
  canEdit: boolean;
  /** The Ambassador page's own settings, which also apply (the stricter wins). */
  ambassador: { enabled: boolean; minLevel: number; kyc: boolean };
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<RequirementsConfig>(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(initial);

  const set = (k: ProgramKey, patch: Partial<ProgramRequirements>) =>
    setCfg((c) => ({ ...c, [k]: { ...c[k], ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/applications/requirements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: cfg }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to save");
      setCfg(d.config);
      toast.success("Requirements saved");
      router.refresh();
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-white">Requirements per program</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            What a member must meet before they can apply. Checked on every application (and blue badge purchase) and
            shown with ✓/✗ on the member&apos;s Apply page. All zero / off = no extra requirements.
            {!canEdit && " You can view these; editing needs the Settings → edit permission."}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {PROGRAM_KEYS.map((k) => {
          const r = cfg[k];
          return (
            <fieldset
              key={k}
              disabled={!canEdit}
              className={`rounded-lg border p-3 space-y-3 ${r.enabled ? "border-slate-800 bg-slate-950/40" : "border-slate-800 bg-slate-950/80 opacity-80"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <legend className="text-sm font-bold text-white">{PROGRAMS[k].label}</legend>
                <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => set(k, { enabled: e.target.checked })} />
                  Open for applications
                  <FieldHelp text={HELP.enabled} />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Min level
                    <FieldHelp text={HELP.minLevel} />
                  </label>
                  <NumberInput
                    className={inp}
                    value={r.minLevel}
                    onChange={(e) => set(k, { minLevel: Math.max(0, parseInt(e.target.value) || 0) })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Min profile %
                    <FieldHelp text={HELP.minProfilePercent} />
                  </label>
                  <NumberInput
                    className={inp}
                    value={r.minProfilePercent}
                    onChange={(e) =>
                      set(k, { minProfilePercent: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Min account days
                    <FieldHelp text={HELP.minAccountDays} />
                  </label>
                  <NumberInput
                    className={inp}
                    value={r.minAccountDays}
                    onChange={(e) => set(k, { minAccountDays: Math.max(0, parseInt(e.target.value) || 0) })}
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={r.kycRequired} onChange={(e) => set(k, { kycRequired: e.target.checked })} />
                KYC (identity) must be approved
                <FieldHelp text={HELP.kycRequired} />
              </label>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Note for applicants
                  <FieldHelp text={HELP.note} />
                </label>
                <textarea
                  className={inp}
                  rows={2}
                  maxLength={500}
                  value={r.note}
                  onChange={(e) => set(k, { note: e.target.value })}
                />
              </div>

              <QuestionsEditor questions={r.questions} onChange={(questions) => set(k, { questions })} />

              {k === "AMBASSADOR" && (
                <p className="text-[11px] text-slate-500">
                  The Ambassador page&apos;s own settings also apply — program {ambassador.enabled ? "on" : "off"}, min
                  level {ambassador.minLevel}, KYC {ambassador.kyc ? "required" : "not required"}. The stricter of the
                  two wins.
                </p>
              )}
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}
