"use client";

import { BrandLockup, BrandMark } from "@/components/providers/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNavCounts, badgeText } from "@/hooks/use-nav-counts";
import { useState } from "react";
import { Avatar } from "@/components/user/primitives/avatar";
import {
  Sparkles,
  LogOut,
  X,
  Shield,
  GraduationCap,
  ShoppingBag,
  Search,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useMobileNav } from "@/lib/stores/mobile-nav-store";
import { isPathHidden } from "@/lib/page-visibility";
import { cn } from "@/lib/utils";
import { isAdmin, isTutor, type UserRole } from "@/lib/rbac";
import {
  DEFAULT_SIDEBAR,
  visibleFor,
  isExternalHref,
  type SidebarConfig,
  type SidebarModeKind,
} from "@/lib/nav-config";
import { navIcon } from "@/lib/nav-icons";

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
  /** The admin-edited menu (Settings → Navigation → Sidebar), normalised. */
  menu?: SidebarConfig;
}

type NavItem = {
  id: string;
  name: string;
  href: string;
  icon: LucideIcon;
  feature?: string;
  /** Extra words the filter box matches on (never rendered). */
  keywords?: string;
};

/* ── Navigation ────────────────────────────────────────────────────────────
   The menu is admin-edited now (Settings → Navigation → Sidebar); its default,
   in `nav-config.ts` (DEFAULT_SIDEBAR), is the list that used to live here —
   32 destinations grouped by "what am I trying to DO?" rather than the order
   they were built in.

   `keywords` exist only for the filter box: they are the words a user actually
   types for a page whose label is jargon ("cash out" → Withdrawal, "refer" →
   My Team). */
type Group = { section: string; items: NavItem[] };

/* Modes you switch INTO, pinned below the main nav. These were three
   near-identical 30-line blocks differing only in a colour; one descriptor
   means they can never drift apart again. */
type ModeSection = {
  section: string;
  items: NavItem[];
};

const adminNavigation: NavItem[] = [
  { id: "mode-admin", name: "Admin Panel", href: "/admin", icon: Shield },
];

const tutorNavigation: NavItem[] = [
  { id: "mode-tutor", name: "Tutor Hub", href: "/tutor/dashboard", icon: GraduationCap },
];

// Same shape as the admin and tutor entries above: a mode you switch INTO,
// pinned below the main nav rather than buried inside it, because a buyer's
// work is a different job from earning and mixing them makes both harder to
// scan. Gated on the `createTasks` capability, not a role.
const buyerNavigation: NavItem[] = [
  { id: "mode-buyer", name: "Buyer Hub", href: "/buyer", icon: ShoppingBag },
  { id: "mode-buy-points", name: "Buy Credit", href: "/buy-points", icon: Sparkles },
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
  menu: SidebarConfig;
}

