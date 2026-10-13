import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { UserPlus, ClipboardCheck, Wallet, Flag, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What members did, newest first: sign-ups, task submissions, withdrawal
 * requests, reports and disputes. The admin audit log (what STAFF did) stays in
 * its own feed beside this one — mixing them buried member activity under
 * every setting change.
 */

export type PlatformEventKind = "signup" | "submission" | "withdrawal" | "report" | "dispute";

export interface PlatformEvent {
  id: string;
  kind: PlatformEventKind;
  title: string;
  detail?: string;
  at: Date;
  href: string;
}

const KIND: Record<PlatformEventKind, { icon: typeof Flag; tint: string; label: string }> = {
  signup: { icon: UserPlus, tint: "text-blue-400 bg-blue-500/10", label: "Sign-up" },
  submission: { icon: ClipboardCheck, tint: "text-purple-400 bg-purple-500/10", label: "Submission" },
  withdrawal: { icon: Wallet, tint: "text-emerald-400 bg-emerald-500/10", label: "Withdrawal" },
  report: { icon: Flag, tint: "text-red-400 bg-red-500/10", label: "Report" },
  dispute: { icon: Scale, tint: "text-pink-400 bg-pink-500/10", label: "Dispute" },
};

export function PlatformActivityFeed({ events }: { events: PlatformEvent[] }) {
  return (
    <section className="bg-slate-900 rounded-xl border border-slate-800 p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Member activity</h3>
        <span className="text-xs text-slate-500">sign-ups · submissions · withdrawals · reports</span>
      </div>
      {events.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-sm">No recent member activity</div>
      ) : (
        <ul className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
          {events.map((e) => {
            const k = KIND[e.kind];
            const Icon = k.icon;
            return (
              <li key={`${e.kind}-${e.id}`}>
                <Link href={e.href} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-800/40 transition-colors">
                  <span className={cn("p-1.5 rounded-lg shrink-0 mt-0.5", k.tint)}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-white truncate">{e.title}</span>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap shrink-0">
                        {formatDistanceToNow(e.at, { addSuffix: true })}
                      </span>
                    </span>
                    <span className="block text-xs text-slate-400 truncate">
                      {k.label}
                      {e.detail ? ` · ${e.detail}` : ""}
                    </span>
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
