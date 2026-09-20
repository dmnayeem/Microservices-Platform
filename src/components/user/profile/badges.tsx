import Link from "next/link";
import { Crown, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export const PACKAGE_TIER_STYLES: Record<
  string,
  { gradient: string; border: string; ring: string; text: string; label: string }
> = {
  FREE: {
    gradient: "from-slate-700 to-slate-600",
    border: "border-(--app-line)/40",
    ring: "ring-(--app-ink-3)/20",
    text: "text-(--app-ink)",
    label: "Free",
  },
  STARTER: {
    gradient: "from-blue-600 to-cyan-500",
    border: "border-blue-400/40",
    ring: "ring-blue-400/30",
    text: "text-blue-50",
    label: "Starter",
  },
  PRO: {
    gradient: "from-purple-500 to-pink-500",
    border: "border-purple-400/40",
    ring: "ring-purple-400/30",
    text: "text-purple-50",
    label: "Pro",
  },
  ELITE: {
    gradient: "from-amber-500 to-orange-500",
    border: "border-amber-400/40",
    ring: "ring-amber-400/30",
    text: "text-amber-50",
    label: "Elite",
  },
  VIP: {
    gradient: "from-emerald-500 to-teal-500",
    border: "border-emerald-400/40",
    ring: "ring-emerald-400/30",
    text: "text-emerald-50",
    label: "VIP",
  },
};

export function PackageBadge({
  tier,
  name,
  href,
  size = "md",
}: {
  tier: string;
  name?: string;
  href?: string;
  size?: "sm" | "md";
}) {
  const style =
    PACKAGE_TIER_STYLES[tier?.toUpperCase()] ?? PACKAGE_TIER_STYLES.FREE;
  const sizing =
    size === "sm"
      ? "px-2 py-0.5 text-[10px]"
      : "px-3 py-1.5 text-xs";

  const inner = (
    <>
      <Crown className={cn(size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5", style.text)} />
      <span className={cn("font-extrabold uppercase tracking-wider", style.text)}>
        {style.label}
      </span>
      {size !== "sm" && (
        <span className={cn("text-[10px] font-semibold opacity-80", style.text)}>
          Member
        </span>
      )}
    </>
  );

  const className = cn(
    "inline-flex items-center gap-1.5 rounded-full bg-linear-to-r border ring-2 shadow-lg",
    sizing,
    style.gradient,
    style.border,
    style.ring,
    href && "group transition-all hover:scale-[1.02]"
  );

  if (href) {
    return (
      <Link
        href={href}
        className={className}
        title={name ? `${name} — Upgrade for more perks` : style.label}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className={className} title={name || style.label}>
      {inner}
    </div>
  );
}

export function LevelBadge({
  level,
  xp,
  xpNeeded,
  xpProgress,
  xpPercentage,
}: {
  level: number;
  xp: number;
  xpNeeded: number;
  xpProgress: number;
  xpPercentage: number;
}) {
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-(--app-cta)/10 border border-(--app-accent-edge)/30 ring-1 ring-(--app-accent-edge)/20"
      title={`${xp.toLocaleString()} XP — ${xpProgress}/${xpNeeded} to next level`}
    >
      <div className="relative w-5 h-5 shrink-0">
        <svg className="w-5 h-5 -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18"
            cy="18"
            r="15"
            className="fill-none stroke-(--app-line-strong)"
            strokeWidth="4"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            className="fill-none stroke-(--app-accent-edge) transition-[stroke-dashoffset]"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={Math.PI * 30}
            strokeDashoffset={Math.PI * 30 * (1 - xpPercentage / 100)}
          />
        </svg>
      </div>
      <span className="text-xs font-extrabold text-(--app-accent-ink) uppercase tracking-wider">
        Lv {level}
      </span>
      <span className="text-[10px] font-semibold text-(--app-accent-ink)/80 tabular-nums">
        {xpPercentage}%
      </span>
    </div>
  );
}

export function RankBadge({ rank }: { rank: number }) {
  if (!rank || rank <= 0) return null;
  const tone =
    rank <= 10
      ? "from-amber-500/20 to-yellow-500/20 border-amber-400/40 text-amber-300"
      : rank <= 100
      ? "from-purple-500/15 to-pink-500/15 border-purple-400/30 text-purple-200"
      : "from-slate-700/40 to-slate-600/40 border-(--app-line)/30 text-(--app-ink)";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-linear-to-r border ring-1 ring-white/5",
        tone
      )}
    >
      <Trophy className="w-3.5 h-3.5" />
      <span className="text-xs font-extrabold tabular-nums">
        #{rank.toLocaleString()}
      </span>
      <span className="text-[10px] font-semibold opacity-80">Rank</span>
    </div>
  );
}
