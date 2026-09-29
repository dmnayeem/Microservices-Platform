"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { NotActiveBadge } from "@/components/admin/shared/controls";
import {
  CATEGORY_FOR_KEY,
  settingDomId,
  settingEntry,
} from "@/lib/admin-settings-catalog";

/**
 * Shared pieces for a settings panel that lives on a feature's own admin page
 * (Withdrawals → Settings, KYC → Settings, Fraud Monitor → Settings, Feed
 * settings → General) instead of the System Settings form.
 *
 * A moved control saves exactly as it did on System Settings: the same key,
 * through the same `POST /api/admin/settings` (so the same `settings.edit`
 * gate, the same `setting-guards.ts` bounds, the same audit row and cache
 * priming), filed under the same row category — which comes from the catalog,
 * not from this file. The only difference is deliberate: a panel writes only
 * the keys that changed, so an untouched setting keeps its row as it is.
 */

export type SettingsBag = Record<string, unknown>;

export const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-60";

/**
 * One labelled control.
 *
 * Pass `settingKey` and nothing else: the name and the plain-language
 * description come from `admin-settings-catalog.ts`, which is also what the
 * search box indexes and what `CATEGORY_FOR_KEY` is derived from. One row in
 * one file describes a setting completely, so the label and the key cannot
 * drift apart — which is exactly how users once got charged a 5% withdrawal
 * fee from a box the owner had set to 2.5%.
 *
 * `label`/`hint` remain for the handful of controls that are not one setting
 * each (the retention-window grid writes four fields of one JSON key).
 */
export function Field({
  label,
  hint,
  settingKey,
  children,
}: {
  label?: string;
  hint?: string;
  settingKey?: string;
  children: React.ReactNode;
}) {
  const entry = settingKey ? settingEntry(settingKey) : undefined;
  const shownLabel = label ?? entry?.label ?? settingKey;
  const shownHint = hint ?? entry?.description;
  return (
    <div
      id={settingKey ? settingDomId(settingKey) : undefined}
      data-setting-key={settingKey}
      className="scroll-mt-28"
    >
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {shownLabel}
        {entry?.status === "not-active" && <NotActiveBadge />}
        {shownHint && <span className="text-slate-600 ml-2">{shownHint}</span>}
      </label>
      {children}
    </div>
  );
}

/**
 * Values + a save that writes only what changed, each key under its catalog
 * category. `categoryFor` is for the rare key that is not in the catalog
 * (e.g. `feed.boost_max_per_user`, filed under "ads" since it was created);
 * a key with no category at all is refused rather than silently dropped.
 */
export function useKeyedSettings(
  defaults: SettingsBag,
  initial: SettingsBag,
  opts: { categoryFor?: Record<string, string>; savedMessage?: string } = {}
) {
  const router = useRouter();
  const start = { ...defaults, ...initial };
  const [values, setValues] = useState<SettingsBag>(start);
  const [baseline, setBaseline] = useState<SettingsBag>(start);
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }));

  const changedKeys = Object.keys(values).filter(
    (k) => JSON.stringify(values[k]) !== JSON.stringify(baseline[k])
  );

  const save = async () => {
    const byCategory = new Map<string, SettingsBag>();
    for (const k of changedKeys) {
      const category = opts.categoryFor?.[k] ?? CATEGORY_FOR_KEY[k];
      if (!category) {
        toast.error("Not saved", { description: `No category for ${k}` });
        return;
      }
      const bag = byCategory.get(category) ?? {};
      bag[k] = values[k];
      byCategory.set(category, bag);
    }
    if (byCategory.size === 0) return;
    setBusy(true);
    try {
      for (const [category, settings] of byCategory) {
        const res = await fetch("/api/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, settings }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        // This group is stored — never re-send it or show it as unsaved.
        setBaseline((b) => ({ ...b, ...settings }));
      }
      toast.success(opts.savedMessage ?? "Settings saved");
      router.refresh();
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return { values, set, busy, dirty: changedKeys.length > 0, save };
}

export function SaveBar({
  canEdit,
  busy,
  dirty,
  onSave,
}: {
  canEdit: boolean;
  busy: boolean;
  dirty: boolean;
  onSave: () => void;
}) {
  if (!canEdit) {
    return (
      <p className="text-xs text-amber-400">
        View-only — saving these needs the settings edit permission.
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={busy || !dirty}
        className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save settings
      </button>
      {dirty && !busy && (
        <span className="text-xs text-amber-300">Unsaved changes</span>
      )}
    </div>
  );
}

/** A pointer to a related setting that is edited on another screen. */
export function SeeAlso({
  label,
  href,
  linkLabel,
  why,
}: {
  label: string;
  href: string;
  linkLabel: string;
  why: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-300">{label}</p>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/20"
        >
          {linkLabel}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{why}</p>
    </div>
  );
}
