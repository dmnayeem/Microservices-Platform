"use client";

import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { openPlanUpsell, type PlanLock } from "@/components/user/tasks/plan-upsell";
import { Clock, Coins, Lock, Check, Zap } from "lucide-react";
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
  /** The admin's per-task device switches (lib/task-device-gate.ts). */
  deviceNeeds?: TaskDeviceNeeds;
  /** Sequential lock / plan lock from the task list (lib/task-list.ts). */
  gate?: TaskGate;
  icon?: ReactNode;
  thumbnail?: string;
  onAction?: () => void;
  actionLabel?: string;
  href?: string;
  className?: string;
}

/* Difficulty is a three-step scale, so green/amber/red is the one place a
   traffic-light reading is genuinely the meaning rather than decoration. It
   draws from the app's own semantic tokens instead of three more raw hues. */
const DIFFICULTY_TONE: Record<TaskDifficulty, string> = {
  EASY: "bg-(--app-in-soft) border-(--app-in-line) text-(--app-in)",
  MEDIUM: "bg-(--app-warn-soft) border-(--app-warn-line) text-(--app-warn)",
  HARD: "bg-(--app-out-soft) border-(--app-out-line) text-(--app-out)",
};

/* The action button. Only the two states that are actually a call to action
   get the gradient; the rest are status, and status is a chip, not a button
   that looks pressable. "Revise" was a SECOND solid fill in a different hue
   (orange) sitting next to indigo ones in the same list. */
const STATUS_TONE: Record<TaskStatus, string> = {
  AVAILABLE: "app-accent",
  IN_PROGRESS: "app-accent",
  REVISION: "app-accent",
  LOCKED: "bg-(--app-surface-2) border border-(--app-line) text-(--app-ink-3) cursor-not-allowed",
  COOLDOWN: "bg-(--app-surface-2) border border-(--app-line) text-(--app-ink-3) cursor-not-allowed",
  COMPLETED:
    "bg-(--app-in-soft) border border-(--app-in-line) text-(--app-in) cursor-default",
  PENDING:
    "bg-(--app-warn-soft) border border-(--app-warn-line) text-(--app-warn) cursor-default",
  SUBMITTED:
    "bg-(--app-warn-soft) border border-(--app-warn-line) text-(--app-warn)",
  REJECTED:
    "bg-(--app-out-soft) border border-(--app-out-line) text-(--app-out)",
};

/** Sequential and plan locks on a task row (lib/task-list.ts), plus its slots. */
export type TaskGate = {
  locked?: boolean | null;
  lockReason?: string | null;
  planLock?: PlanLock | null;
  /** Credited completions so far (Task.completedCount). */
  completedCount?: number | null;
  /** Spots left when the task has a total limit; null = unlimited. */
  remainingSlots?: number | null;
  /** The total limit itself, when the row carries it. */
  totalLimit?: number | null;
};

/**
 * "20 / 100 done" with a bar, or "∞ Unlimited · 20 done" — how many people
 * have done this task, out of how many it takes. Seeing a task fill up is
 * part of why people do it now.
 */
