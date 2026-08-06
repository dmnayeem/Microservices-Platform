"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Save,
  Check,
  Minus,
} from "lucide-react";

type PermCategory = { label: string; permissions: string[] };
type RoleMeta = { role: string; label: string; color: string; bgColor: string };

interface Props {
  editableRoles: RoleMeta[];
  categories: PermCategory[];
  defaults: Record<string, string[]>;
  config: Record<string, string[]>;
  canManage: boolean;
}

export function RolePermissionEditor({
  editableRoles,
  categories,
  defaults,
  config,
  canManage,
}: Props) {
  // Seed each role's permission set from saved config, else code defaults.
  const seed = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const { role } of editableRoles) {
      out[role] = new Set(config[role] ?? defaults[role] ?? []);
    }
    return out;
  }, [editableRoles, config, defaults]);

  const [sets, setSets] = useState<Record<string, Set<string>>>(seed);
  const [selected, setSelected] = useState(editableRoles[0]?.role ?? "");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const cur = sets[selected] ?? new Set<string>();

  const mutate = (fn: (s: Set<string>) => void) => {
    if (!canManage) return;
    setSets((prev) => {
      const next = { ...prev };
      const clone = new Set(next[selected]);
      fn(clone);
      next[selected] = clone;
      return next;
    });
    setDirty(true);
  };

  const togglePerm = (perm: string) =>
    mutate((s) => (s.has(perm) ? s.delete(perm) : s.add(perm)));

  const toggleCategory = (cat: PermCategory, on: boolean) =>
    mutate((s) => {
      for (const p of cat.permissions) {
        if (on) s.add(p);
        else s.delete(p);
      }
    });

  const catState = (cat: PermCategory): "all" | "some" | "none" => {
    const has = cat.permissions.filter((p) => cur.has(p)).length;
    if (has === 0) return "none";
    if (has === cat.permissions.length) return "all";
    return "some";
  };

  const resetRole = () =>
    mutate((s) => {
      s.clear();
      for (const p of defaults[selected] ?? []) s.add(p);
    });

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string[]> = {};
      for (const { role } of editableRoles) {
        payload[role] = Array.from(sets[role] ?? []);
      }
      const res = await fetch("/api/admin/access/role-permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: payload }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to save");
      }
      toast.success("Role permissions saved");
      setDirty(false);
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedMeta = editableRoles.find((r) => r.role === selected);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Roles &amp; Permissions
          </h2>
          <p className="text-sm text-slate-400">
            {canManage
              ? "Toggle whole sections on/off per role, or expand for fine-grained control. Changes apply everywhere instantly."
              : "Read-only view — a super admin can edit these."}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={resetRole}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
            >
              <RotateCcw className="h-4 w-4" />
              Reset {selectedMeta?.label.replace(" Admin", "")}
            </button>
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save changes
            </button>
          </div>
        )}
      </div>

      {/* Role picker */}
      <div className="mt-4 flex flex-wrap gap-2">
        {editableRoles.map((r) => (
          <button
            key={r.role}
            onClick={() => setSelected(r.role)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              selected === r.role
                ? `${r.bgColor} ${r.color} ring-1 ring-inset ring-current`
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Category toggles + advanced */}
      <div className="mt-5 space-y-3">
        {categories.map((cat) => {
          const state = catState(cat);
          const open = expanded[cat.label] ?? false;
          return (
            <div
              key={cat.label}
              className="rounded-lg border border-slate-800 bg-slate-950/40"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  onClick={() =>
                    setExpanded((e) => ({ ...e, [cat.label]: !open }))
                  }
                  className="inline-flex items-center gap-2 text-sm font-semibold text-white"
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                  {cat.label}
                  <span className="text-xs font-normal text-slate-500">
                    {cat.permissions.filter((p) => cur.has(p)).length}/
                    {cat.permissions.length}
                  </span>
                </button>
                {/* Master toggle */}
                <button
                  onClick={() => toggleCategory(cat, state !== "all")}
                  disabled={!canManage}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                    state === "all"
                      ? "bg-emerald-500"
                      : state === "some"
                      ? "bg-amber-500/70"
                      : "bg-slate-700"
                  }`}
                  aria-label={`Toggle ${cat.label}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      state === "none" ? "left-0.5" : "left-0.5 translate-x-5"
                    }`}
                  />
                </button>
              </div>

              {open && (
                <div className="grid grid-cols-1 gap-1 border-t border-slate-800 px-4 py-3 sm:grid-cols-2">
                  {cat.permissions.map((perm) => {
                    const on = cur.has(perm);
                    return (
                      <button
                        key={perm}
                        onClick={() => togglePerm(perm)}
                        disabled={!canManage}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-800/60 disabled:opacity-60"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            on
                              ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                              : "border-slate-600 text-transparent"
                          }`}
                        >
                          {on ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                        </span>
                        <span className="font-mono text-xs text-slate-300">
                          {perm}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
