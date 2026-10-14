import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A titled block of small figures — the admin overview's building unit.
 *
 * One card per area (Users, Tasks, Withdrawals…) instead of a row of large
 * stat cards each, so an owner can read the whole platform on one screen and
 * on a phone. Every figure can link straight to the list it counts.
 */

export type MetricTone = "default" | "good" | "warn" | "bad" | "muted";

export interface Metric {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: MetricTone;
  /**
   * The sub-heading this figure sits under ("Sign-ups", "Account status" …).
   * Figures with a group are laid out in labelled rows, so fifteen numbers
   * read as four short lists instead of one wall (owner, 2026-10-15).
   */
  group?: string;
}

/** The figures in their groups, in the order the groups first appear. */
function grouped(metrics: Metric[]): { name: string | null; items: Metric[] }[] {
  const by = new Map<string | null, Metric[]>();
  for (const m of metrics) {
    const name = m.group ?? null;
    by.set(name, [...(by.get(name) ?? []), m]);
  }
  return [...by.entries()].map(([name, items]) => ({ name, items }));
}

const TONE: Record<MetricTone, string> = {
  default: "text-white",
  good: "text-emerald-400",
  warn: "text-amber-400",
  bad: "text-red-400",
  muted: "text-slate-400",
};

const ACCENT: Record<string, string> = {
  blue: "text-blue-400 bg-blue-500/10",
  green: "text-emerald-400 bg-emerald-500/10",
  purple: "text-purple-400 bg-purple-500/10",
  amber: "text-amber-400 bg-amber-500/10",
  red: "text-red-400 bg-red-500/10",
  indigo: "text-indigo-400 bg-indigo-500/10",
};

export function MetricPanel({
  title,
  icon: Icon,
  accent = "blue",
  href,
  note,
  metrics,
  className,
}: {
  title: string;
  icon: LucideIcon;
  accent?: keyof typeof ACCENT;
  href?: string;
  /** One short line under the title — what the figures leave out, for example. */
  note?: string;
  metrics: Metric[];
  className?: string;
}) {
  return (
    <section className={cn("card p-4 h-full", className)}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("p-1.5 rounded-lg shrink-0", ACCENT[accent])}>
            <Icon className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
            {note && <p className="text-[11px] text-slate-500 truncate">{note}</p>}
          </div>
        </div>
        {href && (
          <Link
            href={href}
            className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-400 hover:text-white"
          >
            Open <ArrowUpRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      <div className="space-y-3">
        {grouped(metrics).map((g, gi) => (
          <div key={g.name ?? `g${gi}`}>
            {g.name && (
              <p className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {g.name}
                <span className="h-px flex-1 bg-slate-800" />
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {g.items.map((m) => {
                const body = (
                  <>
                    <p className={cn("text-xl font-bold leading-tight tabular-nums", TONE[m.tone ?? "default"])}>
                      {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
                    </p>
                    {/* Whole label, wrapping — a cut-off "AWAITING REVI…" said nothing. */}
                    <p className="mt-0.5 text-xs font-medium leading-snug text-slate-300">{m.label}</p>
                    {m.hint && <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{m.hint}</p>}
                  </>
                );
                const box = "rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5 min-w-0 flex flex-col";
                return m.href ? (
                  <Link key={m.label} href={m.href} className={cn(box, "hover:border-slate-600 transition-colors")}>
                    {body}
                  </Link>
                ) : (
                  <div key={m.label} className={box}>
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