export function SlotsBar({ completed, total }: { completed: number; total: number | null }) {
  if (total && total > 0) {
    const pct = Math.min(100, Math.round((completed / total) * 100));
    const left = Math.max(0, total - completed);
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-bold tabular-nums text-(--app-ink)">
            {completed.toLocaleString()} / {total.toLocaleString()} done
          </span>
          <span className={cn("font-semibold tabular-nums", left <= Math.ceil(total * 0.1) ? "text-amber-300" : "text-(--app-ink-2)")}>
            {left.toLocaleString()} left
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-(--app-surface-2)">
          <div className="h-full rounded-full bg-(image:--app-rail)" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  return (
    <p className="text-[12px] font-semibold text-(--app-ink-2)">
      <span className="text-(--app-accent-ink)">∞ Unlimited</span>
      {completed > 0 ? ` · ${completed.toLocaleString()} done` : ""}
    </p>
  );
}

/** Shape of the two switches on a task row; anything else on it is ignored. */
export type TaskDeviceNeeds = { requireApp?: boolean | null; requirePush?: boolean | null };

/**
 * "📱 App only" / "🔔 Notifications on" — shown on a task card BEFORE the
 * member opens the task, so the requirement is never a surprise. Renders
 * nothing for an ordinary task.
 */
export function TaskDeviceChips({ needs }: { needs?: TaskDeviceNeeds | null }) {
  if (!needs?.requireApp && !needs?.requirePush) return null;
  return (
    <>
      {needs.requireApp && (
        <span className="app-chip" title="Can only be done from the installed RevType app">
          📱 App only
        </span>
      )}
      {needs.requirePush && (
        <span className="app-chip" title="Notifications must be turned on">
          🔔 Notifications on
        </span>
      )}
    </>
  );
}

export function TaskCard({
  title,
  description,
  type,
  reward,
  xpReward,
  status: statusProp = "AVAILABLE",
  difficulty,
  durationMin,
  cooldownText,
  requiredLevel,
  deviceNeeds,
  gate,
  icon,
  thumbnail,
  onAction,
  actionLabel,
  href,
  className,
}: TaskCardProps) {
  // A task above the member's plan is an upgrade offer; a task behind an
  // unfinished one in its category waits. Both draw as locked, and both say
  // why when tapped instead of doing nothing.
  const planLock = gate?.planLock ?? null;
  const chainLocked = !planLock && !!gate?.locked;
  const status: TaskStatus = planLock || chainLocked ? "LOCKED" : statusProp;
  const lockTap = planLock
    ? () => openPlanUpsell(planLock)
    : chainLocked
      ? () =>
          toast.info("This task is locked", {
            description: gate?.lockReason ?? "Complete the task before this one in this category first.",
          })
      : null;
  const isLocked = status === "LOCKED";
  const isDone = status === "COMPLETED";
  const onCooldown = status === "COOLDOWN";
  const label = planLock
    ? `${planLock.name} plan`
    : chainLocked
    ? "Locked"
    : actionLabel ??
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
      className={cn("group app-card app-lift", isLocked && "opacity-60", className)}
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
                className="w-14 h-14 rounded-(--app-r-control) object-cover bg-(--app-surface-2)"
              />
            ) : (
              // Was an indigo-tinted tile on every task in the list, so a
              // 20-task page was 20 indigo squares — and the reward figure
              // beside them was amber, and the XP purple.
              <div className="app-icon app-icon-lg">{icon}</div>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="t-card-title text-white truncate flex-1 min-w-0">
              {title}
            </h3>
            {isDone && (
              <Check className="w-4 h-4 shrink-0 text-(--app-in)" />
            )}
          </div>
          {description && (
            <p className="t-meta text-(--app-ink-3) line-clamp-2 mt-1">
              {description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            {type && <span className="app-chip uppercase">{type}</span>}
            {difficulty && (
              <span className={cn("app-chip uppercase", DIFFICULTY_TONE[difficulty])}>
                {difficulty}
              </span>
            )}
            {durationMin !== undefined && (
              <span className="inline-flex items-center gap-1 t-meta text-(--app-ink-3)">
                <Clock className="w-3.5 h-3.5" />
                {durationMin}m
              </span>
            )}
            {planLock && (
              <span className="app-chip bg-amber-500/15 text-amber-300" title={`Needs the ${planLock.name} plan`}>
                ⭐ {planLock.name}
              </span>
            )}
            <TaskDeviceChips needs={deviceNeeds} />
          </div>
          {typeof gate?.completedCount === "number" && (
            <div className="mt-2.5">
              <SlotsBar
                completed={gate.completedCount}
                total={
                  gate.totalLimit ??
                  (typeof gate.remainingSlots === "number" ? gate.completedCount + gate.remainingSlots : null)
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* The reward is the reason to press the button, so it is the second
          biggest thing on the card after the title — by SIZE. It used to be
          amber 14px next to a purple 12px XP figure and an indigo button:
          three colours, one size, nothing leading. */}
      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-(--app-line)">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="t-figure-sm inline-flex items-baseline gap-1 text-white whitespace-nowrap">
            <Coins className="w-4 h-4 self-center text-(--app-ink-3)" />+{reward}
          </span>
          {xpReward !== undefined && xpReward > 0 && (
            <span className="t-meta font-bold text-(--app-ink-3) tabular-nums whitespace-nowrap">
              +{xpReward} XP
            </span>
          )}
        </div>
        <ActionTag
          {...(ActionTag === "a"
            ? { href }
            : lockTap
              ? { onClick: lockTap, type: "button" as const }
              : { onClick: onAction, disabled: isLocked || isDone || onCooldown })}
          className={cn(
            "app-press app-tap-row shrink-0 inline-flex items-center justify-center gap-1.5 px-3.5 rounded-(--app-r-control) text-xs font-extrabold",
            STATUS_TONE[status]
          )}
        >
          {isLocked && <Lock className="w-3.5 h-3.5" />}
          {status === "AVAILABLE" && <Zap className="w-3.5 h-3.5" />}
          {label}
        </ActionTag>
      </div>
    </div>
  );
}
