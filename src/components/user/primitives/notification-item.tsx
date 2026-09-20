"use client";

import { cn } from "@/lib/utils";
import {
  Bell,
  Coins,
  Trophy,
  Users,
  AlertCircle,
  Sparkles,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export type NotificationType =
  | "TASK"
  | "REWARD"
  | "REFERRAL"
  | "SYSTEM"
  | "PROMOTION"
  | "FINANCE"
  | "SOCIAL"
  | "ACHIEVEMENT";

interface NotificationItemProps {
  type: NotificationType;
  title: string;
  body?: string;
  createdAt: Date | string;
  isRead?: boolean;
  amount?: { value: number; unit: "pts" | "USD" };
  onClick?: () => void;
  onMarkRead?: () => void;
  onDelete?: () => void;
  className?: string;
}

const TYPE_META: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  TASK: { icon: Bell, tone: "bg-(--app-cta)/10 text-(--app-accent-ink)" },
  REWARD: { icon: Coins, tone: "bg-amber-500/10 text-amber-400" },
  REFERRAL: { icon: Users, tone: "bg-purple-500/10 text-purple-400" },
  SYSTEM: { icon: AlertCircle, tone: "bg-(--app-surface-2) text-(--app-ink-2)" },
  PROMOTION: { icon: Sparkles, tone: "bg-pink-500/10 text-pink-400" },
  FINANCE: { icon: ShoppingBag, tone: "bg-emerald-500/10 text-emerald-400" },
  SOCIAL: { icon: Users, tone: "bg-cyan-500/10 text-cyan-400" },
  ACHIEVEMENT: { icon: Trophy, tone: "bg-yellow-500/10 text-yellow-400" },
};

export function NotificationItem({
  type,
  title,
  body,
  createdAt,
  isRead = false,
  amount,
  onClick,
  className,
}: NotificationItemProps) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  const dt = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-colors",
        isRead
          ? "border-(--app-line) bg-(--app-surface) hover:bg-(--app-surface-2)/60"
          : "border-(--app-accent-edge)/30 bg-(--app-cta)/5 hover:bg-(--app-cta)/10",
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
        <div className="flex items-start gap-2">
          <p className="text-sm font-semibold text-white flex-1 leading-tight">
            {title}
          </p>
          {!isRead && (
            <span
              aria-hidden
              className="w-2 h-2 rounded-full bg-(--app-cta) shrink-0 mt-1"
            />
          )}
        </div>
        {body && (
          <p className="text-xs text-(--app-ink-3) mt-0.5 line-clamp-2">{body}</p>
        )}
        <div className="flex items-center justify-between mt-1.5 gap-2">
          <span className="text-[10px] text-(--app-ink-3)">
            {formatDistanceToNow(dt, { addSuffix: true })}
          </span>
          {amount && (
            <span className="text-xs font-bold text-amber-400 tabular-nums">
              +{amount.value.toLocaleString()}
              {amount.unit === "pts" ? " pts" : "$"}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
