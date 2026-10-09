"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { SaveChangesBar } from "@/components/admin/control-center/staff-access-manager";

export interface SwitchRow {
  key: string;
  label: string;
  description: string;
  effect: string | null;
  danger: string | null;
  notActive: boolean;
  home: { href: string; where: string } | null;
  group: string;
  value: boolean | null;
  /** The code default when no value is saved, if known. */
  defaultValue: boolean | null;
}

/**
 * Every on/off platform setting in one list (Control Center). The rows come
 * from the settings catalog (plus the few on/off settings that live inside a
 * feature's own config), so a switch added there shows up here by itself.
 *
 * Clicking only changes the draft; "Save changes" writes them all (owner,
 * 2026-10-09: there was no Save, every click saved on its own).
 */
export function FeatureSwitches({
  initial,
  groups,
}: {
  initial: SwitchRow[];
  groups: { id: string; label: string; blurb: string }[];
}) {
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (r) =>
        r.label.toLowerCase().includes(t) ||
        r.key.toLowerCase().includes(t) ||
        r.description.toLowerCase().includes(t)
    );
  }, [rows, q]);

  const effective = (r: SwitchRow): boolean | null => r.value ?? r.defaultValue;
  const shownValue = (r: SwitchRow): boolean | null => (r.key in draft ? draft[r.key] : effective(r));
  const pending = Object.keys(draft);

  // Leaving with unsaved switches asks first.
  useEffect(() => {
    if (pending.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending.length]);

  function choose(row: SwitchRow, value: boolean) {
    setDraft((prev) => {
      const next = { ...prev };
      // Back to what is saved = no change.
      if (value === effective(row) && row.value !== null) delete next[row.key];
      else next[row.key] = value;
      return next;
    });
  }

  async function save() {
    const changes = rows.filter((r) => r.key in draft);
    const dangers = changes.filter((r) => r.danger).map((r) => `• ${r.label}: ${r.danger}`);
    if (dangers.length && !window.confirm(`${dangers.join("\n\n")}\n\nSave anyway?`)) return;
    setSaving(true);
    const failed: string[] = [];
    const saved: Record<string, boolean> = {};
    // One at a time: each is its own audited write, and a refusal on one must
    // not stop the others.
    for (const r of changes) {
      const value = draft[r.key];
      try {
        const res = await fetch("/api/admin/control-center/switches", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: r.key, value }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? "Could not save");
        saved[r.key] = value;
      } catch (e) {
        failed.push(`${r.label}: ${e instanceof Error ? e.message : "Could not save"}`);
      }
    }
    setRows((prev) => prev.map((x) => (x.key in saved ? { ...x, value: saved[x.key] } : x)));
    setDraft((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(saved)) delete next[k];
      return next;
    });
    setSaving(false);
    const n = Object.keys(saved).length;
    if (n) toast.success(`${n} switch${n === 1 ? "" : "es"} saved`);
    if (failed.length) toast.error("Some switches were not saved", { description: failed.join(" · ") });
  }

  return (
    <div className="space-y-4">
      <label className="relative block max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a switch…"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
        />
      </label>

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((g) => {
          const items = shown.filter((r) => r.group === g.id);
          if (items.length === 0) return null;
          return (
            <div key={g.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-sm font-bold text-white">{g.label}</p>
              <p className="mb-3 text-[11px] text-slate-400">{g.blurb}</p>
              <ul className="divide-y divide-slate-800/70">
                {items.map((r) => {
                  const cur = shownValue(r);
                  const changed = r.key in draft;
                  return (
                    <li key={r.key} className={cn("flex items-start gap-3 py-2.5", changed && "-mx-2 rounded-lg bg-amber-500/10 px-2")}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white">
                          {r.label}
                          {r.notActive && (
                            <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-300">
                              not active yet
                            </span>
                          )}
                          {changed && (
                            <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-200">
                              unsaved
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-400">{r.description}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500">
                          <code className="break-all">{r.key}</code>
                          {r.value === null && (
                            <span>
                              · not set —{" "}
                              {r.defaultValue === null ? "the built-in default applies" : `default is ${r.defaultValue ? "on" : "off"}`}
                            </span>
                          )}
                          {r.home && (
                            <Link href={r.home.href} className="inline-flex items-center gap-0.5 text-sky-400 hover:underline">
                              {r.home.where} <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </p>
                      </div>
                      <div className="inline-flex shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-700">
                        {([
                          [true, "On"],
                          [false, "Off"],
                        ] as const).map(([v, label]) => (
                          <button
                            key={label}
                            type="button"
                            disabled={saving}
                            aria-pressed={cur === v}
                            onClick={() => choose(r, v)}
                            className={cn(
                              "px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed",
                              cur === v
                                ? v
                                  ? "bg-emerald-500/20 text-emerald-200"
                                  : "bg-rose-500/20 text-rose-200"
                                : "bg-slate-950 text-slate-400 hover:text-white"
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {shown.length === 0 && <p className="text-sm text-slate-500">No switch matches.</p>}

      <SaveChangesBar
        count={pending.length}
        saving={saving}
        onSave={save}
        onDiscard={() => setDraft({})}
        what="in Feature switches"
      />
    </div>
  );
}
