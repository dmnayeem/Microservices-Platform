import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type VerifiedBadgeStyle =
  | "BLUE"
  | "GOLD"
  | "RAINBOW"
  | "EMERALD"
  | "PURPLE"
  | "ROSE"
  | "OCEAN";

export const VERIFIED_BADGE_STYLES: Record<
  VerifiedBadgeStyle,
  {
    /** Tailwind classes for the main gradient body. */
    gradient: string;
    /** Tailwind classes for the soft outer glow shown on hover. */
    glow: string;
    /** Display label used in the admin picker. */
    label: string;
  }
> = {
  BLUE: {
    gradient: "bg-linear-to-br from-sky-400 via-sky-500 to-blue-600",
    glow: "bg-sky-400/60",
    label: "Classic Blue",
  },
  GOLD: {
    gradient: "bg-linear-to-br from-yellow-300 via-amber-400 to-orange-500",
    glow: "bg-amber-400/60",
    label: "Gold",
  },
  RAINBOW: {
    gradient:
      "bg-[linear-gradient(135deg,#ff5e62,#ff9966,#ffcc33,#33d17a,#3b82f6,#a855f7,#ec4899)]",
    glow: "bg-fuchsia-400/60",
    label: "Rainbow",
  },
  EMERALD: {
    gradient: "bg-linear-to-br from-emerald-300 via-emerald-500 to-teal-600",
    glow: "bg-emerald-400/60",
    label: "Emerald",
  },
  PURPLE: {
    gradient: "bg-linear-to-br from-fuchsia-400 via-purple-500 to-violet-600",
    glow: "bg-purple-400/60",
    label: "Purple",
  },
  ROSE: {
    gradient: "bg-linear-to-br from-pink-400 via-rose-500 to-red-500",
    glow: "bg-rose-400/60",
    label: "Rose",
  },
  OCEAN: {
    gradient: "bg-linear-to-br from-cyan-300 via-sky-500 to-blue-700",
    glow: "bg-cyan-400/60",
    label: "Ocean",
  },
};

const SIZES = {
  sm: { box: "w-4 h-4", check: "w-2.5 h-2.5", stroke: 3.5 },
  md: { box: "w-5 h-5", check: "w-3 h-3", stroke: 3.5 },
  lg: { box: "w-7 h-7", check: "w-4 h-4", stroke: 3 },
} as const;

/** A KYC-verified tick — modern glossy gradient design with optional preset
 *  colours and a pop-up "Verified" tooltip on hover. */
export function VerifiedBadge({
  style = "BLUE",
  size = "md",
  tooltip = "Verified",
  className,
}: {
  /** Preset visual style. Defaults to classic blue. */
  style?: VerifiedBadgeStyle | string | null;
  size?: keyof typeof SIZES;
  /** Tooltip text shown on hover. */
  tooltip?: string;
  className?: string;
}) {
  const lookup = style
    ? (VERIFIED_BADGE_STYLES as Record<string, typeof VERIFIED_BADGE_STYLES.BLUE>)[style]
    : undefined;
  const resolved = lookup ?? VERIFIED_BADGE_STYLES.BLUE;
  const sz = SIZES[size];

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center group/vb shrink-0",
        className
      )}
      aria-label={tooltip}
    >
      {/* Soft outer glow — only visible on hover */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-full blur-md opacity-0 group-hover/vb:opacity-70 transition-opacity duration-300 scale-125",
          resolved.glow
        )}
      />

      {/* Badge body */}
      <span
        title={tooltip}
        className={cn(
          "relative rounded-full ring-1 ring-inset ring-white/40 shadow-md flex items-center justify-center transition-transform duration-200 group-hover/vb:scale-110",
          sz.box,
          resolved.gradient
        )}
      >
        {/* Glossy top highlight — adds a 3D feel */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-linear-to-b from-white/45 to-transparent pointer-events-none"
        />
        {/* Subtle bottom inner shadow for depth */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none shadow-[inset_0_-1px_2px_rgba(0,0,0,0.25)]"
        />
        {/* Check icon */}
        <Check
          className={cn("relative z-1 text-white drop-shadow-sm", sz.check)}
          strokeWidth={sz.stroke}
          aria-hidden
        />
      </span>

      {/* Hover tooltip — modern pill with subtle pop animation */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 translate-y-1 opacity-0 group-hover/vb:opacity-100 group-hover/vb:translate-y-0 transition-all duration-200 whitespace-nowrap rounded-lg bg-(--app-page)/95 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 border border-white/10 shadow-xl ring-1 ring-black/20 z-50 inline-flex items-center gap-1"
      >
        <Check className="w-2.5 h-2.5 text-emerald-400" strokeWidth={4} />
        {tooltip}
        <span
          aria-hidden
          className="absolute left-1/2 top-full -translate-x-1/2 w-0 h-0 border-[5px] border-transparent border-t-gray-950/95"
        />
      </span>
    </span>
  );
}
