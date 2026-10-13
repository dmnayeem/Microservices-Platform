import Link from "next/link";
import { AlertTriangle, ShieldAlert, Info, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Things that need a person, worst first. The page builds the list from counts
 * the viewer is allowed to see, and leaves out anything at zero — an alert
 * that says "0" is noise that trains people to stop reading the box.
 */

export type AlertLevel = "critical" | "warning" | "info";

export interface DashboardAlert {
  level: AlertLevel;
  title: string;
  detail?: string;
  href: string;
}

const STYLE: Record<AlertLevel, { icon: typeof Info; box: string; text: string }> = {
  critical: { icon: ShieldAlert, box: "border-red-500/40 bg-red-500/5", text: "text-red-400" },
  warning: { icon: AlertTriangle, box: "border-amber-500/40 bg-amber-500/5", text: "text-amber-400" },
  info: { icon: Info, box: "border-slate-700 bg-slate-950/40", text: "text-sky-400" },
};

const ORDER: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };

export function AlertsPanel({ alerts }: { alerts: DashboardAlert[] }) {
  const list = [...alerts].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  return (
    <section className="card p-4 h-full">
      <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        Needs attention
        {list.length > 0 && (
          <span className="ml-auto text-[11px] font-medium text-slate-400">{list.length}</span>
        )}
      </h2>
      {list.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-400 py-6 justify-center">
          <CheckCircle2 className="w-4 h-4" /> All clear
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => {
            const s = STYLE[a.level];
            const Icon = s.icon;
            return (
              <li key={a.title}>
                <Link
                  href={a.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2 hover:bg-slate-800/40 transition-colors",
                    s.box
                  )}
                >
                  <Icon className={cn("w-4 h-4 shrink-0", s.text)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-white truncate">{a.title}</span>
                    {a.detail && <span className="block text-[11px] text-slate-400 truncate">{a.detail}</span>}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
