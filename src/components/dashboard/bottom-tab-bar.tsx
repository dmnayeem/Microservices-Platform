"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Home, ListTodo, Wallet, Target, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileNav } from "@/lib/stores/mobile-nav-store";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { haptic } from "@/lib/haptics";

// Left → right: two smaller page tabs, the bigger center Home, then Wallet + Menu.
const TABS = [
  { name: "Mission", href: "/daily-mission", icon: Target, feature: "dailyMission" },
  { name: "Tasks", href: "/tasks", icon: ListTodo, feature: "tasks" },
  { name: "Home", href: "/social", icon: Home, primary: true },
  { name: "Wallet", href: "/wallet", icon: Wallet },
] as const;

const GRID_COLS: Record<number, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

/** App-style fixed bottom navigation for mobile (hidden on lg+). */
export function BottomTabBar({
  features,
  hiddenPaths,
}: {
  features?: string[];
  hiddenPaths?: string[];
}) {
  const pathname = usePathname();
  const setMenuOpen = useMobileNav((s) => s.setOpen);
  const [unread, setUnread] = useState(0);
  // This bar is `lg:hidden` — on desktop it's not visible, so skip its poll
  // entirely (the Header already polls notifications). Halves the poll volume
  // for every desktop user instead of duplicating it.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Fetch unread on mount + on focus/timer (not on every navigation).
  // /api/header is two indexed reads; /api/notifications ran three queries
  // (including a findMany) just to read a count off the response.
  const loadUnread = useCallback(async () => {
    try {
      const r = await fetch("/api/header", {
        cache: "no-store",
      });
      const d = await r.json();
      setUnread(d.unreadCount || 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUnread();
  }, [loadUnread, isMobile]);

  useAutoRefresh(loadUnread, { enabled: isMobile, intervalMs: 60000 });

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const hidden = new Set(hiddenPaths ?? []);
  const tabs = TABS.filter(
    (t) =>
      (!("feature" in t) || !features || features.includes(t.feature)) &&
      !hidden.has(t.href)
  );

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass-strong rounded-none border-0 border-t border-gray-800/70"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className={cn(
          "grid items-center",
          GRID_COLS[tabs.length + 1] ?? "grid-cols-5"
        )}
      >
        {tabs.map((tab) => {
          const activeTab = isActive(tab.href);
          const primary = "primary" in tab && tab.primary;
          return (
            <Link
              key={tab.name}
              href={tab.href}
              onClick={() => haptic("light")}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-transform active:scale-95",
                activeTab ? "text-indigo-400" : "text-gray-400"
              )}
            >
              {primary ? (
                // Center Home: bigger icon inside a subtle rounded highlight.
                <span
                  className={cn(
                    "flex items-center justify-center w-12 h-12 rounded-2xl transition-all -mt-4 border border-gray-800",
                    activeTab
                      ? "bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/30 border-transparent"
                      : "bg-gray-900 text-gray-300"
                  )}
                >
                  <tab.icon className="w-6 h-6" />
                </span>
              ) : (
                <tab.icon className="w-5 h-5" />
              )}
              <span className={cn(primary && "mt-0.5")}>{tab.name}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => {
            haptic("light");
            setMenuOpen(true);
          }}
          className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-gray-400 transition-transform active:scale-95"
        >
          <span className="relative">
            <Menu className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1 min-w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold leading-4 text-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </span>
          Menu
        </button>
      </div>
    </nav>
  );
}
