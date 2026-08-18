import { format } from "date-fns";
import {
  Coins,
  ClipboardCheck,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  UserPlus,
  ShieldAlert,
  Activity,
} from "lucide-react";
import type { ActivityEvent, ActivityKind } from "@/lib/user-activity";

const KIND_META: Record<
  ActivityKind,
  { icon: typeof Coins; tone: string; ring: string }
> = {
  transaction: { icon: Coins, tone: "text-amber-400", ring: "bg-amber-500/10 ring-amber-500/20" },
  task: { icon: ClipboardCheck, tone: "text-indigo-400", ring: "bg-indigo-500/10 ring-indigo-500/20" },
  withdrawal: { icon: ArrowUpRight, tone: "text-red-400", ring: "bg-red-500/10 ring-red-500/20" },
  deposit: { icon: ArrowDownLeft, tone: "text-emerald-400", ring: "bg-emerald-500/10 ring-emerald-500/20" },
  kyc: { icon: ShieldCheck, tone: "text-blue-400", ring: "bg-blue-500/10 ring-blue-500/20" },
  referral: { icon: UserPlus, tone: "text-pink-400", ring: "bg-pink-500/10 ring-pink-500/20" },
  admin: { icon: ShieldAlert, tone: "text-purple-400", ring: "bg-purple-500/10 ring-purple-500/20" },
};

export function UserActivityTimeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="py-16 text-center">
        <Activity className="w-12 h-12 mx-auto mb-4 text-gray-600" />
        <h3 className="text-lg font-medium text-white mb-1">No activity yet</h3>
        <p className="text-gray-400 text-sm">This user has no recorded activity.</p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-1">
      {events.map((e, i) => {
        const meta = KIND_META[e.kind] ?? KIND_META.transaction;
        const Icon = meta.icon;
        const last = i === events.length - 1;
        return (
          <li key={e.id} className="relative flex gap-3 pb-4">
            {/* rail */}
            {!last && (
              <span className="absolute left-[15px] top-8 bottom-0 w-px bg-gray-800" aria-hidden />
            )}
            <span className={`relative z-10 mt-0.5 w-8 h-8 rounded-full grid place-items-center ring-1 shrink-0 ${meta.ring}`}>
              <Icon className={`w-4 h-4 ${meta.tone}`} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{e.title}</p>
                  {e.detail && (
                    <p className="text-xs text-gray-400 truncate">
                      {e.detail}
                      {e.actorName && <span className="text-purple-300"> · by {e.actorName}</span>}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {typeof e.points === "number" && e.points !== 0 && (
                    <p className={`text-sm font-bold tabular-nums ${e.points > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {e.points > 0 ? "+" : ""}{e.points.toLocaleString()} pts
                    </p>
                  )}
                  {typeof e.amount === "number" && e.amount !== 0 && (
                    <p className={`text-xs font-semibold tabular-nums ${e.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {e.amount > 0 ? "+" : "-"}${Math.abs(e.amount).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-gray-600 mt-0.5">
                {format(new Date(e.at), "MMM d, yyyy · h:mm a")}
                {e.status && <span className="ml-2 text-gray-500">{e.status}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
