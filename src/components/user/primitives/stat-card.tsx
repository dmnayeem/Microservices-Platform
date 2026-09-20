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

/**
 * The `tone` prop names a colour, and 40-odd call sites pick one per tile, so a
 * four-tile row was reliably four hues — blue, purple, amber, green — none of
 * which meant anything beyond "this is the second tile". That is the single
 * biggest source of the rainbow, because this component is everywhere.
 *
 * The prop stays (renaming it would touch every caller for no visual gain) but
 * it now resolves to only what is genuinely semantic. `green` is money in and
 * `amber` is attention, so those keep a colour, drawn from the four app
 * tokens. Everything else is the neutral icon tile: a stat's meaning is in its
 * number and its label, not in the hue of a 20px glyph.
 */
const TONE_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  blue: "app-icon",
  purple: "app-icon",
  pink: "app-icon",
  slate: "app-icon",
  green: "app-icon bg-(--app-in-soft) border-(--app-in-line) text-(--app-in)",
  amber: "app-icon bg-(--app-warn-soft) border-(--app-warn-line) text-(--app-warn)",
};

/**
 * The shared recipe for a stat value: clamp the type scale (with a legible 16px
 * floor) instead of ellipsing it, so a long number shrinks rather than becoming
 * "255/3…". Exported so the tiles that can't use `StatCard` verbatim — the glass
 * variants in the profile and analytics panels, the tinted ones in the earn hub,
 * referrals and the seller dashboard, and the balance hero — still share ONE
 * definition. Change it here, every tile follows.
 */
export const STAT_VALUE_CLASS = "t-figure-sm text-white whitespace-nowrap";

/** Same, for the denser tiles that sit 3-up or inside a nested grid. */
export const STAT_VALUE_CLASS_SM =
  "font-bold text-white tabular-nums tracking-tight leading-tight whitespace-nowrap text-[clamp(0.9rem,4.2vw,1.125rem)]";

/** Labels wrap to two lines rather than clipping — "Tasks Com…" reads as broken. */
export const STAT_LABEL_CLASS = "t-meta text-(--app-ink-3) line-clamp-2";

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
    <div className={cn("app-card", className)}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && <div className={TONE_CLASSES[tone]}>{icon}</div>}
        <div className="min-w-0 flex-1">
          <p
            className={STAT_VALUE_CLASS}
            title={`${shown}${sub ?? ""}${unit ? ` ${unit}` : ""}`}
          >
            {shown}
            {sub && (
              <span className="text-[0.7em] font-bold text-(--app-ink-3)">{sub}</span>
            )}
            {unit && (
              <span className="text-[0.7em] font-bold text-(--app-ink-3) ml-0.5">
                {unit}
              </span>
            )}
          </p>
          {/* Wrap rather than ellipsis — a clipped label is unreadable, a
              two-line one is merely taller. */}
          <p className={STAT_LABEL_CLASS}>{label}</p>
          {hint && (
            <p className="text-[11px] text-(--app-ink-3) mt-0.5 line-clamp-1">{hint}</p>
          )}
        </div>
      </div>
    </div>
  );
}
