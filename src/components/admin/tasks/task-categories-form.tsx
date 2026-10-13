"use client";

import { useState } from "react";
import { Check, ClipboardList, Loader2, Palette, Save, LayoutGrid } from "lucide-react";
import { toast } from "@/lib/toast";
import { TASK_CATEGORY_META } from "@/lib/task-categories";
import {
  TASK_INSTRUCTIONS_COLORS,
  TASK_INSTRUCTIONS_COLOR_KEY,
  taskInstructionsHex,
} from "@/lib/task-instructions-color";

/**
 * Admin toggle for which task-category cards show on the /tasks page. Each
 * category is ON by default; turning it OFF hides that card for everyone.
 * Stored as SystemSetting `tasks.category_visibility` = { [key]: boolean }.
 */
export function TaskCategoriesForm({
  initial,
  initialColor,
  canManage,
}: {
  initial: Record<string, boolean>;
  /** Stored `tasks.instructions_color` key; omitted = no colour picker (/admin/visibility). */
  initialColor?: string;
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

      {initialColor !== undefined && <InstructionsColorPicker initial={initialColor} canManage={canManage} />}
    </div>
  );
}

/**
 * The colour of the Instructions block on every task page. A fixed list (see
 * lib/task-instructions-color) with a live preview of the block itself.
 */
function InstructionsColorPicker({ initial, canManage }: { initial: string; canManage: boolean }) {
  const [color, setColor] = useState(
    TASK_INSTRUCTIONS_COLORS.some((c) => c.key === initial) ? initial : TASK_INSTRUCTIONS_COLORS[0].key
  );
  const [saving, setSaving] = useState(false);
  const hex = taskInstructionsHex(color);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "tasks", settings: { [TASK_INSTRUCTIONS_COLOR_KEY]: color } }),
      });
      if (!res.ok) throw new Error();
      toast.success("Instructions colour saved");
    } catch {
      toast.error("Couldn't save the instructions colour");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div>
        <h2 className="inline-flex items-center gap-2 text-lg font-bold text-white">
          <Palette className="h-5 w-5 text-indigo-400" /> Instructions colour
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          The colour of the Instructions block on every task page. Each choice reads well in dark and light mode.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TASK_INSTRUCTIONS_COLORS.map((c) => {
          const on = c.key === color;
          return (
            <button
              key={c.key}
              type="button"
              disabled={!canManage}
              onClick={() => setColor(c.key)}
              aria-pressed={on}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition disabled:opacity-50 ${
                on ? "border-white bg-slate-800 text-white" : "border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full" style={{ background: c.hex }}>
                {on && <Check className="h-3.5 w-3.5 text-white" />}
              </span>
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Preview — the same shapes the task page draws. */}
      <div
        className="relative overflow-hidden rounded-2xl border p-4 pl-5"
        style={{
          borderColor: `${hex}4d`,
          background: `linear-gradient(to bottom right, ${hex}26, ${hex}0d, transparent)`,
        }}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: hex }} />
        <div className="mb-3 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${hex}26`, color: hex }}>
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-white">Instructions</p>
            <p className="text-xs text-slate-400">Read every step before you start</p>
          </div>
        </div>
        <div
          className="flex gap-2.5 rounded-xl border px-3 py-2.5"
          style={{ borderColor: `${hex}33`, background: `${hex}0d` }}
        >
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
            style={{ background: hex }}
          >
            1
          </span>
          <span className="text-sm text-slate-300">Open the link and follow the page.</span>
        </div>
      </div>

      {canManage && (
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save colour
        </button>
      )}
    </div>
  );
}
