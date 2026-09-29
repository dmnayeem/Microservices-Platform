import type { LucideIcon } from "lucide-react";
import { NAV_ICONS, NAV_ICON_OPTIONS } from "@/lib/nav-icons";
import { isNavIconKey } from "@/lib/nav-icon-keys";

/**
 * Admin-editable "Quick Earn" sidebar tiles. Stored in SystemSetting
 * `feed.quick_earn_tiles` and read by the social page. Each tile links to an
 * in-app earn route. Icon + color are stored as keys into the maps below.
 *
 * Edited on Settings -> Navigation (the Quick Earn tab), which is the one
 * editor for this key.
 */
export interface QuickEarnTile {
  id: string;
  label: string;
  href: string;
  icon: string; // key into QUICK_EARN_ICONS (= the shared NAV_ICONS registry)
  color: string; // key into COLOR_CLASSES
  enabled: boolean;
}

/**
 * The icon set the admin can pick from. It is the shared navigation registry
 * now (`nav-icons.ts`), which kept every key this map used to have — so a tile
 * saved as `gamepad` or `graduation` draws exactly what it drew before.
 */
export const QUICK_EARN_ICONS: Record<string, LucideIcon> = NAV_ICONS;

export const ICON_OPTIONS: { key: string; label: string }[] = NAV_ICON_OPTIONS.map(
  (o) => ({ key: o.key, label: o.label })
);

/**
 * NO LONGER RENDERED.
 *
 * These ten tones were applied to the Quick Earn tile icons on the feed and in
 * the sidebar rail, which meant a twelve-shortcut grid was twelve competing
 * hues sitting directly under the balance card — the single thing the redesign
 * set out to remove. Both surfaces now render the tiles neutral.
 *
 * The map is kept, and so is the stored `color` on every tile, so nothing an
 * admin has already set is destroyed and the feature can be switched back on
 * without a migration. What is NOT kept is a control that silently does
 * nothing: the picker in Settings → Navigation → Quick Earn is disabled and labelled, and
 * its preview icon renders neutral so the form shows what the app shows.
 *
 * `COLOR_OPTIONS` below still reads from this map — it is what populates that
 * (disabled) picker, so the stored value is still displayed by name.
 */
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
  { id: "qe-mission", label: "Mission", href: "/daily-mission", icon: "calendarCheck", color: "violet", enabled: true },
  { id: "qe-tasks", label: "Task", href: "/tasks", icon: "listTodo", color: "sky", enabled: true },
  { id: "qe-quizzes", label: "Quiz Games", href: "/quizzes", icon: "brain", color: "purple", enabled: true },
  { id: "qe-lottery", label: "Lottery", href: "/lottery", icon: "ticket", color: "rose", enabled: true },
  { id: "qe-course", label: "Course", href: "/courses", icon: "graduation", color: "cyan", enabled: true },
  { id: "qe-packages", label: "Packages", href: "/packages", icon: "package", color: "orange", enabled: true },
  { id: "qe-advertiser", label: "Create Ad", href: "/advertiser", icon: "megaphone", color: "indigo", enabled: true },
  { id: "qe-games", label: "Games", href: "/games", icon: "gamepad", color: "violet", enabled: true },
  { id: "qe-events", label: "Events", href: "/events", icon: "gift", color: "rose", enabled: true },
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
      icon: isNavIconKey(r.icon) ? r.icon : "zap",
      color: typeof r.color === "string" && COLOR_CLASSES[r.color] ? r.color : "indigo",
      enabled: r.enabled !== false,
    });
  }
  return out.length ? out : DEFAULT_QUICK_EARN;
}
