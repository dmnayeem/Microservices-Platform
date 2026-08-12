"use client";

import Link from "next/link";
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
  Newspaper,
  Layout,
  LayoutList,
  Activity,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  UserCog,
  Landmark,
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
import { useAdminUI } from "@/lib/stores/admin-ui-store";

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
}

// Icon mapping for dynamic rendering
const iconMap: Record<string, LucideIcon> = {
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
  Bell,
  Image: ImageIcon,
  ImageIcon,
  Gamepad2,
  Newspaper,
  Layout,
  LayoutList,
  Activity,
  BarChart3,
  Sparkles,
  Settings,
  Shield,
  FolderTree,
  UserCog,
  Landmark,
};

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

      {/* Navigation — grouped by category */}
      <nav className="flex-1 overflow-y-auto py-3">
        {groupedModules.map((group, groupIdx) => (
          <div
            key={group.category}
            className={cn(
              "px-3",
              groupIdx > 0 && "mt-4 pt-3 border-t border-slate-800/60"
            )}
          >
            {!collapsed && group.label && (
              <p className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.modules.map((module) => {
                const Icon = iconMap[module.icon] || LayoutDashboard;
                const isActive =
                  pathname === module.href ||
                  (module.href !== "/admin" &&
                    pathname.startsWith(`${module.href}/`));
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
                          <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 grid place-items-center text-[9px] font-bold bg-linear-to-r from-indigo-500 to-purple-600 text-white rounded-full tabular-nums">
                            {badgeText(pending)}
                          </span>
                        )}
                      </span>
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{module.name}</span>
                          {pending > 0 ? (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-linear-to-r from-indigo-500 to-purple-600 text-white rounded tabular-nums">
                              {badgeText(pending)}
                            </span>
                          ) : (
                            module.badge && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-linear-to-r from-indigo-500 to-purple-600 text-white rounded">
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
              href="/dashboard"
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

export function AdminSidebar({ user, modules, badges }: AdminSidebarProps) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const collapsed = useAdminUI((s) => s.sidebarCollapsed);
  const toggleCollapse = useAdminUI((s) => s.toggleSidebar);

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
      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar (always full width on mobile) */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 transform transition-transform duration-300 lg:hidden",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
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
            onToggleCollapse={toggleCollapse}
          />
        </div>
      </div>
    </>
  );
}
