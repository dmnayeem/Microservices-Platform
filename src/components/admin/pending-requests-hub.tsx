import Link from "next/link";
import {
  Inbox,
  ChevronRight,
  ShieldCheck,
  FileWarning,
  Wallet,
  ArrowDownToLine,
  Gift,
  ClipboardCheck,
  BadgeCheck,
  UserCog,
  Store,
  Scale,
  GraduationCap,
  Flag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PENDING_GROUP_LABELS,
  type PendingGroup,
  type PendingSource,
} from "@/lib/admin/pending-sources";

const ICONS: Record<string, LucideIcon> = {
  ShieldCheck,
  FileWarning,
  Wallet,
  ArrowDownToLine,
  Gift,
  ClipboardCheck,
  BadgeCheck,
  UserCog,
  Store,
  Scale,
  GraduationCap,
  Flag,
};

// tone → {icon box, count chip} classes (matches the StatCard tone vocabulary).
const TONE: Record<string, { box: string; chip: string }> = {
  blue: { box: "bg-blue-500/10 text-blue-400", chip: "bg-blue-500/15 text-blue-300" },
  indigo: { box: "bg-indigo-500/10 text-indigo-400", chip: "bg-indigo-500/15 text-indigo-300" },
  purple: { box: "bg-purple-500/10 text-purple-400", chip: "bg-purple-500/15 text-purple-300" },
  green: { box: "bg-emerald-500/10 text-emerald-400", chip: "bg-emerald-500/15 text-emerald-300" },
  amber: { box: "bg-amber-500/10 text-amber-400", chip: "bg-amber-500/15 text-amber-300" },
  orange: { box: "bg-orange-500/10 text-orange-400", chip: "bg-orange-500/15 text-orange-300" },
  pink: { box: "bg-pink-500/10 text-pink-400", chip: "bg-pink-500/15 text-pink-300" },
  red: { box: "bg-red-500/10 text-red-400", chip: "bg-red-500/15 text-red-300" },
  slate: { box: "bg-slate-500/10 text-slate-400", chip: "bg-slate-500/15 text-slate-300" },
};

function fmt(n: number): string {
  return n > 999 ? "999+" : n.toLocaleString();
}

/**
 * Dashboard "Pending Requests" hub — every reviewable request/application the
 * admin may see, grouped, with live counts and deep links. Fed by
 * getPendingSources() so it always matches the sidebar badges.
 */
export function PendingRequestsHub({ sources }: { sources: PendingSource[] }) {
  if (sources.length === 0) return null;

  const total = sources.reduce((sum, s) => sum + s.count, 0);

  // Preserve registry order while grouping.
  const groups: { group: PendingGroup; items: PendingSource[] }[] = [];
  for (const s of sources) {
    let g = groups.find((x) => x.group === s.group);
    if (!g) {
      g = { group: s.group, items: [] };
      groups.push(g);
    }
    g.items.push(s);
  }

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 grid place-items-center">
            <Inbox className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white leading-tight">Pending Requests</h2>
            <p className="text-[11px] text-slate-500">Everything waiting on your review</p>
          </div>
        </div>
        <span
          className={cn(
            "px-2.5 py-1 rounded-full text-xs font-bold tabular-nums",
            total > 0 ? "bg-indigo-500/15 text-indigo-300" : "bg-slate-700/40 text-slate-400"
          )}
        >
          {total > 0 ? `${fmt(total)} pending` : "All clear"}
        </span>
      </div>

      <div className="space-y-4">
        {groups.map(({ group, items }) => (
          <div key={group}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 px-0.5">
              {PENDING_GROUP_LABELS[group]}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {items.map((s) => {
                const Icon = ICONS[s.icon] ?? Inbox;
                const tone = TONE[s.tone] ?? TONE.slate;
                const active = s.count > 0;
                return (
                  <Link
                    key={s.key}
                    href={s.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg border p-3 transition-colors",
                      active
                        ? "border-slate-700 bg-slate-800/40 hover:bg-slate-800/70"
                        : "border-slate-800/70 bg-slate-900/40 hover:bg-slate-800/40 opacity-70 hover:opacity-100"
                    )}
                  >
                    <div className={cn("w-9 h-9 rounded-lg grid place-items-center shrink-0", tone.box)}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <span className="flex-1 min-w-0 text-sm font-medium text-white truncate">
                      {s.label}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-bold tabular-nums shrink-0",
                        active ? tone.chip : "bg-slate-700/40 text-slate-500"
                      )}
                    >
                      {fmt(s.count)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
