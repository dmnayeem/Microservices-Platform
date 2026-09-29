"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  COMMISSION_SOURCE_GROUPS,
  COMMISSION_SOURCE_KEYS,
  NOT_CONNECTED_SOURCES,
  type CommissionSourceKey,
} from "@/lib/referral-commission-sources";

/**
 * Which earning sources pay My Team commission — setting
 * "referral.commission_sources" (a map of source → on/off). The defaults are
 * what the platform did before the setting existed: every task type on, CPA
 * and offerwall off. Saved through the shared POST /api/admin/settings
 * (settings.edit permission, validated, audited, cache primed).
 */
export function CommissionSourcesForm({
  initial,
  canEdit,
}: {
  initial: Record<CommissionSourceKey, boolean>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = COMMISSION_SOURCE_KEYS.some((k) => value[k] !== saved[k]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "referral", settings: { "referral.commission_sources": value } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setSaved(value);
      toast.success("Commission sources saved");
      router.refresh();
    } catch (e) {
      toast.error("Failed to save", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="max-w-3xl space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Commission sources</h2>
        <p className="mt-1 text-sm text-gray-400">
          Which earnings pay My Team commission to the uplines, using the levels above. A ticked source pays; an unticked one
          pays nothing. Commission is worked out in fractions of a point: each upline&apos;s fractions accrue, and whole points are
          paid as soon as they add up to 1 point.
        </p>
      </div>

      {COMMISSION_SOURCE_GROUPS.map((g) => (
        <fieldset key={g.id} className="space-y-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{g.label}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {g.items.map((it) => (
              <label
                key={it.key}
                className="flex items-start gap-2 rounded-lg border border-gray-800 bg-gray-950/40 p-2.5 text-sm text-gray-200"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={value[it.key]}
                  disabled={!canEdit}
                  onChange={(e) => setValue((v) => ({ ...v, [it.key]: e.target.checked }))}
                />
                <span className="min-w-0">
                  {it.label}
                  {it.hint && <span className="block text-xs text-gray-500">{it.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="space-y-1 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Other — never pays commission</p>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-gray-400">
          {NOT_CONNECTED_SOURCES.map((s) => (
            <li key={s.label}>
              {s.label}
              {s.note && <span className="text-gray-500"> — {s.note}</span>}
            </li>
          ))}
        </ul>
      </div>

      {canEdit ? (
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save sources
        </button>
      ) : (
        <p className="text-xs text-amber-400">View-only — saving these needs the settings edit permission.</p>
      )}
    </section>
  );
}
