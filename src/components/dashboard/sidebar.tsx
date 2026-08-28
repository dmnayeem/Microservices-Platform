"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/user/primitives/avatar";
import {
  Home,
  LayoutDashboard,
  ListTodo,
  Gamepad2,
  Wallet,
  Users,
  Trophy,
  GraduationCap,
  Store,
  Ticket,
  MessageSquare,
  Settings,
  Sparkles,
  LogOut,
  X,
  Shield,
  Brain,
  Pin,
  Target,
  Award,
  Package,
  Briefcase,
  ArrowUpRight,
  HelpCircle,
  Bell,
  CreditCard,
  Handshake,
  Coins,
  Rocket,
  Bookmark,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useMobileNav } from "@/lib/stores/mobile-nav-store";
import { cn } from "@/lib/utils";
import { isAdmin, isTutor, type UserRole } from "@/lib/rbac";

interface SidebarProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
  };
  /** Effective feature keys the user has; items tagged with a `feature` not in
   *  this list are hidden. Omitted → show everything (e.g. admin surfaces). */
  features?: string[];
  /** Paths hidden by super-admin page-visibility (feature #3). */
  hiddenPaths?: string[];
  /** The user's real profile picture (from User.avatar) — session omits it. */
  avatar?: string | null;
}

type NavItem = {
  name: string;
  href: string;
  icon: typeof Home;
  feature?: string;
};

