import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Zap } from "lucide-react";

/**
 * One-tap shortcuts to the screens an admin opens most. The page passes only
 * the actions the viewer's permissions allow, so a link never leads to a
 * "no access" bounce.
 */

export interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Waiting items — shown as a badge when above zero. */
  count?: number;
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4 text-yellow-400" />
        Quick actions
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-2">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href + a.label}
              href={a.href}
              className="relative flex flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-3 text-center hover:border-slate-600 hover:bg-slate-800/40 transition-colors min-h-[72px]"
            >
              <Icon className="w-5 h-5 text-slate-300" />
              <span className="text-xs font-medium text-slate-200 leading-tight">{a.label}</span>
              {!!a.count && a.count > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white grid place-items-center tabular-nums">
                  {a.count > 99 ? "99+" : a.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
