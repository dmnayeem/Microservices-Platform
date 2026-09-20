"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Menu, Bell, Search, Wallet, Sparkles, Settings, LogOut, User, ChevronDown, FileText, Check, ChevronLeft, Flame } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useMobileNav } from "@/lib/stores/mobile-nav-store";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useAppRefresh } from "@/hooks/use-app-refresh";
import { Avatar } from "@/components/user/primitives/avatar";
import { ThemeSwitch } from "@/components/dashboard/theme-switch";
import { GlobalSearch } from "@/components/user/primitives/global-search";

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
  const router = useRouter();
  const pathname = usePathname();
  // Top-level destinations (bottom-tab + main entries) — no back arrow here.
  // On any deeper page a mobile back arrow appears for one-tap navigation up.
  const ROOT_PATHS = new Set([
    "/",
    "/social",
    "/tasks",
    "/wallet",
    "/daily-mission",
    "/dashboard",
    "/earn",
  ]);
  const showBack = !!pathname && !ROOT_PATHS.has(pathname);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [shortcutHint, setShortcutHint] = useState("Ctrl K");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [streak, setStreak] = useState(0);
  const [level, setLevel] = useState(0);
  // The balance is re-polled every 60s and on every pull-to-refresh, and it
  // used to change with no acknowledgement at all — the number was simply
  // different the next time you looked at it. `tick` counts real changes (not
  // re-fetches that return the same figure) and re-keys the span, which replays
  // the `app-tick` scale. Kept in a ref + a counter rather than compared in an
  // effect, so this stays out of the render path.
  const prevBalance = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

  // Poll ONLY the two numbers the header chrome shows. This used to hit
  // /api/notifications + /api/wallet (~11 queries, incl. two Transaction
  // aggregates) every 30s on every page, per signed-in user, to render a points
  // figure and an unread dot. /api/header is two indexed reads.
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/header", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        const next = d.points ?? 0;
        if (prevBalance.current !== null && prevBalance.current !== next) {
          setTick((t) => t + 1);
        }
        prevBalance.current = next;
        setWalletBalance(next);
        setStreak(d.streak ?? 0);
        setLevel(d.level ?? 0);
        setUnreadCount(d.unreadCount ?? 0);
      }
    } catch (error) {
      console.error("Error fetching header data:", error);
    }
  }, []);

  // The notification LIST is only needed when the dropdown is open, so it is
  // fetched on demand instead of on every poll.
  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=5&unread=true", {
        cache: "no-store",
      });
      if (res.ok) {
        const d = await res.json();
        setNotifications(d.notifications || []);
        setUnreadCount(d.unreadCount || 0);
      }
    } catch {
      /* the badge count from /api/header is still correct */
    }
  }, []);

  // Fetch once on mount. We intentionally do NOT refetch on every navigation
  // (that added an Accelerate round-trip per click); focus + timer keep it fresh.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // Live refresh: tab refocus + timer (paused while tab hidden). 60s rather than
  // 30s — this is a badge, and halving the poll rate halves the baseline load
  // that every open tab in the system generates.
  useAutoRefresh(fetchData, { intervalMs: 60000 });
  // Pull-to-refresh anywhere in the app instantly re-pulls balance + notifications.
  useAppRefresh(fetchData);

  // ⌘K / Ctrl-K from anywhere in the app. The hint label is set on the client
  // because the platform is unknown during SSR and a mismatched <kbd> would
  // hydrate-error.
  useEffect(() => {
    if (typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShortcutHint("⌘ K");
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      {/* data-chrome marks this as a bar the feed may slide out of the way
        * while the reader scrolls down. Both this and the tab bar carry
        * `app-chrome`, so that class cannot say which is which. */}
      <header
        data-chrome="top"
        className="app-chrome sticky top-0 z-30 border-0 border-b border-(--shell-border) rounded-none safe-t"
      >
        {/* Seven controls in one row is what "crowded" meant: a logo, a search
            box, a theme toggle, a Reports link, a points pill, a bell and an
            avatar, all at the same weight. Two of them have moved (see the
            profile menu below) and the rest are now ranked by size rather than
            lined up as equals. */}
        <div className="flex h-16 items-center justify-between gap-2 px-3 sm:px-5 lg:px-8">
          {/* Left: Mobile Back + Menu Button & Logo (mobile only) */}
          <div className="flex items-center gap-0.5 md:hidden">
            {showBack && (
              <button
                onClick={() => router.back()}
                aria-label="Go back"
                className="app-tap app-press -ml-1.5 inline-flex items-center justify-center rounded-(--app-r-control) text-(--app-ink-2) hover:text-(--app-ink) hover:bg-(--shell-hover)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open menu"
              className={cn(
                "app-tap app-press inline-flex items-center justify-center rounded-(--app-r-control) text-(--app-ink-2) hover:text-(--app-ink) hover:bg-(--shell-hover)",
                !showBack && "-ml-1.5"
              )}
            >
              <Menu className="w-6 h-6" />
            </button>
            <Link href="/social" aria-label="Home" className="app-press flex items-center">
              <span className="app-icon app-icon-accent h-9 w-9 rounded-(--app-r-control)">
                <Sparkles className="w-4.5 h-4.5" />
              </span>
            </Link>
          </div>

          {/* Center/Left: Search.
              This was a bare <input> with no onChange, no form and no action —
              typing in it and pressing Enter did nothing, on every page, for
              every user. Meanwhile a complete search UI (GlobalSearch, backed by
              /api/search over tasks, users, courses and listings) existed and was
              mounted on exactly one page, /earn. The box is now the trigger for
              that same component: one search, reachable from the whole shell. */}
          <div className="hidden md:flex flex-1 max-w-md">
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="app-press app-tap-row group w-full flex items-center gap-3 pl-3.5 pr-2 py-2 bg-(--app-surface-2) border border-(--app-line) rounded-(--app-r-control) text-left hover:border-(--app-line-strong)"
            >
              <Search className="w-5 h-5 shrink-0 text-(--app-ink-3) group-hover:text-(--app-ink-3)" />
              <span className="t-body flex-1 min-w-0 truncate text-(--app-ink-3)">
                Search tasks, people, courses…
              </span>
              <kbd className="hidden xl:inline-block shrink-0 px-1.5 py-0.5 rounded-md border border-(--app-line) bg-(--app-surface) text-[10px] font-semibold text-(--app-ink-3)">
                {shortcutHint}
              </kbd>
            </button>
          </div>

          {/* Right: Actions.
              Was seven controls of equal weight. Now three, ranked:
              the balance (a figure, the biggest thing here), the bell, the
              avatar. `Reports` was a third link to /wallet in the same row as
              the points pill that already goes there, and the theme toggle is
              a preference rather than an action — both now live in the account
              menu, which is where a phone app puts them. */}
          <div className="flex items-center gap-0.5 sm:gap-1.5">
            {/* Search on phones. It had no entry point at all below 1024px —
                the box was `hidden lg:flex`, so the platform's search simply
                did not exist on a phone. */}
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Search"
              className="app-tap app-press md:hidden inline-flex items-center justify-center rounded-(--app-r-control) text-(--app-ink-2) hover:text-(--app-ink) hover:bg-(--shell-hover)"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Wallet balance — the one figure in the shell.
                ONE line, not two. A stacked 11px label over a 16px number has
                to fit 29px of text plus padding inside a 44px bar, and it read
                as squeezed. The number still leads: it is 16px/800 tabular and
                the unit beside it is 11px and muted, so the eye lands on the
                money rather than on "PTS". */}
            <Link
              href="/wallet"
              aria-label={`Wallet balance: ${walletBalance.toLocaleString()} points`}
              className="app-press app-tap-row hidden sm:flex items-center gap-2 px-3 rounded-(--app-r-control) bg-(--app-surface-2) border border-(--app-line) hover:border-(--app-line-strong)"
            >
              <Wallet className="w-4 h-4 shrink-0 text-(--app-ink-3)" />
              <span className="flex items-baseline gap-1">
                <span
                  key={tick}
                  className={cn(
                    "text-base font-extrabold tabular-nums tracking-tight text-(--app-ink)",
                    tick > 0 && "app-tick"
                  )}
                >
                  {walletBalance.toLocaleString()}
                </span>
                <span className="t-eyebrow text-(--app-ink-3)">PTS</span>
              </span>
            </Link>

            {streak > 0 && (
              <Link
                href="/daily-mission"
                aria-label={`Current streak: ${streak} ${
                  streak === 1 ? "day" : "days"
                }`}
                title={`${streak}-day streak`}
                className="app-press app-tap-row hidden md:inline-flex items-center gap-1.5 px-3 rounded-full bg-(--app-warn-soft) border border-(--app-warn-line) text-(--app-warn)"
              >
                <Flame className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span className="text-sm font-extrabold tabular-nums leading-none">
                  {streak}d
                </span>
                <span className="t-eyebrow hidden lg:inline">Streak</span>
              </Link>
            )}

            {/* Light/dark, back in the row.
                It was moved into the account menu to thin out a crowded header,
                but the owner went looking for it here and could not find it —
                and a control people reach for by reflex is one that has to be
                where the reflex goes. The menu row is gone so there is only one
                of them. */}
            <ThemeSwitch />

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => {
                  const opening = !isNotificationOpen;
                  setIsNotificationOpen(opening);
                  if (opening) void loadNotifications();
                  setIsProfileOpen(false);
                }}
                aria-label={
                  unreadCount > 0
                    ? `Notifications, ${unreadCount} unread`
                    : "Notifications"
                }
                className="app-tap app-press relative inline-flex items-center justify-center rounded-(--app-r-control) text-(--app-ink-2) hover:text-(--app-ink) hover:bg-(--shell-hover)"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-4.5 h-4.5 flex items-center justify-center px-1 text-[10px] font-extrabold text-(--app-on-accent) bg-(--app-badge) rounded-full ring-2 ring-(--shell-bg)">
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
                  {/* The header is h-16 PLUS its safe-area padding, so a flat
                      top-16 opened the panel under the bar on notched devices. */}
                  <div className="fixed inset-x-2 top-[calc(4rem+env(safe-area-inset-top))] sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-88 rounded-(--app-r-card) bg-(--app-surface) border border-(--app-line) shadow-(--app-e3) z-50 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-(--app-line)">
                      <h3 className="t-section text-(--app-ink)">Notifications</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="app-press app-tap-row inline-flex items-center gap-1.5 px-2.5 rounded-(--app-r-chip) t-meta font-semibold text-(--app-info) hover:bg-(--app-info-soft)"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-88 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-10 text-center text-(--app-ink-3)">
                          <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="t-body">No notifications</p>
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <Link
                            key={notif.id}
                            href="/notifications"
                            onClick={() => setIsNotificationOpen(false)}
                            className={cn(
                              "app-tap-row block px-4 py-3 border-b border-(--app-line) transition-colors hover:bg-(--app-surface-2)",
                              !notif.isRead && "bg-(--app-info-soft)"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              {!notif.isRead && (
                                <span className="w-2 h-2 mt-2 rounded-full shrink-0 bg-(--app-info)" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="t-card-title text-(--app-ink) truncate">
                                  {notif.title}
                                </p>
                                <p className="t-meta text-(--app-ink-3) mt-0.5 line-clamp-2">
                                  {notif.message}
                                </p>
                                <p className="t-meta text-(--app-ink-3) mt-1">
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
                      className="app-tap-row flex items-center justify-center px-4 t-body font-semibold text-(--app-info) hover:bg-(--app-info-soft) border-t border-(--app-line)"
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
                aria-label="Account menu"
                className="app-tap app-press flex items-center gap-1.5 px-1 rounded-(--app-r-control) hover:bg-(--shell-hover)"
              >
                <Avatar
                  src={avatar}
                  name={user.name || user.email}
                  size={32}
                />
                {level > 0 && (
                  <span className="app-chip hidden lg:inline-flex" aria-hidden>
                    LVL {level}
                  </span>
                )}
                <ChevronDown className="hidden sm:block w-4 h-4 text-(--app-ink-3)" />
              </button>

              {/* Dropdown Menu */}
              {isProfileOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsProfileOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1rem)] rounded-(--app-r-card) bg-(--app-surface) border border-(--app-line) shadow-(--app-e3) z-50 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-(--app-line)">
                      <Avatar src={avatar} name={user.name || user.email} size={40} />
                      <div className="min-w-0">
                        <p className="t-card-title text-(--app-ink) truncate">
                          {user.name || "User"}
                        </p>
                        <p className="t-meta text-(--app-ink-3) truncate">
                          {user.email}
                        </p>
                      </div>
                    </div>
                    <div className="p-1.5">
                      <Link
                        href="/profile"
                        onClick={() => setIsProfileOpen(false)}
                        className="app-nav-item app-press"
                      >
                        <User className="w-4.5 h-4.5 shrink-0" />
                        Profile
                      </Link>
                      {/* Moved here from the header row, where it was a third
                          control pointing at /wallet. Same destination, same
                          label, one less thing competing in the top bar. */}
                      <Link
                        href="/wallet"
                        onClick={() => setIsProfileOpen(false)}
                        className="app-nav-item app-press"
                      >
                        <FileText className="w-4.5 h-4.5 shrink-0" />
                        Reports &amp; Transactions
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setIsProfileOpen(false)}
                        className="app-nav-item app-press"
                      >
                        <Settings className="w-4.5 h-4.5 shrink-0" />
                        Settings
                      </Link>
                    </div>
                    {/* Light/dark also moved out of the header row. It is a
                        preference, not an action, and it kept a permanent slot
                        beside the things people press every day. Still one tap
                        from every screen — this menu is always in the bar. */}
                    <div className="border-t border-(--app-line) p-1.5">
                      <button
                        onClick={handleSignOut}
                        className="app-nav-item app-press w-full hover:text-(--app-out)"
                      >
                        <LogOut className="w-4.5 h-4.5 shrink-0" />
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

      {/* One shared search surface for the whole shell. */}
      <GlobalSearch open={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
}