const navigationGroups: { section: string; items: NavItem[] }[] = [
  {
    section: "Main",
    items: [
      { name: "Home", href: "/social", icon: Home },
      { name: "Saved", href: "/saved", icon: Bookmark },
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Courses", href: "/courses", icon: GraduationCap, feature: "courses" },
      { name: "Marketplace", href: "/marketplace", icon: Store, feature: "marketplace" },
      { name: "Wallet", href: "/wallet", icon: Wallet },
      { name: "My Team", href: "/referrals", icon: Users, feature: "referrals" },
      { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
    ],
  },
  {
    section: "Earn",
    items: [
      { name: "Daily Mission", href: "/daily-mission", icon: Target, feature: "dailyMission" },
      // Distinct from Daily Mission on purpose: daily = today's checklist,
      // Missions = long-run big-prize goals. Both feed off one progress engine.
      { name: "Missions", href: "/missions", icon: Rocket },
      { name: "Tasks", href: "/tasks", icon: ListTodo, feature: "tasks" },
      { name: "Board Tasks", href: "/board-tasks", icon: Pin, feature: "tasks" },
      { name: "Quiz Games", href: "/quizzes", icon: Brain },
      { name: "Games", href: "/games", icon: Gamepad2, feature: "games" },
      { name: "Events", href: "/events", icon: Sparkles },
    ],
  },
  {
    section: "Grow",
    items: [
      { name: "Lottery", href: "/lottery", icon: Ticket, feature: "lottery" },
      { name: "My Learning", href: "/my-learning", icon: GraduationCap, feature: "courses" },
      { name: "Affiliate", href: "/affiliate", icon: Handshake },
      { name: "Browse & Earn", href: "/watch-ads", icon: Coins },
      { name: "Milestones", href: "/milestones", icon: Target },
      { name: "Achievements", href: "/achievements", icon: Award },
    ],
  },
  {
    section: "Marketing",
    items: [
      { name: "Create Ad", href: "/advertiser", icon: Briefcase, feature: "advertiser" },
      { name: "Add Funds", href: "/deposit", icon: CreditCard },
    ],
  },
  {
    section: "Account",
    items: [
      { name: "Withdrawal", href: "/withdrawal", icon: ArrowUpRight, feature: "withdrawals" },
      { name: "Packages", href: "/packages", icon: Package },
      { name: "My Package", href: "/my-package", icon: Package },
      { name: "Notifications", href: "/notifications", icon: Bell },
      { name: "Chat", href: "/chat", icon: MessageSquare },
      { name: "Help", href: "/support", icon: HelpCircle },
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

const adminNavigation = [
  { name: "Admin Panel", href: "/admin", icon: Shield },
];

const tutorNavigation = [
  { name: "Tutor Hub", href: "/tutor/dashboard", icon: GraduationCap },
];

// Extract SidebarContent as a separate component
interface SidebarContentProps {
  user: SidebarProps["user"];
  pathname: string;
  onNavigate: () => void;
  onSignOut: () => void;
  features?: string[];
  hiddenPaths?: string[];
  avatar?: string | null;
}

function SidebarContent({ user, pathname, onNavigate, onSignOut, features, hiddenPaths, avatar }: SidebarContentProps) {
  const hidden = new Set(hiddenPaths ?? []);
  const visible = (item: NavItem) =>
    (!item.feature || !features || features.includes(item.feature)) &&
    !hidden.has(item.href);
  return (
    <>
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-gray-800">
        <Link href="/social" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold bg-linear-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            EarnGPT
          </span>
        </Link>
      </div>

      {/* User Info */}
      <div className="px-3 py-3 border-b border-gray-800">
        <Link
          href="/profile"
          onClick={onNavigate}
          aria-label="Open profile"
          className={cn(
            "flex items-center gap-3 px-2 py-2 rounded-lg transition-colors",
            pathname.startsWith("/profile")
              ? "bg-indigo-500/10"
              : "hover:bg-gray-800"
          )}
        >
          <Avatar
            src={avatar}
            name={user.name || user.email}
            size={40}
            className="shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-sm font-medium truncate",
                pathname.startsWith("/profile")
                  ? "text-indigo-400"
                  : "text-white"
              )}
            >
              {user.name || "User"}
            </p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {navigationGroups.map((group) => {
          const items = group.items.filter(visible);
          if (items.length === 0) return null;
          return (
          <div key={group.section}>
            <p className="px-3 text-[10px] font-bold text-gray-500 uppercase tracking-[0.12em] mb-2">
              {group.section}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                        isActive
                          ? "bg-indigo-500/12 text-indigo-300 ring-1 ring-inset ring-indigo-500/20"
                          : "text-gray-400 hover:text-white hover:bg-gray-800/70"
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-linear-to-b from-indigo-400 to-violet-500" />
                      )}
                      <item.icon className="w-4 h-4" />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </nav>

      {/* Tutor Navigation - Show for users with TUTOR role */}
      {isTutor(user.role as UserRole | undefined) && (
        <div className="border-t border-gray-800 px-3 py-4">
          <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Teaching
          </p>
          <ul className="space-y-1">
            {tutorNavigation.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-indigo-500/10 text-indigo-300"
                        : "text-gray-400 hover:text-indigo-300 hover:bg-gray-800"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Admin Navigation - Show for all admin roles */}
      {isAdmin(user.role as UserRole | undefined) && (
        <div className="border-t border-gray-800 px-3 py-4">
          <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Administration
          </p>
          <ul className="space-y-1">
            {adminNavigation.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-red-500/10 text-red-400"
                        : "text-gray-400 hover:text-red-400 hover:bg-gray-800"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Sign Out Button */}
      <div className="border-t border-gray-800 px-3 py-4">
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </>
  );
}

export function Sidebar({ user, features, hiddenPaths, avatar }: SidebarProps) {
  const pathname = usePathname();
  // Single shared mobile-drawer signal — opened by BOTH the header hamburger
  // and the bottom-bar Menu button (both write this store). This canonical,
  // feature-filtered drawer replaces the header's old duplicate flat menu.
  const isMobileOpen = useMobileNav((s) => s.open);
  const setMobileOpen = useMobileNav((s) => s.setOpen);

  const handleSignOut = () => {
    signOut({ callbackUrl: "/login" });
  };

  const handleNavigate = () => {
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 glass-strong rounded-none transform transition-transform duration-300 lg:hidden",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="flex flex-col h-full">
          <SidebarContent
            user={user}
            pathname={pathname}
            onNavigate={handleNavigate}
            onSignOut={handleSignOut}
            features={features}
            hiddenPaths={hiddenPaths}
            avatar={avatar}
          />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-72 lg:flex-col">
        <div className="flex flex-col h-full glass-strong rounded-none border-0 border-r border-gray-800/70">
          <SidebarContent
            user={user}
            pathname={pathname}
            onNavigate={handleNavigate}
            onSignOut={handleSignOut}
            features={features}
            hiddenPaths={hiddenPaths}
            avatar={avatar}
          />
        </div>
      </div>
    </>
  );
}
