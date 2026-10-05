"use client";

import Link from "next/link";
import { USER_HOME } from "@/lib/routes";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ListTodo,
  Wallet,
  Gamepad2,
  Store,
  Handshake,
  Scale,
  Settings,
  Shield,
  ShieldAlert,
  LogOut,
  X,
  BarChart3,
  Bell,
  BellRing,
  Package,
  GitBranch,
  Globe,
  ClipboardCheck,
  Ticket,
  Image as ImageIcon,
  Trophy,
  Layers,
  CreditCard,
  MessageSquare,
  GraduationCap,
  Target,
  Brain,
  Gift,
  BadgeCheck,
  Flag,
  FileText,
  Megaphone,
  Send,
  Newspaper,
  Layout,
  LayoutList,
  Activity,
  CalendarCheck,
  Smartphone,
  TrendingUp,
  Sparkles,
  Timer,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  FolderTree,
  UserCog,
  Landmark,
  BookOpenCheck,
  DollarSign,
  Eye,
  LayoutGrid,
  BadgeDollarSign,
  Rocket,
  ListChecks,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import {
  getGroupedModules,
  ROLE_CONFIG,
  type UserRole,
} from "@/lib/rbac";
import { useAdminUI, useSidebarCollapsed } from "@/lib/stores/admin-ui-store";

interface AdminSidebarProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
  };
  // Server-resolved, effective (config + per-user override aware) nav modules.
  // Falls back to role-default modules when not provided.
  modules?: ReturnType<typeof getGroupedModules>;
  // Live pending-request counts keyed by module href (badge on the nav item).
  badges?: Record<string, number>;
  /** Read from the cookie by the server layout so SSR and the first client
   *  render agree on the width — see admin-ui-store.ts. */
  initialCollapsed: boolean;
}

// Icon mapping for dynamic rendering
export const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  Trophy,
  ListTodo,
  Layers,
  ClipboardCheck,
  Wallet,
  CreditCard,
  Package,
  GitBranch,
  Store,
  Handshake,
  Scale,
  MessageSquare,
  Ticket,
  GraduationCap,
  Target,
  Brain,
  Gift,
  ShieldAlert,
  BadgeCheck,
  Globe,
  Flag,
  FileText,
  Megaphone,
  Send,
  Bell,
  BellRing,
  Image: ImageIcon,
  ImageIcon,
  Gamepad2,
  Newspaper,
  Layout,
  LayoutList,
  Activity,
  CalendarCheck,
  Smartphone,
  TrendingUp,
  BarChart3,
  Sparkles,
  Timer,
  Settings,
  Shield,
  FolderTree,
  UserCog,
  Landmark,
  BookOpenCheck,
  DollarSign,
  Eye,
  LayoutGrid,
  // Payroll, Missions, Daily Missions — were missing, so those nav items drew
  // the Dashboard icon. scripts/verify-page-registry.ts now checks this map.
  BadgeDollarSign,
  Rocket,
  ListChecks,
};

/** Which sidebar groups this admin has open (per browser). */
const NAV_OPEN_KEY = "rt-admin-nav-open";

// Extract SidebarContent as a separate component
interface AdminSidebarContentProps {
  user: AdminSidebarProps["user"];
  userRole: UserRole | undefined;
  groupedModules: ReturnType<typeof getGroupedModules>;
  roleConfig: (typeof ROLE_CONFIG)[keyof typeof ROLE_CONFIG];
  pathname: string;
  collapsed: boolean;
  badges?: Record<string, number>;
  onNavigate: () => void;
  onSignOut: () => void;
  onToggleCollapse?: () => void;
}

/** Format a badge count compactly (e.g. 1000 → "999+"). */
function badgeText(n: number): string {
  return n > 999 ? "999+" : String(n);
}

/**
 * Which nav item to highlight for a path — the **longest** matching href wins.
 *
 * Without the longest-match step, `/admin/settings/social-earning` lights up both
 * "Social Earning" (exact) and "System Settings" (prefix). Five parent/child
 * pairs in the nav have that problem.
 *
 * A plain `pathname === href` would be wrong the other way: routes with no nav
 * item of their own (`/admin/users/[id]`, `/admin/courses/new`, …) rely on the
 * prefix branch to highlight their parent. This is the same rule
 * `moduleForPath()` in lib/rbac.ts uses for the permission guard — matched here
 * deliberately, computed over the modules actually rendered.
 */
function activeHrefFor(
  pathname: string,
  groups: ReturnType<typeof getGroupedModules>
): string | null {
  let best: string | null = null;
  for (const g of groups) {
    for (const m of g.modules) {
      if (pathname === m.href || pathname.startsWith(`${m.href}/`)) {
        if (!best || m.href.length > best.length) best = m.href;
      }
    }
  }
  return best;
}

