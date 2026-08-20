import { cn, formatCompact } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  /** Secondary part of the value, rendered smaller — e.g. "/300" in "255/300". */
  sub?: string;
  /** Trailing unit, rendered smaller — e.g. "XP", "pts". */
  unit?: string;
  /** Force compact notation (1.2K / 1.2M) regardless of magnitude. */
  compact?: boolean;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "blue" | "purple" | "amber" | "green" | "slate" | "pink";
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  blue: "bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20",
  purple: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20",
  amber: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
  green: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  pink: "bg-pink-500/10 text-pink-400 ring-1 ring-pink-500/20",
  slate: "bg-gray-700/40 text-gray-300 ring-1 ring-gray-700",
};

/**
 * The shared recipe for a stat value: clamp the type scale (with a legible 16px
 * floor) instead of ellipsing it, so a long number shrinks rather than becoming
 * "255/3…". Exported so the tiles that can't use `StatCard` verbatim — the glass
 * variants in the profile and analytics panels, the tinted ones in the earn hub,
 * referrals and the seller dashboard, and the balance hero — still share ONE
 * definition. Change it here, every tile follows.
 */
export const STAT_VALUE_CLASS =
  "font-extrabold text-white tabular-nums tracking-tight leading-tight whitespace-nowrap text-[clamp(1rem,4.6vw,1.25rem)]";

/** Same, for the denser tiles that sit 3-up or inside a nested grid. */
export const STAT_VALUE_CLASS_SM =
  "font-bold text-white tabular-nums tracking-tight leading-tight whitespace-nowrap text-[clamp(0.9rem,4.2vw,1.125rem)]";

/** Labels wrap to two lines rather than clipping — "Tasks Com…" reads as broken. */
export const STAT_LABEL_CLASS =
  "text-xs font-medium text-gray-400 leading-tight line-clamp-2";

/**
 * The one stat tile for user surfaces.
 *
 * Sizing matters here: in a 2-up grid on a 360px phone the text column is only
 * ~74px, so the old `text-xl … truncate` clipped "255/300 XP" to "255/3…" and
 * "Tasks Completed" to "Tasks Com…". The fix is threefold — trim the chrome on
 * small screens, render the denominator and unit at 0.7em, and clamp the type
 * scale with a legible 16px floor instead of ellipsing.
 */
export function StatCard({
  label,
  value,
  sub,
  unit,
  compact,
  hint,
  icon,
  tone = "blue",
  className,
}: StatCardProps) {
  const shown =
    typeof value === "number"
      ? compact || value >= 1_000_000
        ? formatCompact(value)
        : value.toLocaleString()
      : value;

  return (
    <div className={cn("card p-3 sm:p-4", className)}>
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        {icon && (
          <div
            className={cn(
              "grid h-9 w-9 sm:h-10 sm:w-10 place-items-center rounded-xl shrink-0",
              TONE_CLASSES[tone]
            )}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p
            className={STAT_VALUE_CLASS}
            title={`${shown}${sub ?? ""}${unit ? ` ${unit}` : ""}`}
          >
            {shown}
            {sub && (
              <span className="text-[0.7em] font-bold text-gray-400">{sub}</span>
            )}
            {unit && (
              <span className="text-[0.7em] font-bold text-gray-400 ml-0.5">
                {unit}
              </span>
            )}
          </p>
          {/* Wrap rather than ellipsis — a clipped label is unreadable, a
              two-line one is merely taller. */}
          <p className={STAT_LABEL_CLASS}>{label}</p>
          {hint && (
            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{hint}</p>
          )}
        </div>
      </div>
    </div>
  );
}
