"use client";

import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One step of a task, the same shape on every task type.
 *
 * Task pages had grown into a single column of same-weight boxes — about,
 * instructions, recipe, verification rules, proof — with nothing saying which
 * came first or where one thing ended and the next began. On a long social task
 * that is several thousand pixels of undifferentiated panels, and a user
 * scrolling it cannot tell what they are supposed to DO.
 *
 * So every surface now numbers its steps the same way: a big serial in the
 * gutter, a title, and the body indented under it. The number is the anchor —
 * "I'm on 2 of 4" is answerable at a glance, on a phone, mid-scroll.
 *
 * The rail down the left is what makes it read as a sequence rather than as a
 * stack of unrelated cards, and it is drawn per-step rather than by the list so
 * a step can be inserted anywhere without the line breaking.
 */
export function TaskStep({
  index,
  title,
  hint,
  /** Right-hand slot: points, a status pill, a small action. */
  aside,
  state = "todo",
  /** Why this step is locked. Shown instead of the body when state is "locked". */
  lockedNote,
  last = false,
  children,
}: {
  index: number;
  title: string;
  hint?: string;
  aside?: React.ReactNode;
  state?: "todo" | "done" | "locked";
  lockedNote?: string;
  last?: boolean;
  children?: React.ReactNode;
}) {
  const done = state === "done";
  const locked = state === "locked";

  return (
    <div className="relative flex gap-3">
      {/* Gutter: the serial, and the rail joining it to the next step. */}
      <div className="flex shrink-0 flex-col items-center">
        <span
          className={cn(
            "grid h-7 w-7 place-items-center rounded-full border text-xs font-bold",
            done
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : locked
                ? "border-(--app-line) bg-(--app-surface) text-(--app-ink-3)"
                : "border-(--app-accent-edge)/40 bg-(--app-cta)/15 text-(--app-accent-ink)"
          )}
        >
          {done ? (
            <Check className="h-4 w-4" />
          ) : locked ? (
            <Lock className="h-3.5 w-3.5" />
          ) : (
            index
          )}
        </span>
        {!last && (
          <span
            className={cn(
              "mt-1 w-px flex-1",
              done ? "bg-emerald-500/25" : "bg-(--app-surface-2)"
            )}
          />
        )}
      </div>

      {/* Body. The bottom padding is what separates steps; a gap on the list
          would break the rail. */}
      <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-5")}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <h3
              className={cn(
                "text-sm font-bold leading-tight",
                locked ? "text-(--app-ink-3)" : "text-white"
              )}
            >
              {title}
            </h3>
            {hint && (
              <p className="mt-0.5 text-xs leading-relaxed text-(--app-ink-3)">
                {hint}
              </p>
            )}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>

        {locked ? (
          lockedNote && (
            <p className="mt-2 text-xs text-(--app-ink-3)">{lockedNote}</p>
          )
        ) : (
          children && <div className="mt-2.5 space-y-2.5">{children}</div>
        )}
      </div>
    </div>
  );
}

/** The container. Only exists so the caller does not have to remember `last`. */
export function TaskStepList({ children }: { children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  return <div className="space-y-0">{items}</div>;
}

/**
 * A collapsible aside — reference material that must be available but must not
 * push the actual work off the screen.
 *
 * Closed by default on purpose. "About this task" and a wall of admin-written
 * instructions were the first two things on every task page, so the first
 * screen was reading rather than doing.
 */
export function TaskAside({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-(--app-line) bg-(--app-surface)/60"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wider text-(--app-ink-3) hover:text-white [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-[10px] font-semibold normal-case tracking-normal text-(--app-ink-3) group-open:hidden">
          Show
        </span>
        <span className="hidden text-[10px] font-semibold normal-case tracking-normal text-(--app-ink-3) group-open:inline">
          Hide
        </span>
      </summary>
      <div className="border-t border-(--app-line) px-4 py-3">{children}</div>
    </details>
  );
}
