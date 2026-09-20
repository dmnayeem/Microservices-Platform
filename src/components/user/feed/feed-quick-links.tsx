"use client";

import Link from "next/link";
import {
  CalendarCheck,
  ListTodo,
  Store,
  Users,
  Trophy,
} from "lucide-react";
import { ScrollFadeRow } from "@/components/user/primitives/scroll-fade-row";

/**
 * The six places people actually go, sitting in the feed toolbar.
 *
 * The toolbar's left half was empty whenever Groups is off — the tab list hides
 * itself when one tab is not a choice — so the row that is always on screen,
 * always in reach, was carrying nothing. Meanwhile Daily Mission, Tasks, Wallet
 * and the rest were a drawer away on a phone.
 *
 * Icon-first and horizontally scrollable, like a mobile app's shortcut row,
 * rather than a second navigation menu: these are jumps, not a hierarchy. The
 * labels stay visible from `sm` up where there is room for them; below that the
 * icon carries it and the label is still in the accessible name.
 *
 * Wrapped in `ScrollFadeRow` so the edge fades while there is more to reach —
 * the same fix applied to every other scrolling row on the platform, because a
 * row that scrolls with no sign that it scrolls is a row whose right-hand items
 * nobody ever finds.
 */

/* Six shortcuts, ONE colour.
   This row is the exact thing the owner screenshotted: an amber Daily, an
   indigo Tasks, an emerald Market, a sky Wallet, a violet Team and a rose
   Ranks, six saturated hues in 300px, none of which carried any meaning — the
   colour was decoration assigned in the order the links were written. Squinting
   at it gave you six equally loud dots and no idea which one mattered.
   They are neutral now and read as one row of six peers, which is what they
   are; where you are is carried by the page you are on. */
const LINKS = [
  {
    href: "/daily-mission",
    label: "Mission",
    short: "Mission",
    icon: CalendarCheck,
  },
  { href: "/tasks", label: "Tasks", short: "Tasks", icon: ListTodo },
  {
    href: "/marketplace",
    label: "Marketplace",
    short: "Market",
    icon: Store,
  },
  { href: "/referrals", label: "My Team", short: "Team", icon: Users },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    short: "Ranks",
    icon: Trophy,
  },
] as const;

export function FeedQuickLinks({
  hidden = new Set<string>(),
  className = "",
}: {
  /**
   * Paths this user may not see. Page visibility is a per-user admin grant, so
   * a shortcut to a page they would be bounced off is worse than no shortcut —
   * it reads as the platform being broken rather than as a setting.
   */
  hidden?: Set<string>;
  className?: string;
}) {
  const visible = LINKS.filter((l) => !hidden.has(l.href));
  if (visible.length === 0) return null;

  return (
    <ScrollFadeRow className={`min-w-0 flex-1 ${className}`}>
      <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-1">
        {visible.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-label={l.label}
            title={l.label}
            // 44px, written on the element itself — the toolbar's other
            // controls match, and a shortcut row on a phone is pure tap target.
            // Each one is a filled chip with its own edge, not a bare icon on
            // the bar. Six unlabelled glyphs 4px apart read as one strip of
            // decoration — there is nothing to tell you where one target ends
            // and the next begins, which is exactly what "they stick together"
            // means. A surface plus a border draws the target; the padding and
            // the gap keep the targets apart.
            // The chip is a PHONE treatment. Six unlabelled glyphs 4px apart
            // read as one strip of decoration there, with nothing to say where
            // one target ends — so on a phone each gets its own surface and
            // edge. From `sm` up the toolbar also carries the sort control and
            // the panel handle, and six bordered chips beside those pushed the
            // row past its width. So the chrome drops away and it goes back to
            // plain text buttons, which is what fits.
            className="app-tap app-press inline-flex max-sm:flex-1 sm:shrink-0 items-center justify-center gap-1.5 rounded-(--app-r-chip) border border-(--app-line) bg-(--app-surface-2) px-0 text-xs font-bold text-(--app-ink) hover:border-(--app-accent-edge) hover:text-white sm:border-transparent sm:bg-transparent sm:px-2.5 sm:text-(--app-ink-2) sm:hover:border-transparent sm:hover:bg-(--app-surface-2) sm:hover:text-white"
          >
            <l.icon className="h-4.5 w-4.5 shrink-0" />
            <span className="hidden sm:inline">{l.short}</span>
          </Link>
        ))}
      </div>
    </ScrollFadeRow>
  );
}