function SidebarContent({ user, pathname, onNavigate, onSignOut, features, hiddenPaths, avatar, menu }: SidebarContentProps) {
  // What is still waiting on these pages, like the notification bell's count:
  // it goes down as the user completes tasks and claims rewards.
  const navCounts = useNavCounts();
  const countFor: Record<string, number> = {
    "/daily-mission": navCounts.dailyMission,
    "/missions": navCounts.missions,
    "/events": navCounts.events,
    "/lottery": navCounts.lottery,
  };
  // Segment-prefix match, same as the route guards: hiding "/tutor" also
  // drops "/tutor/courses" from the Teaching section.
  const visible = (item: NavItem) => visibleFor([item], features, hiddenPaths).length > 0;

  // "Hard to find things" in a 32-entry rail is a search problem, not a
  // hierarchy problem — grouping helps you scan, it does not help you jump.
  // Typing here filters every group at once and matches synonyms as well as
  // labels, so "cash out" finds Withdrawal.
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const matches = (item: NavItem) =>
    !q ||
    item.name.toLowerCase().includes(q) ||
    (item.keywords?.includes(q) ?? false) ||
    item.href.includes(q);

  // The three mode sections used to carry a hue each — Teaching indigo,
  // Buying emerald, Administration red — so a rail that already had a violet
  // avatar and an indigo active row showed four accent colours at once, none of
  // which meant anything. They are one neutral list now; the section heading is
  // what tells them apart, which is the job a heading has.
  //
  // Their gates are fixed here; the admin only renames and reorders them.
  const modeItems: Record<SidebarModeKind, NavItem[]> = {
    teaching: isTutor(user.role as UserRole | undefined)
      ? tutorNavigation.filter(visible)
      : [],
    buying:
      features?.includes("createTasks") && !isPathHidden("/buyer", hiddenPaths)
        ? buyerNavigation.filter(visible)
        : [],
    admin: isAdmin(user.role as UserRole | undefined) ? adminNavigation : [],
  };
  const modeSections: ModeSection[] = menu.modes
    .map((m) => ({ section: m.title, items: modeItems[m.kind] }))
    .filter((m) => m.items.length > 0);

  // The admin's sections: items switched off in the editor never render, and
  // visibility (hidden pages, missing features) still wins over the menu.
  const groups: Group[] = menu.sections
    .map((sec) => ({
      section: sec.title,
      items: visibleFor(
        sec.items.filter((i) => i.visible),
        features,
        hiddenPaths
      )
        .map(
          (i): NavItem => ({
            id: i.id,
            name: i.label,
            href: i.href,
            icon: navIcon(i.icon),
            feature: i.feature,
            keywords: i.keywords,
          })
        )
        .filter(matches),
    }))
    .filter((g) => g.items.length > 0);
  const noResults = q.length > 0 && groups.length === 0;

  return (
    <>
      {/* Logo.
          The wordmark was `bg-clip-text` over indigo-400 → purple-400. On the
          WHITE light-mode rail that is pale indigo on white: 2.4:1, under the
          4.5:1 floor, on the one piece of text that names the product. The mark
          keeps the gradient (it is a shape, and it is one of the three places
          the gradient is allowed); the word is now solid foreground. */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5 border-b border-(--shell-border)">
        <Link href="/social" className="app-press flex items-center gap-2.5">
          <BrandLockup area="app">
            <span className="app-icon app-icon-accent h-9 w-9 rounded-(--app-r-control)">
              <BrandMark iconClassName="w-4.5 h-4.5" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-(--app-ink)">
              RevType
            </span>
          </BrandLockup>
        </Link>
      </div>

      {/* User Info */}
      <div className="px-3 py-3 border-b border-(--shell-border)">
        <Link
          href="/profile"
          onClick={onNavigate}
          aria-current={pathname.startsWith("/profile") ? "page" : undefined}
          aria-label="Open profile"
          className={cn(
            "app-press flex items-center gap-3 p-2 rounded-(--app-r-control) transition-colors",
            pathname.startsWith("/profile")
              ? "bg-(--app-nav-wash)"
              : "hover:bg-(--shell-hover)"
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
                "t-card-title truncate",
                pathname.startsWith("/profile")
                  ? "text-(--app-accent-ink)"
                  : "text-(--app-ink)"
              )}
            >
              {user.name || "User"}
            </p>
            <p className="t-meta text-(--app-ink-3) truncate">{user.email}</p>
          </div>
        </Link>
      </div>

      {/* Filter — the shell's "find a page" affordance. */}
      <div className="px-3 pt-3 pb-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-(--app-ink-3)" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter menu…"
            aria-label="Filter navigation"
            className="app-tap-row w-full pl-10 pr-10 py-2 rounded-(--app-r-control) bg-(--app-surface-2) border border-(--app-line) text-sm text-(--app-ink) placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge) focus:ring-1 focus:ring-(--app-accent-edge)"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label="Clear filter"
              className="app-press absolute right-1 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-(--app-r-chip) text-(--app-ink-3) hover:text-(--app-ink) hover:bg-(--shell-hover)"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      {/* Navigation.
          Every row is `app-nav-item`: one 44px definition, one active state
          (soft brand fill plus the gradient rail, drawn by the class off
          `aria-current`, so the marker can never drift from the ARIA state the
          way a separately-rendered `<span>` could). Icons are 18px and inherit
          the row's colour — they were 16px and, in the mode sections, three
          different hues. */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {noResults && (
          <p className="px-3 py-6 t-body text-(--app-ink-3) text-center">
            Nothing matches “{filter}”.
          </p>
        )}
        {groups.map((group) => (
          <div key={group.section + group.items[0].id}>
            <p className="t-eyebrow px-3 mb-2 text-(--app-ink-3)">{group.section}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      {...(isExternalHref(item.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      className="app-nav-item app-press"
                    >
                      <item.icon className="w-4.5 h-4.5 shrink-0" />
                      <span className="min-w-0 truncate">{item.name}</span>
                      {(countFor[item.href] ?? 0) > 0 && (
                        <span
                          aria-label={`${countFor[item.href]} waiting`}
                          className="ml-auto shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-(--app-badge) text-(--app-on-accent) text-[10px] font-extrabold leading-5 text-center"
                        >
                          {badgeText(countFor[item.href])}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Modes: Teaching / Buying / Administration. One loop — these were
          three copies of the same 30 lines that differed only in a colour. */}
      {!q &&
        modeSections.map((mode) => (
          <div
            key={mode.section}
            className="border-t border-(--shell-border) px-3 py-3"
          >
            <p className="t-eyebrow px-3 mb-2 text-(--app-ink-3)">{mode.section}</p>
            <ul className="space-y-0.5">
              {mode.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      className="app-nav-item app-press"
                    >
                      <item.icon className="w-4.5 h-4.5 shrink-0" />
                      <span className="min-w-0 truncate">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

      {/* Sign Out Button */}
      <div className="border-t border-(--shell-border) px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button
          onClick={onSignOut}
          className="app-nav-item app-press w-full hover:text-(--app-out)"
        >
          <LogOut className="w-4.5 h-4.5 shrink-0" />
          Sign Out
        </button>
      </div>
    </>
  );
}

export function Sidebar({ user, features, hiddenPaths, avatar, menu = DEFAULT_SIDEBAR }: SidebarProps) {
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
      {/* Phone drawer overlay. `md:hidden` everywhere below, because from 768px
          up the rail is permanently on screen and a drawer would be a second,
          contradictory way to navigate. */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Phone drawer */}
      <div
        className={cn(
          "app-chrome app-sheet fixed inset-y-0 left-0 z-50 w-[min(20rem,85vw)] rounded-none transform md:hidden",
          "pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)]",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        // The drawer is in the DOM at all times so it can transition; hidden
        // from assistive tech and from Tab order while it is off-screen.
        inert={!isMobileOpen}
        aria-hidden={!isMobileOpen}
      >
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
          className="app-tap app-press absolute top-3 right-3 z-10 inline-flex items-center justify-center rounded-(--app-r-control) text-(--app-ink-2) hover:text-(--app-ink) hover:bg-(--shell-hover)"
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
            menu={menu}
          />
        </div>
      </div>

      {/* Persistent rail — tablet AND laptop.
          It used to start at `lg` (1024px), so every tablet in portrait got the
          phone layout: a hamburger, a drawer and a bottom tab bar on a 768–1023px
          screen with 250px of empty gutter on each side of the content. From
          `md` the rail is simply always there (256px, widening to 288px at `lg`),
          which is what a tablet app does — and the bottom bar and hamburger turn
          off at the same breakpoint so there is exactly one navigation model at
          every width. */}
      <div className="hidden md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex md:w-[280px] md:flex-col pl-[env(safe-area-inset-left)]">
        <div className="app-sidebar app-chrome flex flex-col h-full rounded-none border-0 border-r border-(--shell-border)">
          <SidebarContent
            user={user}
            pathname={pathname}
            onNavigate={handleNavigate}
            onSignOut={handleSignOut}
            features={features}
            hiddenPaths={hiddenPaths}
            avatar={avatar}
            menu={menu}
          />
        </div>
      </div>
    </>
  );
}
