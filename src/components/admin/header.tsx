"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { USER_HOME } from "@/lib/routes";
import {
  Menu,
  Bell,
  Search,
  Shield,
  Settings,
  LogOut,
  ChevronDown,
  LayoutDashboard,
  Users,
  Wallet,
  Megaphone,
  Trophy,
  MessageSquare,
  Ticket,
  AlertCircle,
  CheckCircle,
  Check,
  Inbox,
  Sun,
  Moon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { ADMIN_MODULES } from "@/lib/rbac";
import { useTheme } from "@/components/providers/theme-provider";

interface AdminHeaderProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
  };
  /** Total items waiting on this admin across every review queue. */
  pendingTotal?: number;
  /** Whether this admin may open the broadcast log at /admin/notifications. */
  canViewNotifications?: boolean;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  /** `notifyUser` stores the deep link here, e.g. { link: "/admin/ads" }. */
  data?: { link?: string } | null;
}

/**
 * Where a notification should take the admin.
 *
 * This used to be hardcoded to `/admin/notifications`, which throws away the
 * link every notification already carries — and that page is the marketing
 * broadcast log gated on `notifications.view`, a permission most admin roles
 * (AD_MANAGER included) don't have. So clicking "Ad awaiting review" landed on
 * the no-access screen instead of the ad queue.
 */
function notificationHref(n: Notification): string {
  const link = n.data?.link;
  return typeof link === "string" && link.startsWith("/") ? link : "/admin";
}

const NOTIFICATION_TYPE_CONFIG: Record<
  string,
  { icon: typeof Bell; color: string }
> = {
  SYSTEM: { icon: AlertCircle, color: "text-slate-400" },
  TASK: { icon: CheckCircle, color: "text-blue-400" },
  WALLET: { icon: Wallet, color: "text-emerald-400" },
  REFERRAL: { icon: Users, color: "text-purple-400" },
  PROMOTION: { icon: Megaphone, color: "text-amber-400" },
  ACHIEVEMENT: { icon: Trophy, color: "text-yellow-400" },
  LOTTERY: { icon: Ticket, color: "text-pink-400" },
  SOCIAL: { icon: MessageSquare, color: "text-indigo-400" },
};