function AdminSidebarContent({
  user,
  groupedModules,
  roleConfig,
  pathname,
  collapsed,
  badges,
  onNavigate,
  onSignOut,
  onToggleCollapse,
}: AdminSidebarContentProps) {
  const activeHref = activeHrefFor(pathname, groupedModules);
  const activeGroup =
    groupedModules.find((g) => g.modules.some((m) => m.href === activeHref))?.category ?? null;

  // Find a page by name — with ~65 pages, scanning groups is the slow way.
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shownGroups = q
    ? groupedModules
        .map((g) => ({
          ...g,
          modules: g.modules.filter(
            (m) => m.name.toLowerCase().includes(q) || (g.label ?? "").toLowerCase().includes(q)
          ),
        }))
        .filter((g) => g.modules.length > 0)
    : groupedModules;

  // Which groups are open. The one holding the current page starts open (see
  // activeClosedAt below); the rest remember what this admin last opened or
  // closed.
  // Read after mount: the server render has no localStorage, and reading it in
  // the initial state would make the first client render disagree with it.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        setOpenGroups(JSON.parse(localStorage.getItem(NAV_OPEN_KEY) ?? "{}") as Record<string, boolean>);
      } catch {
        /* keep the defaults */
      }
    });
  }, []);
  // The current page's group opens by default but can be closed (owner,
  // 2026-10-04 — it used to be locked open). Closing is remembered for THIS
  // page only: open another page and its group opens again, so the page you
  // are on is never hidden by an old choice.
  const [activeClosedAt, setActiveClosedAt] = useState<string | null>(null);
  const isOpen = (category: string) =>
    !!q ||
    collapsed ||
    (category === activeGroup
      ? activeClosedAt !== pathname
      : (openGroups[category] ?? category === "OVERVIEW"));
  const toggleGroup = (category: string) => {
    if (category === activeGroup) {
      setActiveClosedAt((cur) => (cur === pathname ? null : pathname));
      return;
    }
    setOpenGroups((cur) => {
      const next = { ...cur, [category]: !isOpen(category) };
      try {
        localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(next));
      } catch {
        /* private mode — still toggles for this visit */
      }
      return next;
    });
  };

  return (
    <>
      {/* Logo */}
      <div className="relative flex h-16 shrink-0 items-center px-4 border-b border-slate-800">
        <Link
          href="/admin"
          className={cn(
            "flex items-center gap-2",
            collapsed && "justify-center w-full"
          )}
        >
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-red-500 to-orange-600 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold text-white">Admin Panel</span>
          )}
        </Link>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 z-10"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Admin Info */}
      {!collapsed && (
        <div className="px-4 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-red-500 to-orange-600 flex items-center justify-center text-white font-medium shrink-0">
              {user.name?.charAt(0) || user.email?.charAt(0) || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user.name || "Admin"}
              </p>
              <span
                className={cn(
                  "inline-block text-xs px-2 py-0.5 rounded-full mt-0.5",
                  roleConfig.color,
                  roleConfig.bgColor
                )}
              >
                {roleConfig.label}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      {!collapsed && (
        <div className="px-3 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a page…"
              aria-label="Find an admin page"
              className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500/60 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Navigation — grouped by the job, each group opens and closes */}
      <nav className="flex-1 overflow-y-auto py-2">
        {q && shownGroups.length === 0 && (
          <p className="px-6 py-4 text-xs text-slate-500">No page matches “{query}”.</p>
        )}
        {shownGroups.map((group) => (
          <div key={group.category} className={cn("px-3", collapsed ? "mt-2" : "mt-1")}>
            {!collapsed && group.label && (
              <button
                type="button"
                onClick={() => toggleGroup(group.category)}
                aria-expanded={isOpen(group.category)}
                className={cn(
                  // Gold so a category reads as a heading, not as one more page
                  // link (owner, 2026-10-04). NOT green: the selected page is
                  // the accent colour (`indigo` is remapped to the admin's
                  // accent, green by default), and the two ran together. Amber
                  // is never remapped, so it stays distinct whatever the
                  // accent. A plain heading, where the selected page is a pill.
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] transition-colors",
                  group.category === activeGroup
                    ? "text-amber-200"
                    : "text-amber-300/80 hover:text-amber-200 hover:bg-amber-400/5"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-3 w-0.5 shrink-0 rounded-full",
                    group.category === activeGroup ? "bg-amber-300" : "bg-amber-300/40"
                  )}
                />
                <span className="flex-1 truncate">{group.label}</span>
                <span className="rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 tabular-nums">
                  {group.modules.length}
                </span>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !isOpen(group.category) && "-rotate-90")}
                />
              </button>
            )}
            <ul className={cn("space-y-0.5", !collapsed && "pb-1", !isOpen(group.category) && "hidden")}>
              {group.modules.map((module) => {
                const Icon = iconMap[module.icon] || LayoutDashboard;
                const isActive = activeHref === module.href;
                const pending = badges?.[module.href] ?? 0;

                return (
                  <li key={module.name}>
                    <Link
                      href={module.href}
                      onClick={onNavigate}
                      title={collapsed ? module.name : undefined}
                      className={cn(
                        "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        collapsed && "justify-center",
                        isActive
                          ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/25"
                          : "text-slate-400 hover:text-white hover:bg-slate-800/70"
                      )}
                    >
                      <span className="relative shrink-0">
                        <Icon className="w-5 h-5" />
                        {/* Collapsed rail: a compact count badge on the icon corner. */}
                        {collapsed && pending > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 grid place-items-center text-[9px] font-bold bg-(--app-cta) text-(--app-on-cta) rounded-full tabular-nums">
                            {badgeText(pending)}
                          </span>
                        )}
                      </span>
                      {!collapsed && (
                        <>
                          <span className="flex-1 min-w-0 truncate">{module.name}</span>
                          {pending > 0 ? (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-(--app-cta) text-(--app-on-cta) rounded tabular-nums">
                              {badgeText(pending)}
                            </span>
                          ) : (
                            module.badge && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-(--app-cta) text-(--app-on-cta) rounded">
                                {module.badge}
                              </span>
                            )
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="border-t border-slate-800 px-3 py-3">
        <ul className="space-y-0.5">
          <li>
            <Link
              href={USER_HOME}
              title={collapsed ? "Back to App" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors",
                collapsed && "justify-center"
              )}
            >
              <LayoutDashboard className="w-5 h-5 shrink-0" />
              {!collapsed && <span>Back to App</span>}
            </Link>
          </li>
          <li>
            <button
              onClick={onSignOut}
              title={collapsed ? "Sign Out" : undefined}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors",
                collapsed && "justify-center"
              )}
            >
              <LogOut className="w-5 h-5 shrink-0" />
              {!collapsed && <span>Sign Out</span>}
            </button>
          </li>
        </ul>
      </div>
    </>
  );
}

export function AdminSidebar({
  user,
  modules,
  badges,
  initialCollapsed,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const collapsed = useSidebarCollapsed(initialCollapsed);
  const toggle = useAdminUI((s) => s.toggleSidebar);

  // Listen for header hamburger event to open mobile sidebar
  useEffect(() => {
    const open = () => setIsMobileOpen(true);
    window.addEventListener("admin-sidebar-open", open);
    return () => window.removeEventListener("admin-sidebar-open", open);
  }, []);

  const userRole = user.role as UserRole | undefined;
  // Prefer the effective modules resolved on the server; fall back to role
  // defaults for safety if the prop wasn't supplied.
  const groupedModules = modules ?? getGroupedModules(userRole);
  const roleConfig = userRole ? ROLE_CONFIG[userRole] : ROLE_CONFIG.USER;

  const handleSignOut = () => {
    signOut({ callbackUrl: "/login" });
  };

  const handleNavigate = () => {
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile sidebar overlay.
          Always mounted, shown by class rather than conditionally rendered.
          As a conditional FIRST child of this fragment it changed the sibling
          count between closed and open, so any disagreement about
          `isMobileOpen` — or anything else perturbing the DOM before React
          hydrates — shifted every following node by one and reported as a
          whole-tree hydration mismatch rooted here.
          `pointer-events-none` while closed is load-bearing: an always-mounted
          full-screen overlay would otherwise swallow every click in the admin. */}
      <div
        aria-hidden={!isMobileOpen}
        onClick={() => setIsMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 lg:hidden transition-opacity duration-300",
          isMobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />

      {/* Mobile Sidebar (always full width on mobile).
          `aria-hidden` when closed: it is only moved off-screen, so without
          this every nav link stays in the tab order and a keyboard or screen
          reader user walks through a menu they cannot see. */}
      <div
        aria-hidden={!isMobileOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 transform transition-transform duration-300 lg:hidden",
          isMobileOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        )}
      >
        <button
          onClick={() => setIsMobileOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 z-10"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex flex-col h-full">
          <AdminSidebarContent
            user={user}
            userRole={userRole}
            groupedModules={groupedModules}
            roleConfig={roleConfig}
            pathname={pathname}
            collapsed={false}
            badges={badges}
            onNavigate={handleNavigate}
            onSignOut={handleSignOut}
          />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div
        className={cn(
          "hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:flex-col transition-[width] duration-200",
          collapsed ? "lg:w-20" : "lg:w-72"
        )}
      >
        <div className="flex flex-col h-full glass-strong rounded-none border-0 border-r border-slate-800/70">
          <AdminSidebarContent
            user={user}
            userRole={userRole}
            groupedModules={groupedModules}
            roleConfig={roleConfig}
            pathname={pathname}
            collapsed={collapsed}
            badges={badges}
            onNavigate={handleNavigate}
            onSignOut={handleSignOut}
            onToggleCollapse={() => toggle(collapsed)}
          />
        </div>
      </div>
    </>
  );
}
