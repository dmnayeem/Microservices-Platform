"use client";

import { useState } from "react";
import { Loader2, Save, LayoutGrid } from "lucide-react";
import { toast } from "@/lib/toast";
import { TASK_CATEGORY_META } from "@/lib/task-categories";

/**
 * Admin toggle for which task-category cards show on the /tasks page. Each
 * category is ON by default; turning it OFF hides that card for everyone.
 * Stored as SystemSetting `tasks.category_visibility` = { [key]: boolean }.
 */
export function TaskCategoriesForm({
  initial,
  canManage,
}: {
  initial: Record<string, boolean>;
  canManage: boolean;
}) {
  const [map, setMap] = useState<Record<string, boolean>>(initial ?? {});
  const [saving, setSaving] = useState(false);

  // Missing key ⇒ shown (true).
  const isOn = (key: string) => map[key] !== false;
  const toggle = (key: string) =>
    setMap((prev) => ({ ...prev, [key]: !(prev[key] !== false) }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "tasks",
          settings: { "tasks.category_visibility": map },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Task category visibility saved");
    } catch {
      toast.error("Couldn't save category visibility");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <LayoutGrid className="w-6 h-6 text-indigo-400" /> Task Categories
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Choose which task-type cards appear on the user{" "}
          <span className="font-mono text-xs">/tasks</span> page. Off = the card
          is hidden from everyone (regardless of whether tasks exist).
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 divide-y divide-slate-800/70">
        {TASK_CATEGORY_META.map((cat) => {
          const on = isOn(cat.key);
          return (
            <div
              key={cat.key}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{cat.label}</p>
                <p className="text-[11px] text-slate-500 font-mono">{cat.key}</p>
              </div>
              <button
                type="button"
                disabled={!canManage}
                onClick={() => toggle(cat.key)}
                aria-pressed={on}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                  on ? "bg-emerald-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    on ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>

      {canManage && (
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
          Save visibility
        </button>
      )}
    </div>
  );
}
