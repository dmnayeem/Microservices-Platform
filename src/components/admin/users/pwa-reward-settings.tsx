"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { PWA_SETTING_KEYS, type PwaRewardConfig } from "@/lib/pwa-shared";

/**
 * The three install-reward settings, saved through /api/admin/settings
 * (settings.edit; bounds in setting-guards.ts).
 */
export function PwaRewardSettings({ initial, canEdit }: { initial: PwaRewardConfig; canEdit: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [points, setPoints] = useState(String(initial.points));
  const [minDays, setMinDays] = useState(String(initial.minDays));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "pwa",
          settings: {
            [PWA_SETTING_KEYS.enabled]: enabled,
            [PWA_SETTING_KEYS.points]: Number(points),
            [PWA_SETTING_KEYS.minDays]: Number(minDays),
          },
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Could not save");
      toast.success("Install reward saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white disabled:opacity-60";

  return (
    <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div>
        <h2 className="text-sm font-semibold text-white">Install reward</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Paid once per account when the installed app has been opened on enough different days. Staff and
          suspended/banned accounts are never paid. Turning it on also pays users who already qualify, the next day
          they open the app.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canEdit}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          Reward enabled
        </label>
        <label className="space-y-1 text-xs text-gray-400">
          Points (0 – 100,000)
          <input
            type="number"
            min={0}
            max={100000}
            step={1}
            value={points}
            disabled={!canEdit}
            onChange={(e) => setPoints(e.target.value)}
            className={input}
          />
        </label>
        <label className="space-y-1 text-xs text-gray-400">
          Days the app must be opened (1 – 30)
          <input
            type="number"
            min={1}
            max={30}
            step={1}
            value={minDays}
            disabled={!canEdit}
            onChange={(e) => setMinDays(e.target.value)}
            className={input}
          />
        </label>
      </div>
      {canEdit ? (
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      ) : (
        <p className="text-xs text-gray-500">You need the settings.edit permission to change these.</p>
      )}
    </div>
  );
}
