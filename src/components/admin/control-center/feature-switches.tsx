"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

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
}

/**
 * Every on/off platform setting in one list (Control Center). The rows come
 * from the settings catalog, so a switch added there shows up here by itself.
 */
export function FeatureSwitches({
  initial,
  groups,
}: {
  initial: SwitchRow[];
  groups: { id: string; label: string; blurb: string }[];
}) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
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

  async function flip(row: SwitchRow, value: boolean) {
    if (row.danger && !window.confirm(`${row.danger}\n\nContinue?`)) return;
    setBusy(row.key);
    try {
      const r = await fetch("/api/admin/control-center/switches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: row.key, value }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not save");
      setRows((prev) => prev.map((x) => (x.key === row.key ? { ...x, value } : x)));
      toast.success(`${row.label}: ${value ? "on" : "off"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
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
                {items.map((r) => (
                  <li key={r.key} className="flex items-start gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white">
                        {r.label}
                        {r.notActive && (
                          <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-300">
                            not active yet
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400">{r.description}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500">
                        <code className="break-all">{r.key}</code>
                        {r.value === null && <span>· not set — the built-in default applies</span>}
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
                          disabled={busy !== null}
                          aria-pressed={r.value === v}
                          onClick={() => r.value !== v && flip(r, v)}
                          className={cn(
                            "px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed",
                            r.value === v
                              ? v
                                ? "bg-emerald-500/20 text-emerald-200"
                                : "bg-rose-500/20 text-rose-200"
                              : "bg-slate-950 text-slate-400 hover:text-white"
                          )}
                        >
                          {busy === r.key && r.value !== v ? "…" : label}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {shown.length === 0 && <p className="text-sm text-slate-500">No switch matches.</p>}
    </div>
  );
}
