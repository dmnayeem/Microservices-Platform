import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  ArrowDownToLine,
  Coins,
  Gift,
  ShoppingBag,
  ShoppingCart,
  Trophy,
  Users,
  Sparkles,
  Handshake,
  GraduationCap,
  MessageSquare,
  ListChecks,
  CalendarCheck,
  Megaphone,
  Repeat,
  Undo2,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { SOURCE_META, type SourceKey } from "@/lib/tx-sources";

export type TxStatus = "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";

const ICONS: Record<string, LucideIcon> = {
  ListChecks, MessageSquare, Users, Handshake, GraduationCap, ShoppingBag,
  ArrowDownToLine, ArrowUpRight, Repeat, Sparkles, Trophy, CalendarCheck,
  Megaphone, ShoppingCart, Undo2, Shield, Coins, Gift,
};

interface TransactionRowProps {
  /** Transaction source — drives icon + color (see tx-sources SOURCE_META). */
  source: SourceKey;
  description: string;
  /** Signed value: positive = inflow (green +), negative = outflow (red −). */
  amount: number;
  unit?: "pts" | "USD";
  status?: TxStatus;
  date: Date | string;
  className?: string;
}

const STATUS_TONE: Record<TxStatus, string> = {
  PENDING: "bg-amber-500/10 text-amber-400",
  COMPLETED: "bg-emerald-500/10 text-emerald-400",
  FAILED: "bg-red-500/10 text-red-400",
  CANCELLED: "bg-gray-700 text-gray-400",
};

export function TransactionRow({
  source,
  description,
  amount,
  unit = "pts",
  status,
  date,
  className,
}: TransactionRowProps) {
  const meta = SOURCE_META[source] ?? SOURCE_META.other;
  const Icon = ICONS[meta.icon] ?? Coins;
  const isOutflow = amount < 0;
  const sign = isOutflow ? "−" : "+";
  const absVal = Math.abs(amount);
  const dt = typeof date === "string" ? new Date(date) : date;

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-3 border-b border-gray-800/60 last:border-b-0",
        className
      )}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
          meta.tone
        )}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{description}</p>
        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-gray-800 text-gray-400 shrink-0">
            {meta.label}
          </span>
          <span className="text-[10px] text-gray-500 truncate" title={format(dt, "PPp")}>
            {formatDistanceToNow(dt, { addSuffix: true })}
          </span>
          {status && status !== "COMPLETED" && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0",
                STATUS_TONE[status]
              )}
            >
              {status}
            </span>
          )}
        </div>
      </div>
      <div
        className={cn(
          "text-sm font-bold tabular-nums shrink-0",
          isOutflow ? "text-red-400" : "text-emerald-400"
        )}
      >
        {sign}
        {unit === "USD" ? "$" : ""}
        {absVal.toLocaleString()}
        {unit === "pts" && <span className="text-[10px] ml-0.5">pts</span>}
      </div>
    </div>
  );
}
