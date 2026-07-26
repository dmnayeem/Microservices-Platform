"use client";

import { cn } from "@/lib/utils";
import { Clock, Coins, Lock, Check, Sparkles, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { SmartImage } from "./smart-image";

export type TaskStatus =
  | "AVAILABLE"
  | "LOCKED"
  | "COMPLETED"
  | "COOLDOWN"
  | "PENDING"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "REVISION"
  | "REJECTED";
export type TaskDifficulty = "EASY" | "MEDIUM" | "HARD";

interface TaskCardProps {
  title: string;
  description?: string;
  type?: string;
  reward: number;
  xpReward?: number;
  status?: TaskStatus;
  difficulty?: TaskDifficulty;
  durationMin?: number;
  cooldownText?: string;
  requiredLevel?: number;
  icon?: ReactNode;
  thumbnail?: string;
  onAction?: () => void;
  actionLabel?: string;
  href?: string;
  className?: string;
}

const DIFFICULTY_TONE: Record<TaskDifficulty, string> = {
  EASY: "bg-emerald-500/10 text-emerald-400",
  MEDIUM: "bg-amber-500/10 text-amber-400",
  HARD: "bg-red-500/10 text-red-400",
};

const STATUS_TONE: Record<TaskStatus, string> = {
  AVAILABLE: "bg-indigo-500 hover:bg-indigo-600 text-white",
  LOCKED: "bg-gray-800 text-gray-500 cursor-not-allowed",
  COMPLETED: "bg-emerald-500/15 text-emerald-400 cursor-default",
  COOLDOWN: "bg-gray-800 text-gray-500 cursor-not-allowed",
  PENDING: "bg-amber-500/15 text-amber-400 cursor-default",
  IN_PROGRESS: "bg-indigo-500 hover:bg-indigo-600 text-white",
  SUBMITTED: "bg-amber-500/15 text-amber-400",
  REVISION: "bg-orange-500 hover:bg-orange-600 text-white",
  REJECTED: "bg-red-500/15 text-red-400 hover:bg-red-500/25",
};

export function TaskCard({
  title,
  description,
  type,
  reward,
  xpReward,
  status = "AVAILABLE",
  difficulty,
  durationMin,
  cooldownText,
  requiredLevel,
  icon,
  thumbnail,
  onAction,
  actionLabel,
  href,
  className,
}: TaskCardProps) {
  const isLocked = status === "LOCKED";
  const isDone = status === "COMPLETED";
  const onCooldown = status === "COOLDOWN";
  const label =
    actionLabel ??
    (isLocked
      ? `Lvl ${requiredLevel ?? "?"}`
      : isDone
      ? "Done"
      : onCooldown
      ? cooldownText ?? "Cooldown"
      : status === "IN_PROGRESS"
      ? "Resume →"
      : status === "SUBMITTED"
      ? "Pending review"
      : status === "PENDING"
      ? "Pending"
      : status === "REVISION"
      ? "Revise →"
      : status === "REJECTED"
      ? "Rejected"
      : "Start →");

  const navigable =
    status === "AVAILABLE" ||
    status === "IN_PROGRESS" ||
    status === "SUBMITTED" ||
    status === "REVISION" ||
    status === "REJECTED";
  const ActionTag: "a" | "button" = href && navigable ? "a" : "button";

  return (
    <div
      className={cn(
        "group card card-interactive p-4",
        isLocked && "opacity-60",
        className
      )}
    >
      <div className="flex gap-3">
        {(thumbnail || icon) && (
          <div className="shrink-0">
            {thumbnail ? (
              <SmartImage
                src={thumbnail}
                alt=""
                width={56}
                height={56}
                className="w-14 h-14 rounded-lg object-cover bg-gray-800"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                {icon}
              </div>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-white truncate flex-1">
              {title}
            </h3>
            {isDone && (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
          </div>
          {description && (
            <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">
              {description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {type && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-800 text-gray-400 uppercase">
                {type}
              </span>
            )}
            {difficulty && (
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium uppercase",
                  DIFFICULTY_TONE[difficulty]
                )}
              >
                {difficulty}
              </span>
            )}
            {durationMin !== undefined && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
                <Clock className="w-3 h-3" />
                {durationMin}m
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1 text-amber-400 text-sm font-bold tabular-nums">
            <Coins className="w-3.5 h-3.5" />+{reward}
          </span>
          {xpReward !== undefined && xpReward > 0 && (
            <span className="inline-flex items-center gap-0.5 text-purple-400 text-xs font-medium tabular-nums">
              <Sparkles className="w-3 h-3" />+{xpReward} XP
            </span>
          )}
        </div>
        <ActionTag
          {...(ActionTag === "a"
            ? { href }
            : { onClick: onAction, disabled: isLocked || isDone || onCooldown })}
          className={cn(
            "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
            STATUS_TONE[status]
          )}
        >
          {isLocked && <Lock className="w-3 h-3" />}
          {status === "AVAILABLE" && <Zap className="w-3 h-3" />}
          {label}
        </ActionTag>
      </div>
    </div>
  );
}
