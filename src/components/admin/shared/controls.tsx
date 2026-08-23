"use client";

import { cn } from "@/lib/utils";

/**
 * Admin-wide form primitives.
 *
 * `Toggle` and `Section` were file-locals in system-settings-form.tsx. They are
 * here because more than one settings screen needs them and a second hand-copy
 * is how two switches that should look identical stop looking identical.
 *
 * They deliberately do NOT live in admin/landing/_shared.tsx: that file is the
 * landing-page editor's toolkit, and a path saying "landing" is a bad home for
 * something the whole admin imports.
 */

/** A titled, bordered group of related controls. */
export function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-800 bg-slate-950/30 p-4 space-y-3",
        className
      )}
    >
      <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">
        {title}
      </p>
      {children}
    </div>
  );
}

export type ToggleTone = "blue" | "amber" | "red" | "purple" | "emerald";

/**
 * A labelled on/off switch.
 *
 * Two mechanisms drive the visuals and both must stay: the track colour comes
 * from `peer-checked:` (the input is `.peer`, the track is its sibling) while
 * the knob is moved by the React `checked` prop. Drop either and the switch
 * half-animates.
 */
export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
  tone = "blue",
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  tone?: ToggleTone;
}) {
  const toneCls = {
    blue: "peer-checked:bg-blue-500",
    amber: "peer-checked:bg-amber-500",
    red: "peer-checked:bg-red-500",
    purple: "peer-checked:bg-purple-500",
    emerald: "peer-checked:bg-emerald-500",
  }[tone];
  const borderCls = {
    blue: "border-slate-700",
    amber: "border-amber-500/20",
    red: "border-red-500/20",
    purple: "border-purple-500/30",
    emerald: "border-emerald-500/30",
  }[tone];
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-slate-950/50 border",
        borderCls,
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
      )}
    >
      <div className="min-w-0">
        <p className="text-sm text-white font-medium">{label}</p>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="relative shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <div
          className={cn(
            "w-11 h-6 bg-slate-700 rounded-full transition-colors",
            toneCls
          )}
        >
          <span
            className={cn(
              "block w-5 h-5 bg-white rounded-full transition-transform",
              checked ? "translate-x-5" : "translate-x-0.5",
              "translate-y-0.5"
            )}
          />
        </div>
      </div>
    </label>
  );
}
