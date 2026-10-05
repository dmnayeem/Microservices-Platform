"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Table2 } from "lucide-react";
import { COMPARE_ROWS, DEFAULT_COMPARE_ROWS } from "@/lib/plan-compare";
import { toast } from "@/lib/toast";

/**
 * Which rows the plan comparison table shows users. The cell values come from
 * each plan's real switches and limits — this only picks the rows.
 */
export function CompareRowsEditor({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/packages/compare-rows", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.rows) ? d.rows : DEFAULT_COMPARE_ROWS))
      .catch(() => setRows(DEFAULT_COMPARE_ROWS));
  }, []);

  const save = async (next: string[]) => {
    setRows(next);
    setSaving(true);
    try {
      const r = await fetch("/api/admin/packages/compare-rows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: next }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Try again");
      setRows(d.rows);
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setSaving(false);
    }
  };

  const groups = [...new Set(COMPARE_ROWS.map((r) => r.group))];

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-sky-500/10 text-sky-400">
            <Table2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-white">What the plan comparison shows</h2>
            <p className="text-sm text-gray-400">
              Tick the rows users see in the &ldquo;Compare plans&rdquo; table. Each plan&apos;s ✓ / ✗ and numbers come
              from its own settings, so the table is always true.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          <Link
            href="/packages"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-700"
          >
            Preview <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      {!rows ? (
        <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300/80">{g}</p>
              <ul className="space-y-1">
                {COMPARE_ROWS.filter((r) => r.group === g).map((r) => {
                  const on = rows.includes(r.key);
                  return (
                    <li key={r.key}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-800/60" title={r.hint}>
                        <input
                          type="checkbox"
                          disabled={!canEdit || saving}
                          checked={on}
                          onChange={() =>
                            save(on ? rows.filter((k) => k !== r.key) : [...rows, r.key])
                          }
                          className="mt-0.5 h-4 w-4 accent-sky-500"
                        />
                        <span className="text-sm text-gray-200">{r.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">
        Rows show in the order you tick them. To change a plan&apos;s ✓ / ✗, edit the plan.
      </p>
    </section>
  );
}
