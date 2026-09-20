import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  ArrowDownToLine,
  BadgeDollarSign,
  Coins,
  Receipt,
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
  // `taskfee` and `payroll` name these in SOURCE_META; without them both fell
  // through to the generic Coins fallback.
  Receipt, BadgeDollarSign,
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
  PENDING: "app-chip-warn",
  COMPLETED: "app-chip-in",
  FAILED: "app-chip-out",
  CANCELLED: "",
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
        "flex items-center gap-3 py-3 border-b border-(--app-line) last:border-b-0",
        className
      )}
    >
      {/* `meta.tone` gave every transaction source its own hue, so a ledger of
          twelve rows was a column of twelve different circles. A ledger has
          exactly two meanings worth a colour and they are on the right-hand
          figure: money in, money out. */}
      <div className="app-icon rounded-full">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="t-body font-medium text-white truncate">{description}</p>
        <div className="flex items-center gap-1.5 mt-1 min-w-0">
          <span className="app-chip uppercase shrink-0">{meta.label}</span>
          <span className="t-meta text-(--app-ink-3) truncate" title={format(dt, "PPp")}>
            {formatDistanceToNow(dt, { addSuffix: true })}
          </span>
          {status && status !== "COMPLETED" && (
            <span className={cn("app-chip uppercase shrink-0", STATUS_TONE[status])}>
              {status}
            </span>
          )}
        </div>
      </div>
      {/* The one genuinely semantic colour pair in the product. */}
      <div
        className={cn(
          "t-figure-sm shrink-0",
          isOutflow ? "t-out" : "t-in"
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
