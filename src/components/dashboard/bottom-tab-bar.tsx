"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Home, ListTodo, Wallet, Target, Menu } from "lucide-react";
import { useNavCounts, badgeText } from "@/hooks/use-nav-counts";
import { cn } from "@/lib/utils";
import { useMobileNav } from "@/lib/stores/mobile-nav-store";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { haptic } from "@/lib/haptics";

/**
 * The bar's measured height, in px, on <html>. Anything that has to sit above
 * the phone nav reads this instead of guessing.
 */
const NAV_HEIGHT_VAR = "--bottom-nav-h";

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

/** App-style fixed bottom navigation for phones (hidden from md up, where
 *  the persistent rail takes over). */
export function BottomTabBar({
  features,
  hiddenPaths,
}: {
  features?: string[];
  hiddenPaths?: string[];
}) {
  const pathname = usePathname();
  const setMenuOpen = useMobileNav((s) => s.setOpen);
  // Daily mission's count sits on its own tab; missions and events live in the
  // menu, so the menu button carries a dot for them (its number is already
  // the unread-notification count, and one badge must mean one thing).
  const navCounts = useNavCounts();
  const menuHasGoals = navCounts.missions + navCounts.events + navCounts.lottery > 0;
  const [unread, setUnread] = useState(0);
  // This bar is `md:hidden` — above that it's not visible, so skip its poll
  // entirely (the Header already polls notifications). Halves the poll volume
  // for every desktop user instead of duplicating it.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Must track the same breakpoint the bar renders at, or the poll runs
    // for tablet and desktop users who cannot see the badge it feeds.
    const mq = window.matchMedia("(max-width: 767px)");
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

  const navRef = useRef<HTMLElement | null>(null);
  const hidden = new Set(hiddenPaths ?? []);
  const tabs = TABS.filter(
    (t) =>
      (!("feature" in t) || !features || features.includes(t.feature)) &&
      !hidden.has(t.href)
  );

  /**
   * Publish this bar's real height so anything sitting above it can clear it
   * exactly.
   *
   * Callers used to hard-code 3.5rem, from the tabs' `min-h-14`. That number
   * is only ever approximately right: the safe-area inset differs per device,
   * the labels reflow at large text sizes, and the raised Home button and the
   * top border add to it. Being a few pixels short puts the bottom of whatever
   * is above — the task screen's Submit button, for one — underneath a z-40
   * nav, where it cannot be tapped.
   *
   * Measured, like the anchor ad does, rather than assumed. At `md` the bar is
   * `display: none`, so the measurement is 0 there and desktop layouts get
   * their space back with no breakpoint logic of their own.
   */
  useEffect(() => {
    const root = document.documentElement;
    const el = navRef.current;
    if (!el) return;
    const sync = () => {
      // Measured from the highest point the bar actually occupies, not from
      // its own box.
      //
      // The primary tab is pulled up out of the bar with `-mt-5`, so it floats
      // above it — and `offsetHeight` does not know about a child that
      // overflows upward. Anything clearing the nav by that number was still
      // sitting under the raised button: on the feed it covered the like and
      // comment row of whichever post landed at the bottom of the screen.
      const rect = el.getBoundingClientRect();
      let top = rect.top;
      for (const child of el.querySelectorAll("*")) {
        const r = (child as HTMLElement).getBoundingClientRect();
        if (r.height > 0 && r.top < top) top = r.top;
      }
      const height = Math.max(0, Math.round(window.innerHeight - top));
      root.style.setProperty(NAV_HEIGHT_VAR, `${height}px`);
    };
    sync();
    const obs = new ResizeObserver(sync);
    obs.observe(el);
    // The measurement is relative to the viewport now, so it has to be redone
    // when the viewport moves — a rotation, or a mobile browser's toolbar
    // sliding away, changes `innerHeight` without resizing the bar.
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      root.style.setProperty(NAV_HEIGHT_VAR, "0px");
    };
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label="Primary"
      data-chrome="bottom"
      className="app-chrome app-chrome-bar md:hidden fixed bottom-0 inset-x-0 z-40 rounded-none border-0 border-t border-(--shell-bar-border)"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
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
              aria-current={activeTab ? "page" : undefined}
              className={cn(
                // min-h-14 (56px) rather than whatever the content happened to
                // add up to — a tab bar row is the most-tapped target in the
                // app and it must not depend on the label's line height.
                "app-press relative flex flex-col items-center justify-center gap-1 min-h-14 py-2 text-[11px] font-bold tracking-tight",
                activeTab ? "text-(--app-accent-ink)" : "text-(--app-ink-3)"
              )}
            >
              {/* Which tab you are on was carried by colour alone (indigo
                  text) — a 1px hue change on a 10px label, at the bottom of
                  the screen, in a hurry. A bar above the tab is what a native
                  tab bar uses and what people actually see. It is painted with
                  `--app-rail`, the light end of the brand ramp: the 600-step
                  gradient the buttons use measures 2.84:1 against the dark bar,
                  and a 2px indicator with nothing written on it has to clear
                  3:1 on its own. */}
              {activeTab && !primary && (
                <span
                  aria-hidden
                  className="absolute top-0 h-0.5 w-9 rounded-full bg-(image:--app-rail)"
                />
              )}
              {primary ? (
                // Centre Home: the one gradient in the tab bar, lifted out of
                // the row so it is unmistakably the primary destination.
                <span
                  className={cn(
                    "flex items-center justify-center w-14 h-14 rounded-(--app-r-panel) transition-all -mt-5",
                    activeTab
                      ? "app-accent app-accent-glow"
                      : "bg-(--app-surface-2) text-(--app-ink-2) border border-(--app-line)"
                  )}
                >
                  <tab.icon className="w-6 h-6" />
                </span>
              ) : (
                <span className="relative">
                  <tab.icon className="w-5.5 h-5.5" />
                  {tab.href === "/daily-mission" && navCounts.dailyMission > 0 && (
                    <span
                      aria-label={`${navCounts.dailyMission} left today`}
                      className="absolute -top-1.5 -right-2 px-1 min-w-4.5 h-4.5 rounded-full bg-(--app-badge) text-(--app-on-accent) text-[10px] font-extrabold leading-4.5 text-center ring-2 ring-(--shell-bar-bg)"
                    >
                      {badgeText(navCounts.dailyMission)}
                    </span>
                  )}
                </span>
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
          aria-label={unread > 0 ? `Open menu, ${unread} unread` : "Open menu"}
          className="app-press flex flex-col items-center justify-center gap-1 min-h-14 py-2 text-[11px] font-bold tracking-tight text-(--app-ink-3)"
        >
          <span className="relative">
            <Menu className="w-5.5 h-5.5" />
            {unread > 0 ? (
              <span className="absolute -top-1.5 -right-2 px-1 min-w-4.5 h-4.5 rounded-full bg-(--app-badge) text-(--app-on-accent) text-[10px] font-extrabold leading-4.5 text-center ring-2 ring-(--shell-bar-bg)">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : (
              menuHasGoals && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-(--app-badge) ring-2 ring-(--shell-bar-bg)"
                />
              )
            )}
          </span>
          Menu
        </button>
      </div>
    </nav>
  );
}
