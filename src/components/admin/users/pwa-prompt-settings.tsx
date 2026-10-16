"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { NumberInput } from "@/components/admin/number-input";
import {
  PROMPT_PLATFORMS,
  PWA_PROMPT_KEYS,
  type PromptMode,
  type PromptPlatform,
  type PwaPromptConfig,
} from "@/lib/pwa-shared";

const PLATFORM_LABEL: Record<PromptPlatform, { name: string; note: string }> = {
  android: { name: "Android", note: "Chrome and other Android browsers" },
  ios: { name: "iPhone / iPad", note: "Safari — shows the Add to Home Screen steps" },
  desktop: { name: "Desktop / laptop", note: "Chrome and Edge on a computer, when they offer install" },
};

const MODE_LABEL: Record<PromptMode, string> = {
  off: "Off",
  card: "Bottom card",
  center: "Centre popup",
};

/**
 * Who is asked to install the app, and how (owner, 2026-10-16): per kind of
 * device — off, the small card at the bottom, or a popup in the middle of the
 * screen — plus how long a dismissed prompt stays away. Members who already
 * have the app on that device are never asked. Saved through
 * /api/admin/settings (settings.edit).
 */
export function PwaPromptSettings({ initial, canEdit }: { initial: PwaPromptConfig; canEdit: boolean }) {
  const router = useRouter();
  const [modes, setModes] = useState(initial.modes);
  const [hours, setHours] = useState(String(initial.snoozeHours));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "pwa",
          settings: { [PWA_PROMPT_KEYS.modes]: modes, [PWA_PROMPT_KEYS.snoozeHours]: Number(hours) || 24 },
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Could not save");
      toast.success("Install prompt saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div>
        <h2 className="text-sm font-semibold text-white">Install prompt</h2>
        <p className="text-xs text-gray-500">
          Asks members who don&apos;t have the app to install it. Choose, for each kind of device, whether it shows — and
          as a small card at the bottom or a popup in the middle of the screen.
        </p>
      </div>

      <div className="divide-y divide-gray-800 rounded-lg border border-gray-800">
        {PROMPT_PLATFORMS.map((p) => (
          <div key={p} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{PLATFORM_LABEL[p].name}</p>
              <p className="text-xs text-gray-500">{PLATFORM_LABEL[p].note}</p>
            </div>
            <div className="inline-flex rounded-lg border border-gray-700 p-0.5" role="radiogroup" aria-label={PLATFORM_LABEL[p].name}>
              {(Object.keys(MODE_LABEL) as PromptMode[]).map((m) => {
                const on = modes[p] === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!canEdit}
                    onClick={() => setModes((prev) => ({ ...prev, [p]: m }))}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition disabled:opacity-60 ${
                      on
                        ? m === "off"
                          ? "bg-gray-700 text-white"
                          : "bg-indigo-600 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {MODE_LABEL[m]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <label className="block max-w-xs space-y-1 text-xs text-gray-400">
        Ask again after a dismissal (hours)
        <NumberInput
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          disabled={!canEdit}
          className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white disabled:opacity-60"
        />
        <span className="block text-[11px] text-gray-500">1 to 720. 24 = once a day.</span>
      </label>

      {canEdit && (
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}
