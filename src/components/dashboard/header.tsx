"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Menu, Bell, Search, Wallet, Sparkles, Settings, LogOut, User, ChevronDown, FileText, Check } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useMobileNav } from "@/lib/stores/mobile-nav-store";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useAppRefresh } from "@/hooks/use-app-refresh";
import { Avatar } from "@/components/user/primitives/avatar";

interface HeaderProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
  };
  /** The user's real profile picture (from User.avatar) — the session doesn't carry it. */
  avatar?: string | null;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function Header({ user, avatar }: HeaderProps) {
  // The hamburger opens the shared mobile drawer (rendered by Sidebar, the
  // canonical feature-filtered menu). Also opened by the bottom-bar Menu tab.
  const setIsMobileMenuOpen = useMobileNav((s) => s.setOpen);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);

  // Fetch notifications + wallet balance. Kept fresh site-wide: on mount, on
  // tab refocus, and on a 30s timer (see useAutoRefresh). This is the single
  // notification poller app-wide — the mobile bottom-bar defers to the Header
  // on desktop and only polls on mobile viewports.
  const fetchData = useCallback(async () => {
    try {
      const notifRes = await fetch("/api/notifications?limit=5&unread=true", {
        cache: "no-store",
      });
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        setNotifications(notifData.notifications || []);
        setUnreadCount(notifData.unreadCount || 0);
      }

      // Wallet endpoint returns { balance: { points, ... }, stats, ... }
      const walletRes = await fetch("/api/wallet", { cache: "no-store" });
      if (walletRes.ok) {
        const walletData = await walletRes.json();
        setWalletBalance(walletData?.balance?.points ?? 0);
      }
    } catch (error) {
      console.error("Error fetching header data:", error);
    }
  }, []);

  // Fetch once on mount. We intentionally do NOT refetch on every navigation
  // (that added an Accelerate round-trip per click); focus + timer keep it fresh.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // Live refresh: tab refocus + timer (paused while tab hidden).
  useAutoRefresh(fetchData);
  // Pull-to-refresh anywhere in the app instantly re-pulls balance + notifications.
  useAppRefresh(fetchData);

  const handleSignOut = () => {
    signOut({ callbackUrl: "/login" });
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setUnreadCount(0);
      setNotifications(notifications.map((n) => ({ ...n, isRead: true })));
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

  return (
    <>
      <header className="sticky top-0 z-30 glass-strong border-0 border-b border-gray-800/60 rounded-none safe-t">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Left: Mobile Menu Button & Logo (mobile only) */}
          <div className="flex items-center gap-4 lg:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
            >
              <Menu className="w-6 h-6" />
            </button>
            <Link href="/social" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            </Link>
          </div>

          {/* Center/Left: Search (desktop) */}
          <div className="hidden lg:flex flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="search"
                placeholder="Search tasks, users..."
                className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* View Reports Button (desktop) */}
            <Link
              href="/wallet"
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span className="text-sm">Reports</span>
            </Link>

            {/* Wallet Balance */}
            <Link
              href="/wallet"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors"
            >
              <Wallet className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-medium text-white">
                {walletBalance.toLocaleString()} PTS
              </span>
            </Link>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsNotificationOpen(!isNotificationOpen);
                  setIsProfileOpen(false);
                }}
                className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-4 h-4 flex items-center justify-center px-1 text-xs font-bold text-white bg-red-500 rounded-full">
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
                  <div className="fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 rounded-lg bg-gray-900 border border-gray-800 shadow-lg z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                      <h3 className="text-sm font-semibold text-white">
                        Notifications
                      </h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-gray-500">
                          <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No notifications</p>
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <Link
                            key={notif.id}
                            href="/notifications"
                            onClick={() => setIsNotificationOpen(false)}
                            className={cn(
                              "block px-4 py-3 border-b border-gray-800 hover:bg-gray-800/50 transition-colors",
                              !notif.isRead && "bg-indigo-500/5"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              {!notif.isRead && (
                                <span className="w-2 h-2 mt-1.5 bg-indigo-500 rounded-full shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">
                                  {notif.title}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                  {notif.message}
                                </p>
                                <p className="text-xs text-gray-600 mt-1">
                                  {formatTimeAgo(notif.createdAt)}
                                </p>
                              </div>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                    <Link
                      href="/notifications"
                      onClick={() => setIsNotificationOpen(false)}
                      className="block px-4 py-3 text-center text-sm text-indigo-400 hover:text-indigo-300 border-t border-gray-800"
                    >
                      View all notifications
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
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Avatar
                  src={avatar}
                  name={user.name || user.email}
                  size={32}
                />
                <ChevronDown className="hidden sm:block w-4 h-4 text-gray-400" />
              </button>

              {/* Dropdown Menu */}
              {isProfileOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsProfileOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1rem)] rounded-lg bg-gray-900 border border-gray-800 shadow-lg z-50">
                    <div className="px-4 py-3 border-b border-gray-800">
                      <p className="text-sm font-medium text-white truncate">
                        {user.name || "User"}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user.email}
                      </p>
                    </div>
                    <div className="py-1">
                      <Link
                        href="/profile"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800"
                      >
                        <User className="w-4 h-4" />
                        Profile
                      </Link>
                      <Link
                        href="/wallet"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800"
                      >
                        <FileText className="w-4 h-4" />
                        Reports & Transactions
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </Link>
                    </div>
                    <div className="border-t border-gray-800 py-1">
                      <button
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800"
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
    </>
  );
}
