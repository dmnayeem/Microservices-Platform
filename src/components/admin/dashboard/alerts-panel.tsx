import Link from "next/link";
import { AlertTriangle, ShieldAlert, Info, CheckCircle2, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Things that need a person, worst first. The page builds the list from counts
 * the viewer is allowed to see, and leaves out anything at zero — an alert
 * that says "0" is noise that trains people to stop reading the box.
 *
 * Laid out as one full-width row of action tiles (count + label + link) so it
 * reads at a glance (owner, 2026-10-18). Red and amber are only ever used for
 * counts above zero — a zero never reaches this list.
 */

export type AlertLevel = "critical" | "warning" | "info";

export interface DashboardAlert {
  level: AlertLevel;
  /** How many — the big figure on the tile. */
  count: number;
  /** What the count is, e.g. "withdrawals waiting over 48h". */
  label: string;
  detail?: string;
  href: string;
}

const STYLE: Record<AlertLevel, { icon: typeof Info; box: string; text: string }> = {
  critical: { icon: ShieldAlert, box: "border-red-500/40 bg-red-500/5 hover:border-red-500/70", text: "text-red-400" },
  warning: { icon: AlertTriangle, box: "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/70", text: "text-amber-400" },
  info: { icon: Info, box: "border-slate-800 bg-slate-950/40 hover:border-slate-600", text: "text-sky-400" },
};

const ORDER: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };

export function AlertsPanel({ alerts }: { alerts: DashboardAlert[] }) {
  const list = [...alerts].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="p-2 rounded-lg shrink-0 text-amber-400 bg-amber-500/10">
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">Needs attention</h2>
            <p className="text-xs text-slate-400">Work waiting on a person, most urgent first</p>
          </div>
        </div>
        {list.length > 0 && (
          <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300 tabular-nums">
            {list.length}
          </span>
        )}
      </div>
      {list.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-400 py-4 justify-center">
          <CheckCircle2 className="w-4 h-4" /> All clear
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {list.map((a) => {
            const s = STYLE[a.level];
            const Icon = s.icon;
            return (
              <li key={`${a.href}|${a.label}`} className="min-w-0">
                <Link
                  href={a.href}
                  className={cn("flex h-full flex-col rounded-lg border px-3 py-2.5 min-w-0 transition-colors", s.box)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("text-xl font-bold leading-tight tabular-nums", s.text)}>
                      {a.count.toLocaleString()}
                    </span>
                    <Icon className={cn("w-4 h-4 shrink-0", s.text)} />
                  </span>
                  <span className="mt-0.5 text-xs font-medium leading-snug text-slate-300">{a.label}</span>
                  {a.detail && <span className="mt-0.5 text-[11px] leading-snug text-slate-500">{a.detail}</span>}
                  <span className="mt-auto pt-1.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-400">
                    Open <ArrowUpRight className="w-3 h-3" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
