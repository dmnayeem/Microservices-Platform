"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Loader2, Save, Percent } from "lucide-react";
import type { CourseCommissionConfig } from "@/lib/course-commission";

interface Props {
  initial: CourseCommissionConfig;
  categories: Array<{ id: string; slug: string; name: string }>;
  canEdit: boolean;
}

export function CourseCommissionForm({ initial, categories, canEdit }: Props) {
  const router = useRouter();
  const [defaultBps, setDefaultBps] = useState<string>(String(initial.default));
  const [byCategory, setByCategory] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const c of categories) {
      const v = initial.byCategory?.[c.slug.toUpperCase()];
      out[c.slug] = v !== undefined ? String(v) : "";
    }
    return out;
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const defNum = parseInt(defaultBps, 10);
    if (!Number.isFinite(defNum) || defNum < 0 || defNum > 10000) {
      toast.error("Default rate must be 0–10000 bps");
      return;
    }
    const byCat: Record<string, number> = {};
    for (const c of categories) {
      const raw = byCategory[c.slug];
      if (raw === "" || raw === undefined) continue;
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0 || n > 10000) {
        toast.error(`Invalid rate for ${c.name}`);
        return;
      }
      byCat[c.slug.toUpperCase()] = n;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/courses/commission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default: defNum, byCategory: byCat }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success("Commission settings saved");
      router.refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3">
        <h2 className="text-base font-bold text-white">Default platform rate</h2>
        <p className="text-xs text-slate-400">
          Applied when neither the course nor its category has an override.
        </p>
        <BpsInput
          value={defaultBps}
          onChange={setDefaultBps}
          disabled={!canEdit}
          allowEmpty={false}
        />
      </section>

      <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3">
        <h2 className="text-base font-bold text-white">
          Per-category overrides
        </h2>
        <p className="text-xs text-slate-400">
          Leave blank to use the default. Charge more on premium categories
          (eg. coding bootcamps) or less on commodity ones (eg. ebooks).
        </p>
        {categories.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            No active categories. Create some at{" "}
            <a
              href="/admin/courses/categories"
              className="text-indigo-300 hover:underline"
            >
              /admin/courses/categories
            </a>
            .
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categories.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-slate-700 bg-slate-950 p-3"
              >
                <p className="text-sm font-bold text-white">{c.name}</p>
                <p className="text-[10px] text-slate-500 font-mono uppercase mb-2">
                  {c.slug}
                </p>
                <BpsInput
                  value={byCategory[c.slug] ?? ""}
                  onChange={(v) =>
                    setByCategory((prev) => ({ ...prev, [c.slug]: v }))
                  }
                  disabled={!canEdit}
                  allowEmpty
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {canEdit && (
        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save commission settings
          </button>
        </div>
      )}
    </div>
  );
}

function BpsInput({
  value,
  onChange,
  disabled,
  allowEmpty,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  allowEmpty?: boolean;
}) {
  const n = parseInt(value, 10);
  const pct =
    value !== "" && Number.isFinite(n)
      ? `${(n / 100).toFixed(2)}%`
      : allowEmpty
      ? "uses default"
      : "—";
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={0}
          max={10000}
          step={10}
          disabled={disabled}
          placeholder={allowEmpty ? "(default)" : "2000"}
          className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 tabular-nums"
        />
        <Percent className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
      </div>
      <span className="text-xs text-slate-400 font-mono whitespace-nowrap tabular-nums w-24 text-right">
        {pct}
      </span>
    </div>
  );
}