// Derive page title from current pathname against the admin module list
function usePageTitle(pathname: string): string {
  return useMemo(() => {
    // Exact-route titles for non-module routes
    const overrides: Record<string, string> = {
      "/admin/users/kyc": "KYC / Blue Badge",
      "/admin/notifications/send": "Send Notification",
      "/admin/referrals/settings": "Referral Settings",
      "/admin/tasks/new": "Create Task",
      "/admin/lottery/new": "Create Lottery",
    };
    if (overrides[pathname]) return overrides[pathname];

    // Find longest-matching module href
    const match = ADMIN_MODULES
      .filter((m) => pathname === m.href || pathname.startsWith(`${m.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0];

    if (match) return match.name;
    if (pathname.startsWith("/admin/")) return "Admin";
    return "Admin";
  }, [pathname]);
}

export function AdminHeader({
  user,
  pendingTotal = 0,
  canViewNotifications = false,
}: AdminHeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const pathname = usePathname();
  const pageTitle = usePageTitle(pathname);
  const { theme, setTheme } = useTheme();
  const isLight = theme === "light";

  // Fetch notifications, refresh every 30 seconds
  useEffect(() => {
    let cancelled = false;
    const fetchNotifications = async () => {
      try {
        const response = await fetch("/api/notifications?limit=5&unread=true");
        if (response.ok && !cancelled) {
          const data = await response.json();
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      } catch (error) {
        console.error("Error fetching notifications:", error);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleSignOut = () => {
    signOut({ callbackUrl: "/login" });
  };

  const handleMarkAllRead = async () => {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      if (response.ok) {
        setUnreadCount(0);
        setNotifications(notifications.map((n) => ({ ...n, isRead: true })));
      }
    } catch (error) {
      console.error("Error marking notifications as read:", error);
    }
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const triggerMobileSidebar = () => {
    // Open mobile sidebar by dispatching an event the sidebar component listens for.
    // Sidebar already handles its own mobile open state via its own button, but the
    // hamburger here can also toggle it. We use a simple custom event pattern.
    window.dispatchEvent(new CustomEvent("admin-sidebar-open"));
  };

  return (
    <header className="sticky top-0 z-30 glass-strong rounded-none border-0 border-b border-slate-800/60">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8 gap-4">
        {/* Left: Mobile Menu + Logo (mobile) | Page Title (desktop) */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={triggerMobileSidebar}
            className="lg:hidden p-2 -ml-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <Link
            href="/admin"
            className="lg:hidden flex items-center gap-2 shrink-0"
          >
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-red-500 to-orange-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
          </Link>

          {/* Desktop page title */}
          <h1 className="hidden lg:block text-lg font-semibold text-white truncate">
            {pageTitle}
          </h1>
        </div>

        {/* Center: Search */}
        <div className="hidden md:flex flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="search"
              placeholder="Search users, tasks…"
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Admin Badge */}
          <span className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
            <Shield className="w-3.5 h-3.5" />
            {user.role}
          </span>

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(isLight ? "dark" : "light")}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
            title={isLight ? "Switch to dark mode" : "Switch to light mode"}
          >
            {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>

          {/* Notifications */}
          <div className="relative">
            {/* Work waiting on an admin decision. A notification disappears
                once it's read; this number doesn't go away until the queue is
                actually cleared, which is what makes it trustworthy. */}
            {pendingTotal > 0 && (
              <Link
                href="/admin"
                className="relative mr-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-bold"
                title="Requests waiting for review"
              >
                <Inbox className="w-4 h-4" />
                {pendingTotal > 999 ? "999+" : pendingTotal}
              </Link>
            )}

            <button
              onClick={() => {
                setIsNotificationOpen(!isNotificationOpen);
                setIsProfileOpen(false);
              }}
              className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-4 h-4 flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {isNotificationOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsNotificationOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-lg bg-slate-900 border border-slate-700 shadow-xl z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                    <h3 className="text-sm font-semibold text-white">
                      Notifications
                    </h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-slate-500">
                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No notifications</p>
                      </div>
                    ) : (
                      notifications.map((notif) => {
                        const typeConfig =
                          NOTIFICATION_TYPE_CONFIG[notif.type] ||
                          NOTIFICATION_TYPE_CONFIG.SYSTEM;
                        const Icon = typeConfig.icon;

                        return (
                          <Link
                            key={notif.id}
                            href={notificationHref(notif)}
                            onClick={() => setIsNotificationOpen(false)}
                            className={cn(
                              "block px-4 py-3 border-b border-slate-800 hover:bg-slate-800/50 transition-colors",
                              !notif.isRead && "bg-blue-500/5"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={cn(
                                  "p-1.5 rounded-lg bg-slate-800",
                                  typeConfig.color
                                )}
                              >
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-white truncate">
                                    {notif.title}
                                  </p>
                                  {!notif.isRead && (
                                    <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                                  {notif.message}
                                </p>
                                <p className="text-xs text-slate-600 mt-1">
                                  {formatTimeAgo(notif.createdAt)}
                                </p>
                              </div>
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>
                  {/* /admin/notifications is the broadcast log, gated on
                      `notifications.view` — sending an admin without it there
                      just bounces them to the no-access page. */}
                  <Link
                    href={canViewNotifications ? "/admin/notifications" : "/admin"}
                    onClick={() => setIsNotificationOpen(false)}
                    className="block px-4 py-3 text-center text-sm text-blue-400 hover:text-blue-300 border-t border-slate-700"
                  >
                    {canViewNotifications
                      ? "View all notifications"
                      : "Go to dashboard"}
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setIsProfileOpen(!isProfileOpen);
                setIsNotificationOpen(false);
              }}
              className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Account menu"
            >
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-red-500 to-orange-600 flex items-center justify-center text-white text-sm font-medium">
                {user.name?.charAt(0) || user.email?.charAt(0) || "A"}
              </div>
              <ChevronDown className="hidden sm:block w-4 h-4 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {isProfileOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsProfileOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1rem)] rounded-lg bg-slate-900 border border-slate-700 shadow-xl z-50">
                  <div className="px-4 py-3 border-b border-slate-700">
                    <p className="text-sm font-medium text-white truncate">
                      {user.name || "Admin"}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {user.email}
                    </p>
                  </div>
                  <div className="py-1">
                    <Link
                      href={USER_HOME}
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      Back to App
                    </Link>
                    <Link
                      href="/admin/settings"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </Link>
                  </div>
                  <div className="border-t border-slate-700 py-1">
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-slate-800"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
