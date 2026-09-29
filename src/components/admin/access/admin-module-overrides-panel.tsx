"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, CATEGORY_ORDER, type ModuleCategory } from "@/lib/rbac";
import { MODULE_SOURCE_LABEL, type ModuleSource } from "@/lib/admin-module-rules";
import { iconMap } from "@/components/admin/sidebar";
import { LayoutDashboard, Loader2, Save } from "lucide-react";

type Row = {
  href: string;
  name: string;
  icon: string;
  category: ModuleCategory;
  configurable: boolean;
  financeOnly: boolean;
  override: "show" | "hide" | null;
  inherited: { visible: boolean; source: ModuleSource };
};

/**
 * One admin's pages: inherit / show / hide per admin page, with what "inherit"
 * currently resolves to and why. Super admin only; saves on its own through
 * /api/admin/users/[id]/modules, separate from the rest of the edit form.
 */
export function AdminModuleOverridesPanel({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [applicable, setApplicable] = useState(true);
  const [draft, setDraft] = useState<Record<string, "show" | "hide">>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/modules`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load admin pages");
      setApplicable(data.applicable !== false);
      const list = (data.modules ?? []) as Row[];
      setRows(list);
      const d: Record<string, "show" | "hide"> = {};
      for (const r of list) if (r.override) d[r.href] = r.override;
      setDraft(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!rows) return false;
    return rows.some((r) => (draft[r.href] ?? null) !== r.override);
  }, [rows, draft]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/modules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Save failed");
      toast.success("Admin pages saved");
      await load();
    } catch (e) {
      toast.error("Save failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!rows) {
    return (
      <p className="text-xs text-slate-500 inline-flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading admin pages…
      </p>
    );
  }
  if (!applicable) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
          Admin pages
        </p>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save pages
        </button>
      </div>
      <p className="text-[10px] text-slate-500 -mt-1">
        <b>Inherit</b> follows the Admin pages table and the role&apos;s permissions (shown
        under each page). <b>Show</b> opens the page for this admin and adds its permissions —
        never finance (that needs a finance grant) or staff administration. <b>Hide</b> removes
        the page only; permissions it shares with other pages stay. Saved separately from the
        form.
      </p>
      {CATEGORY_ORDER.map((cat) => {
        const list = rows.filter((r) => r.category === cat && r.configurable);
        if (!list.length) return null;
        return (
          <div key={cat} className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-600 font-bold pt-1">
              {CATEGORY_LABELS[cat]}
            </p>
            {list.map((r) => {
              const Icon = iconMap[r.icon] || LayoutDashboard;
              const cur = draft[r.href] ?? null;
              const opts: Array<{ lbl: string; val: "show" | "hide" | null }> = [
                { lbl: "Inherit", val: null },
                { lbl: "Show", val: "show" },
                { lbl: "Hide", val: "hide" },
              ];
              return (
                <div
                  key={r.href}
                  title={r.href}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800"
                >
                  <span className="min-w-0 flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-slate-200 truncate">
                        {r.name}
                      </span>
                      <span className="block text-[10px] leading-tight text-slate-500">
                        Inherits:{" "}
                        <span className={r.inherited.visible ? "text-emerald-400" : "text-slate-400"}>
                          {r.inherited.visible ? "shown" : "hidden"}
                        </span>{" "}
                        ({MODULE_SOURCE_LABEL[r.inherited.source]})
                        {r.financeOnly && cur === "show" && (
                          <span className="text-amber-400"> · needs a finance grant to work</span>
                        )}
                      </span>
                    </span>
                  </span>
                  <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden text-xs font-semibold shrink-0">
                    {opts.map(({ lbl, val }) => (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => {
                            const next = { ...prev };
                            if (val === null) delete next[r.href];
                            else next[r.href] = val;
                            return next;
                          })
                        }
                        className={cn(
                          "px-3 py-1.5 transition-colors",
                          cur === val
                            ? val === "show"
                              ? "bg-emerald-500 text-white"
                              : val === "hide"
                                ? "bg-red-500 text-white"
                                : "bg-slate-700 text-white"
                            : "text-slate-400 hover:text-white"
                        )}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
