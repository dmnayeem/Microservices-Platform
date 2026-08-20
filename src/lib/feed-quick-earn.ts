import {
  PlayCircle,
  Zap,
  Gamepad2,
  Ticket,
  Layers,
  Coins,
  Gift,
  Trophy,
  Users,
  Wallet,
  Star,
  Sparkles,
  Target,
  Rocket,
  DollarSign,
  ShoppingBag,
  Video,
  Award,
  LayoutDashboard,
  Brain,
  GraduationCap,
  Package,
  Megaphone,
  type LucideIcon,
} from "lucide-react";

/**
 * Admin-editable "Quick Earn" sidebar tiles. Stored in SystemSetting
 * `feed.quick_earn_tiles` and read by the social page. Each tile links to an
 * in-app earn route. Icon + color are stored as keys into the maps below.
 */
export interface QuickEarnTile {
  id: string;
  label: string;
  href: string;
  icon: string; // key into QUICK_EARN_ICONS
  color: string; // key into COLOR_CLASSES
  enabled: boolean;
}

/** Curated icon set the admin can pick from (key → lucide component). */
export const QUICK_EARN_ICONS: Record<string, LucideIcon> = {
  playCircle: PlayCircle,
  zap: Zap,
  gamepad: Gamepad2,
  ticket: Ticket,
  layers: Layers,
  coins: Coins,
  gift: Gift,
  trophy: Trophy,
  users: Users,
  wallet: Wallet,
  star: Star,
  sparkles: Sparkles,
  target: Target,
  rocket: Rocket,
  dollar: DollarSign,
  shopping: ShoppingBag,
  video: Video,
  award: Award,
  layoutDashboard: LayoutDashboard,
  brain: Brain,
  graduation: GraduationCap,
  package: Package,
  megaphone: Megaphone,
};

export const ICON_OPTIONS: { key: string; label: string }[] = [
  { key: "playCircle", label: "Play" },
  { key: "zap", label: "Bolt" },
  { key: "gamepad", label: "Game" },
  { key: "ticket", label: "Ticket" },
  { key: "layers", label: "Layers" },
  { key: "coins", label: "Coins" },
  { key: "gift", label: "Gift" },
  { key: "trophy", label: "Trophy" },
  { key: "users", label: "Users" },
  { key: "wallet", label: "Wallet" },
  { key: "star", label: "Star" },
  { key: "sparkles", label: "Sparkles" },
  { key: "target", label: "Target" },
  { key: "rocket", label: "Rocket" },
  { key: "dollar", label: "Dollar" },
  { key: "shopping", label: "Shopping" },
  { key: "video", label: "Video" },
  { key: "award", label: "Award" },
  { key: "layoutDashboard", label: "Dashboard" },
  { key: "brain", label: "Brain" },
  { key: "graduation", label: "Graduation" },
  { key: "package", label: "Package" },
  { key: "megaphone", label: "Megaphone" },
];

/** Color tone the admin can pick (key → Tailwind text class). */
export const COLOR_CLASSES: Record<string, string> = {
  indigo: "text-indigo-400",
  violet: "text-violet-400",
  rose: "text-rose-400",
  amber: "text-amber-400",
  cyan: "text-cyan-400",
  emerald: "text-emerald-400",
  sky: "text-sky-400",
  purple: "text-purple-400",
  pink: "text-pink-400",
  orange: "text-orange-400",
};

export const COLOR_OPTIONS = Object.keys(COLOR_CLASSES).map((key) => ({
  key,
  label: key.charAt(0).toUpperCase() + key.slice(1),
}));

/** The shipped default tiles (used when no admin config exists). */
export const DEFAULT_QUICK_EARN: QuickEarnTile[] = [
  { id: "qe-dashboard", label: "Dashboard", href: "/dashboard", icon: "layoutDashboard", color: "indigo", enabled: true },
  { id: "qe-mission", label: "Mission", href: "/daily-mission", icon: "target", color: "violet", enabled: true },
  { id: "qe-tasks", label: "Task", href: "/tasks", icon: "zap", color: "sky", enabled: true },
  { id: "qe-leaderboard", label: "Leaderboard", href: "/leaderboard", icon: "trophy", color: "amber", enabled: true },
  { id: "qe-quizzes", label: "Quiz Games", href: "/quizzes", icon: "brain", color: "purple", enabled: true },
  { id: "qe-lottery", label: "Lottery", href: "/lottery", icon: "ticket", color: "rose", enabled: true },
  { id: "qe-referral", label: "My Team", href: "/referrals", icon: "users", color: "emerald", enabled: true },
  { id: "qe-course", label: "Course", href: "/courses", icon: "graduation", color: "cyan", enabled: true },
  { id: "qe-marketplace", label: "Marketplace", href: "/marketplace", icon: "shopping", color: "pink", enabled: true },
  { id: "qe-packages", label: "Packages", href: "/packages", icon: "package", color: "orange", enabled: true },
  { id: "qe-advertiser", label: "Create Ad", href: "/advertiser", icon: "megaphone", color: "indigo", enabled: true },
  { id: "qe-games", label: "Games", href: "/games", icon: "gamepad", color: "violet", enabled: true },
];

/** Coerce stored data into valid tiles; falls back to defaults when empty. */
export function normalizeQuickEarn(raw: unknown): QuickEarnTile[] {
  if (!Array.isArray(raw)) return DEFAULT_QUICK_EARN;
  const out: QuickEarnTile[] = [];
  for (const item of raw) {
    const r = (item ?? {}) as Partial<QuickEarnTile>;
    const label = typeof r.label === "string" ? r.label.trim() : "";
    const href = typeof r.href === "string" ? r.href.trim() : "";
    if (!label || !href) continue;
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : `qe-${out.length}`,
      label,
      href,
      icon: typeof r.icon === "string" && QUICK_EARN_ICONS[r.icon] ? r.icon : "zap",
      color: typeof r.color === "string" && COLOR_CLASSES[r.color] ? r.color : "indigo",
      enabled: r.enabled !== false,
    });
  }
  return out.length ? out : DEFAULT_QUICK_EARN;
}
