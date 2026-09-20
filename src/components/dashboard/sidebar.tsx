"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  ClipboardPlus,
  ShoppingBag,
  ArrowUpRight,
  HelpCircle,
  Bell,
  CreditCard,
  Receipt,
  Handshake,
  Coins,
  Rocket,
  Bookmark,
  Search,
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
  /** Extra words the filter box matches on (never rendered). */
  keywords?: string;
};

/* ── Navigation ────────────────────────────────────────────────────────────
   32 destinations. Nothing was removed — everything that was reachable is
   still reachable — but the groups now answer "what am I trying to DO?"
   instead of listing things in the order they were built. Before, "Main" held
   Courses and Marketplace (browsing surfaces), "Grow" held Lottery and
   Browse & Earn (both are earning), and "Marketing" held Add Funds (money).
   A group you can't predict the contents of is the same as no group at all,
   which is most of what "cluttered" means here.

   `keywords` exist only for the filter box: they are the words a user actually
   types for a page whose label is jargon ("cash out" → Withdrawal, "refer" →
   My Team). */
type Group = { section: string; items: NavItem[] };

const navigationGroups: Group[] = [
  {
    section: "Main",
    items: [
      { name: "Home", href: "/social", icon: Home, keywords: "feed social posts" },
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, keywords: "overview stats" },
      { name: "Wallet", href: "/wallet", icon: Wallet, keywords: "balance points money" },
      { name: "Saved", href: "/saved", icon: Bookmark, keywords: "bookmarks" },
      { name: "Leaderboard", href: "/leaderboard", icon: Trophy, keywords: "ranking top" },
    ],
  },
  {
    section: "Earn & Work",
    items: [
      { name: "Daily Mission", href: "/daily-mission", icon: Target, feature: "dailyMission", keywords: "today checklist streak" },
      // Distinct from Daily Mission on purpose: daily = today's checklist,
      // Missions = long-run big-prize goals. Both feed off one progress engine.
      { name: "Missions", href: "/missions", icon: Rocket, keywords: "goals prizes" },
      { name: "Tasks", href: "/tasks", icon: ListTodo, feature: "tasks", keywords: "jobs work offers" },
      { name: "Board Tasks", href: "/board-tasks", icon: Pin, feature: "tasks", keywords: "pinned board" },
      { name: "Browse & Earn", href: "/watch-ads", icon: Coins, keywords: "watch ads passive cpm" },
      { name: "Quiz Games", href: "/quizzes", icon: Brain, keywords: "trivia questions" },
      { name: "Games", href: "/games", icon: Gamepad2, feature: "games", keywords: "play arcade" },
      { name: "Events", href: "/events", icon: Sparkles, keywords: "campaign limited" },
      { name: "Lottery", href: "/lottery", icon: Ticket, feature: "lottery", keywords: "raffle draw ticket" },
    ],
  },
  {
    section: "Learn & Shop",
    items: [
      { name: "Courses", href: "/courses", icon: GraduationCap, feature: "courses", keywords: "learn lessons lms" },
      { name: "My Learning", href: "/my-learning", icon: GraduationCap, feature: "courses", keywords: "enrolled progress certificate" },
      { name: "Marketplace", href: "/marketplace", icon: Store, feature: "marketplace", keywords: "buy sell shop products" },
    ],
  },
  {
    section: "Network & Grow",
    items: [
      { name: "My Team", href: "/referrals", icon: Users, feature: "referrals", keywords: "referral refer invite downline" },
      { name: "Affiliate", href: "/affiliate", icon: Handshake, keywords: "commission partner links" },
      { name: "Milestones", href: "/milestones", icon: Target, keywords: "progress rewards" },
      { name: "Achievements", href: "/achievements", icon: Award, keywords: "badges trophies" },
    ],
  },
  {
    section: "Promote",
    items: [
      { name: "Create Ad", href: "/advertiser", icon: Briefcase, feature: "advertiser", keywords: "advertise campaign banner" },
      // `/create-task` had no navigation entry anywhere in the app. A user
      // granted `createTasks` could only reach it from the link inside a task
      // approval notification — so the permission worked and the page was
      // effectively unreachable.
      { name: "Create Task", href: "/create-task", icon: ClipboardPlus, feature: "createTasks", keywords: "post job hire" },
    ],
  },
  {
    section: "Account & Admin",
    items: [
      { name: "Add Funds", href: "/deposit", icon: CreditCard, keywords: "deposit top up recharge pay" },
      { name: "Withdrawal", href: "/withdrawal", icon: ArrowUpRight, feature: "withdrawals", keywords: "cash out payout redeem" },
      { name: "Transactions", href: "/transactions", icon: Receipt, keywords: "history statement ledger" },
      { name: "Packages", href: "/packages", icon: Package, keywords: "plans upgrade subscription" },
      { name: "My Package", href: "/my-package", icon: Package, keywords: "current plan subscription" },
      { name: "Notifications", href: "/notifications", icon: Bell, keywords: "alerts" },
      { name: "Chat", href: "/chat", icon: MessageSquare, keywords: "messages dm inbox" },
      { name: "Help", href: "/support", icon: HelpCircle, keywords: "support contact ticket faq" },
      { name: "Settings", href: "/settings", icon: Settings, keywords: "preferences account theme privacy" },
    ],
  },
];

/* Modes you switch INTO, pinned below the main nav. These were three
   near-identical 30-line blocks differing only in a colour; one descriptor
   means they can never drift apart again. */
type ModeSection = {
  section: string;
  items: NavItem[];
};

const adminNavigation = [
  { name: "Admin Panel", href: "/admin", icon: Shield },
];

const tutorNavigation = [
  { name: "Tutor Hub", href: "/tutor/dashboard", icon: GraduationCap },
];

// Same shape as the admin and tutor entries above: a mode you switch INTO,
// pinned below the main nav rather than buried inside it, because a buyer's
// work is a different job from earning and mixing them makes both harder to
// scan. Gated on the `createTasks` capability, not a role.
const buyerNavigation = [
  { name: "Buyer Hub", href: "/buyer", icon: ShoppingBag },
  { name: "Buy Credit", href: "/buy-points", icon: Sparkles },
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
  const modeSections: ModeSection[] = [];
  if (isTutor(user.role as UserRole | undefined)) {
    modeSections.push({ section: "Teaching", items: tutorNavigation });
  }
  if (features?.includes("createTasks") && !hidden.has("/buyer")) {
    modeSections.push({ section: "Buying", items: buyerNavigation });
  }
  if (isAdmin(user.role as UserRole | undefined)) {
    modeSections.push({ section: "Administration", items: adminNavigation });
  }

  const groups = navigationGroups
    .map((g) => ({ ...g, items: g.items.filter(visible).filter(matches) }))
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
          <span className="app-icon app-icon-accent h-9 w-9 rounded-(--app-r-control)">
            <Sparkles className="w-4.5 h-4.5" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-(--app-ink)">
            EarnGPT
          </span>
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
          <div key={group.section}>
            <p className="t-eyebrow px-3 mb-2 text-(--app-ink-3)">{group.section}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.name}>
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
                  <li key={item.name}>
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
          />
        </div>
      </div>
    </>
  );
}
