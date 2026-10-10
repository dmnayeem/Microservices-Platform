import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type VerifiedBadgeStyle =
  | "BLUE"
  | "GOLD"
  | "RAINBOW"
  | "EMERALD"
  | "PURPLE"
  | "ROSE"
  | "OCEAN"
  // Animated (paid, 2026-10-05) — effects live in globals.css (.vb-fx-*).
  | "BLUE_FLAME"
  | "FIRE"
  | "AURORA"
  | "NEON"
  | "GALAXY"
  | "GOLD_SHIMMER"
  | "ICE"
  | "PLASMA"
  // More animated styles (2026-10-11).
  | "LIGHTNING"
  | "PHOENIX"
  | "EMERALD_FLAME"
  | "SHADOW_FLAME"
  | "SUNBURST"
  | "ORBIT"
  | "PULSE_WAVE"
  | "SAKURA"
  | "HOLOGRAM"
  | "RGB"
  | "DIAMOND"
  | "HEARTBEAT";

export const VERIFIED_BADGE_STYLES: Record<
  VerifiedBadgeStyle,
  {
    /** Tailwind classes for the main gradient body. */
    gradient: string;
    /** Tailwind classes for the soft outer glow shown on hover. */
    glow: string;
    /** Display label used in the admin picker. */
    label: string;
    /** Animated effect behind the badge (`.vb-fx-<fx>` in globals.css). */
    fx?:
      | "flame"
      | "fire"
      | "aurora"
      | "neon"
      | "galaxy"
      | "ice"
      | "plasma"
      | "lightning"
      | "phoenix"
      | "emeraldflame"
      | "shadowflame"
      | "sunburst"
      | "orbit"
      | "pulsewave"
      | "sakura"
      | "hologram"
      | "rgb"
      | "diamond"
      | "heartbeat";
    /** Effect on the badge body itself. */
    bodyFx?: "shine" | "plasma" | "hue" | "beat";
    /** Matching ring around the profile photo (a CSS background). */
    ring?: string;
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
    gradient: "bg-linear-to-br from-fuchsia-400 via-purple-500 to-purple-700",
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
  BLUE_FLAME: {
    gradient: "bg-linear-to-br from-sky-300 via-sky-500 to-blue-700",
    glow: "bg-sky-400/70",
    label: "Blue Flame",
    fx: "flame",
    ring: "conic-gradient(#38bdf8, #1d4ed8, #67e8f9, #38bdf8)",
  },
  FIRE: {
    gradient: "bg-linear-to-br from-yellow-300 via-orange-500 to-red-600",
    glow: "bg-orange-400/70",
    label: "Fire",
    fx: "fire",
    ring: "conic-gradient(#fde047, #f97316, #dc2626, #fde047)",
  },
  AURORA: {
    gradient: "bg-linear-to-br from-teal-300 via-sky-500 to-violet-600",
    glow: "bg-teal-300/70",
    label: "Aurora",
    fx: "aurora",
    ring: "conic-gradient(#22d3ee, #a78bfa, #34d399, #f472b6, #22d3ee)",
  },
  NEON: {
    gradient: "bg-linear-to-br from-fuchsia-400 via-pink-500 to-cyan-400",
    glow: "bg-fuchsia-400/70",
    label: "Neon",
    fx: "neon",
    ring: "conic-gradient(#f0abfc, #22d3ee, #f0abfc)",
  },
  GALAXY: {
    gradient: "bg-linear-to-br from-indigo-500 via-violet-600 to-fuchsia-600",
    glow: "bg-violet-500/70",
    label: "Galaxy",
    fx: "galaxy",
    ring: "conic-gradient(#312e81, #7c3aed, #ec4899, #312e81)",
  },
  GOLD_SHIMMER: {
    gradient: "bg-linear-to-br from-yellow-200 via-amber-400 to-yellow-600",
    glow: "bg-amber-300/70",
    label: "Gold Shimmer",
    bodyFx: "shine",
    ring: "conic-gradient(#fde68a, #f59e0b, #fef3c7, #fde68a)",
  },
  ICE: {
    gradient: "bg-linear-to-br from-cyan-200 via-sky-400 to-blue-500",
    glow: "bg-cyan-200/70",
    label: "Ice",
    fx: "ice",
    ring: "conic-gradient(#e0f2fe, #7dd3fc, #ffffff, #e0f2fe)",
  },
  PLASMA: {
    gradient: "bg-[linear-gradient(135deg,#7c3aed,#06b6d4,#ec4899,#7c3aed)]",
    glow: "bg-violet-400/70",
    label: "Plasma",
    fx: "plasma",
    bodyFx: "plasma",
    ring: "conic-gradient(#7c3aed, #06b6d4, #ec4899, #7c3aed)",
  },
  LIGHTNING: {
    gradient: "bg-linear-to-br from-yellow-200 via-amber-400 to-sky-500",
    glow: "bg-yellow-300/80",
    label: "Lightning",
    fx: "lightning",
    bodyFx: "shine",
    ring: "conic-gradient(#fde047, #38bdf8, #ffffff, #fde047)",
  },
  PHOENIX: {
    gradient: "bg-linear-to-br from-amber-300 via-rose-500 to-fuchsia-700",
    glow: "bg-rose-400/80",
    label: "Phoenix",
    fx: "phoenix",
    ring: "conic-gradient(#fbbf24, #f43f5e, #c026d3, #fbbf24)",
  },
  EMERALD_FLAME: {
    gradient: "bg-linear-to-br from-lime-300 via-emerald-500 to-teal-700",
    glow: "bg-emerald-400/80",
    label: "Emerald Flame",
    fx: "emeraldflame",
    ring: "conic-gradient(#bef264, #10b981, #0f766e, #bef264)",
  },
  SHADOW_FLAME: {
    gradient: "bg-linear-to-br from-violet-400 via-purple-700 to-slate-900",
    glow: "bg-violet-500/80",
    label: "Shadow Flame",
    fx: "shadowflame",
    ring: "conic-gradient(#a78bfa, #4c1d95, #0f172a, #a78bfa)",
  },
  SUNBURST: {
    gradient: "bg-linear-to-br from-yellow-200 via-orange-400 to-amber-600",
    glow: "bg-amber-300/80",
    label: "Sunburst",
    fx: "sunburst",
    bodyFx: "shine",
    ring: "conic-gradient(#fef08a, #f59e0b, #fef08a, #f97316, #fef08a)",
  },
  ORBIT: {
    gradient: "bg-linear-to-br from-indigo-500 via-violet-600 to-sky-500",
    glow: "bg-indigo-400/80",
    label: "Orbit",
    fx: "orbit",
    ring: "conic-gradient(#0ea5e9, #312e81, #0ea5e9)",
  },
  PULSE_WAVE: {
    gradient: "bg-linear-to-br from-lime-300 via-green-500 to-emerald-700",
    glow: "bg-lime-300/80",
    label: "Pulse Wave",
    fx: "pulsewave",
    ring: "conic-gradient(#a3e635, #22c55e, #a3e635)",
  },
  SAKURA: {
    gradient: "bg-linear-to-br from-pink-200 via-pink-400 to-rose-500",
    glow: "bg-pink-300/80",
    label: "Sakura",
    fx: "sakura",
    ring: "conic-gradient(#fbcfe8, #f472b6, #fff1f2, #fbcfe8)",
  },
  HOLOGRAM: {
    gradient: "bg-[linear-gradient(135deg,#22d3ee,#8b5cf6,#ec4899,#f59e0b,#22d3ee)]",
    glow: "bg-cyan-200/80",
    label: "Hologram",
    fx: "hologram",
    bodyFx: "hue",
    ring: "conic-gradient(#a5f3fc, #c4b5fd, #f9a8d4, #fde68a, #a5f3fc)",
  },
  RGB: {
    gradient: "bg-linear-to-br from-red-500 via-green-500 to-blue-500",
    glow: "bg-red-400/80",
    label: "RGB Gamer",
    fx: "rgb",
    bodyFx: "hue",
    ring: "conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #d946ef, #ef4444)",
  },
  DIAMOND: {
    gradient: "bg-linear-to-br from-cyan-300 via-sky-500 to-indigo-500",
    glow: "bg-white/80",
    label: "Diamond",
    fx: "diamond",
    bodyFx: "shine",
    ring: "conic-gradient(#ffffff, #a5f3fc, #f5d0fe, #ffffff)",
  },
  HEARTBEAT: {
    gradient: "bg-linear-to-br from-rose-400 via-red-600 to-rose-800",
    glow: "bg-red-500/80",
    label: "Heartbeat",
    fx: "heartbeat",
    bodyFx: "beat",
    ring: "conic-gradient(#fb7185, #dc2626, #fb7185)",
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
        resolved.fx && `vb-fx vb-fx-${resolved.fx}`,
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
          "relative z-1 rounded-full ring-1 ring-inset ring-white/40 shadow-md flex items-center justify-center transition-transform duration-200 group-hover/vb:scale-110",
          sz.box,
          resolved.gradient,
          resolved.bodyFx === "shine" && "vb-body-shine overflow-hidden",
          resolved.bodyFx === "plasma" && "vb-body-plasma",
          resolved.bodyFx === "hue" && "vb-body-hue",
          resolved.bodyFx === "beat" && "vb-body-beat"
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
        className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 translate-y-1 opacity-0 group-hover/vb:opacity-100 group-hover/vb:translate-y-0 transition-all duration-200 whitespace-nowrap rounded-lg bg-(--app-page)/95 backdrop-blur-md text-(--app-ink) text-[10px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 border border-(--app-line) shadow-xl ring-1 ring-black/20 z-50 inline-flex items-center gap-1"
      >
        <Check className="w-2.5 h-2.5 text-emerald-400" strokeWidth={4} />
        {tooltip}
        <span
          aria-hidden
          className="absolute left-1/2 top-full -translate-x-1/2 w-0 h-0 border-[5px] border-transparent border-t-(--app-page)/95"
        />
      </span>
    </span>
  );
}

/** The profile-photo ring for a badge style, or undefined for the plain ones. */
export function badgeRingStyle(style: string | null | undefined): React.CSSProperties | undefined {
  const r = style ? (VERIFIED_BADGE_STYLES as Record<string, { ring?: string }>)[style]?.ring : undefined;
  return r ? ({ ["--vb-ring" as string]: r } as React.CSSProperties) : undefined;
}
