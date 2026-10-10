/**
 * Admin-editable navigation: the phone tab bar, the header, the sidebar menu
 * (and, through `feed-quick-earn.ts`, the Quick Earn tiles).
 *
 * Every default below is EXACTLY what was hard-coded in the components before
 * this existed, so nothing a user sees changes until an admin saves something.
 * A missing, empty or malformed setting falls back to these defaults.
 *
 * What the admin can NOT change is who may see a link. Each surface still
 * drops an item whose page is hidden for the user (`isPathHidden`) or whose
 * feature the user lacks, and the role/capability-gated sidebar sections
 * (Teaching, Buying, Administration) keep their gates — only their title and
 * order are editable.
 *
 * Client-safe: no prisma, no lucide (icons are keys, see nav-icon-keys.ts).
 */
import { FEATURE_KEYS } from "@/lib/features";
import { isNavIconKey } from "@/lib/nav-icon-keys";
import { isPathHidden } from "@/lib/page-visibility";

export const NAV_KEYS = {
  quickEarn: "feed.quick_earn_tiles",
  bottomTabs: "nav.bottom_tabs",
  header: "nav.header_items",
  sidebar: "nav.sidebar",
} as const;

export const NAV_SETTING_KEYS: readonly string[] = Object.values(NAV_KEYS);

// ── Links ────────────────────────────────────────────────────────────────────

/** One destination on any nav surface. `feature` hides it from users without it. */
export interface NavLink {
  id: string;
  label: string;
  href: string;
  icon: string;
  feature?: string;
}

const FEATURE_SET: ReadonlySet<string> = new Set(FEATURE_KEYS);

export function isExternalHref(href: string): boolean {
  return /^https:\/\//i.test(href);
}

/**
 * A link target is either an in-app path ("/tasks", "/u/alice?tab=x") or an
 * https URL. Returns an error message, or null when it is fine.
 */
export function hrefProblem(href: unknown): string | null {
  if (typeof href !== "string" || !href.trim()) return "is missing a page";
  const h = href.trim();
  if (h.length > 300) return "has a link longer than 300 characters";
  if (/\s/.test(h)) return "has a link with spaces in it";
  if (h.startsWith("/")) {
    if (h.startsWith("//")) return "has a link starting with // (use https://…)";
    return null;
  }
  if (isExternalHref(h)) {
    try {
      const u = new URL(h);
      return u.hostname ? null : "has an invalid https link";
    } catch {
      return "has an invalid https link";
    }
  }
  return 'must link to an in-app page starting with "/" or an https:// address';
}

/**
 * Plan switches for pages whose menu items (in menus saved before the switch
 * existed) carry no `feature` — derived from the link instead.
 */
const HREF_FEATURE: [string, string][] = [
  ["/watch-ads", "browseEarn"],
  ["/cpa", "cpa"],
  ["/events", "events"],
  ["/missions", "missions"],
  ["/quizzes", "quizGames"],
  ["/board-tasks", "boards"],
  ["/leaderboard", "leaderboard"],
  ["/chat", "chat"],
  ["/groups", "groups"],
  ["/affiliate", "affiliate"],
];
function featureOf(i: { href: string; feature?: string }): string | undefined {
  if (i.feature) return i.feature;
  return HREF_FEATURE.find(([h]) => i.href === h || i.href.startsWith(`${h}/`))?.[1];
}

/** Items the user may see: page not hidden, feature held. */
export function visibleFor<T extends { href: string; feature?: string }>(
  items: readonly T[],
  features: readonly string[] | undefined,
  hiddenPaths: readonly string[] | undefined
): T[] {
  return items.filter(
    (i) =>
      (!featureOf(i) || !features || features.includes(featureOf(i)!)) &&
      (isExternalHref(i.href) || !isPathHidden(i.href, hiddenPaths))
  );
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function cleanFeature(v: unknown): string | undefined {
  return typeof v === "string" && FEATURE_SET.has(v) ? v : undefined;
}

function cleanId(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v.trim().slice(0, 64) : "";
  return s || fallback;
}

// ── Bottom tab bar ───────────────────────────────────────────────────────────

export const BOTTOM_TAB_SLOTS = 4;
export const BOTTOM_TAB_LABEL_MAX = 12;

export interface BottomTab extends NavLink {
  /** The big raised button. Exactly one tab carries it. */
  primary: boolean;
}

/** Today's bar, left to right. The fixed Menu button always follows. */
export const DEFAULT_BOTTOM_TABS: BottomTab[] = [
  { id: "tab-mission", label: "Mission", href: "/daily-mission", icon: "target", feature: "dailyMission", primary: false },
  { id: "tab-tasks", label: "Tasks", href: "/tasks", icon: "listTodo", feature: "tasks", primary: false },
  { id: "tab-home", label: "Home", href: "/social", icon: "home", primary: true },
  { id: "tab-wallet", label: "Wallet", href: "/wallet", icon: "wallet", primary: false },
];

export function normalizeBottomTabs(raw: unknown): BottomTab[] {
  if (!Array.isArray(raw) || raw.length !== BOTTOM_TAB_SLOTS) return DEFAULT_BOTTOM_TABS;
  const out: BottomTab[] = [];
  for (const [i, item] of raw.entries()) {
    const r = (item ?? {}) as Record<string, unknown>;
    const label = str(r.label, BOTTOM_TAB_LABEL_MAX);
    const href = str(r.href, 300);
    if (!label || hrefProblem(href)) return DEFAULT_BOTTOM_TABS;
    out.push({
      id: cleanId(r.id, `tab-${i}`),
      label,
      href,
      icon: isNavIconKey(r.icon) ? r.icon : "zap",
      feature: cleanFeature(r.feature),
      primary: r.primary === true,
    });
  }
  // Exactly one primary: the first flagged one, else the third slot (today's).
  const first = out.findIndex((t) => t.primary);
  const keep = first === -1 ? 2 : first;
  return out.map((t, i) => ({ ...t, primary: i === keep }));
}

// ── Header ───────────────────────────────────────────────────────────────────

/**
 * The controls in the header's right-hand cluster, in the order they render.
 *
 * Not in this list, because they cannot move or go:
 *  - the account (avatar) menu — always last. It holds Profile, Settings and
 *    Sign Out; on a phone it is the only Sign Out outside the drawer.
 *  - the phone's back arrow, hamburger and logo on the left.
 *
 * `notifications` is in the list (it can be moved) but cannot be hidden: the
 * bell is the only live unread count on a tablet or desktop, and its dropdown
 * is where "Mark all read" lives.
 */
export type HeaderItemKind =
  | "search"
  | "wallet"
  | "streak"
  | "theme"
  | "notifications"
  | "shortcut";

export const HEADER_BUILTINS: readonly {
  kind: Exclude<HeaderItemKind, "shortcut">;
  label: string;
  note: string;
  locked?: boolean;
}[] = [
  { kind: "search", label: "Search", note: "Search box on desktop, magnifier on phones. Ctrl/Cmd-K still opens search when hidden." },
  { kind: "wallet", label: "Wallet balance", note: "Points pill linking to /wallet. Shows from 640px wide; drops out when /wallet is hidden for the user." },
  { kind: "streak", label: "Streak", note: "Flame + day count. Tablet and up, only while a streak is running." },
  { kind: "theme", label: "Light / dark switch", note: "Also disappears when the theme switch is turned off platform-wide." },
  { kind: "notifications", label: "Notifications bell", note: "Always shown — the only live unread count on tablet/desktop.", locked: true },
];

export const HEADER_SHORTCUT_MAX = 3;
export const HEADER_LABEL_MAX = 24;

export interface HeaderItem {
  id: string;
  kind: HeaderItemKind;
  visible: boolean;
  /** Shortcuts only: tooltip / accessible name, target and icon. */
  label?: string;
  href?: string;
  icon?: string;
}

export interface HeaderConfig {
  items: HeaderItem[];
}

export const DEFAULT_HEADER: HeaderConfig = {
  items: HEADER_BUILTINS.map((b) => ({ id: `hdr-${b.kind}`, kind: b.kind, visible: true })),
};

export function normalizeHeader(raw: unknown): HeaderConfig {
  const list = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return DEFAULT_HEADER;
  const seen = new Set<string>();
  const items: HeaderItem[] = [];
  let shortcuts = 0;
  for (const [i, item] of list.entries()) {
    const r = (item ?? {}) as Record<string, unknown>;
    const kind = r.kind as HeaderItemKind;
    if (kind === "shortcut") {
      if (shortcuts >= HEADER_SHORTCUT_MAX) continue;
      const label = str(r.label, HEADER_LABEL_MAX);
      const href = str(r.href, 300);
      if (!label || hrefProblem(href)) continue;
      shortcuts++;
      items.push({
        id: cleanId(r.id, `hdr-sc-${i}`),
        kind,
        visible: r.visible !== false,
        label,
        href,
        icon: isNavIconKey(r.icon) ? r.icon : "zap",
      });
      continue;
    }
    const builtin = HEADER_BUILTINS.find((b) => b.kind === kind);
    if (!builtin || seen.has(kind)) continue;
    seen.add(kind);
    items.push({
      id: `hdr-${kind}`,
      kind,
      visible: builtin.locked ? true : r.visible !== false,
    });
  }
  // A built-in the stored list forgot comes back, shown, at the end — a newer
  // control must not vanish because an older save did not know about it.
  for (const b of HEADER_BUILTINS) {
    if (!seen.has(b.kind)) items.push({ id: `hdr-${b.kind}`, kind: b.kind, visible: true });
  }
  return { items };
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

export interface SidebarItem extends NavLink {
  visible: boolean;
  /** Extra words the menu's filter box matches (never shown). */
  keywords?: string;
}

export interface SidebarSection {
  id: string;
  title: string;
  items: SidebarItem[];
}

/**
 * The pinned "modes" under the menu. Their items and who sees them are fixed
 * in code (tutors, buyers with `createTasks`, staff); the admin may rename
 * them and change their order.
 */
export type SidebarModeKind = "teaching" | "buying" | "admin";

export const SIDEBAR_MODES: readonly {
  kind: SidebarModeKind;
  title: string;
  gate: string;
  items: string;
}[] = [
  { kind: "teaching", title: "Teaching", gate: "Tutors only", items: "Tutor Hub" },
  { kind: "buying", title: "Buying", gate: "Users with Create Tasks, when /buyer is not hidden", items: "Buyer Hub, Buy Credit" },
  { kind: "admin", title: "Administration", gate: "Staff roles only", items: "Admin Panel" },
];

export interface SidebarMode {
  kind: SidebarModeKind;
  title: string;
}

export interface SidebarConfig {
  sections: SidebarSection[];
  modes: SidebarMode[];
}

export const SIDEBAR_SECTION_MAX = 12;
export const SIDEBAR_ITEM_MAX = 80;
export const SIDEBAR_LABEL_MAX = 32;

type Seed = [label: string, href: string, icon: string, feature?: string, keywords?: string];

function seedSection(title: string, rows: Seed[]): SidebarSection {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `sb-${slug}`,
    title,
    items: rows.map(([label, href, icon, feature, keywords]) => ({
      id: `sb-${href.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`,
      label,
      href,
      icon,
      ...(feature ? { feature } : {}),
      ...(keywords ? { keywords } : {}),
      visible: true,
    })),
  };
}

/** The menu exactly as sidebar.tsx hard-coded it. */
export const DEFAULT_SIDEBAR: SidebarConfig = {
  sections: [
    seedSection("Main", [
      ["Home", "/social", "home", undefined, "feed social posts"],
      ["Dashboard", "/dashboard", "layoutDashboard", undefined, "overview stats"],
      ["Wallet", "/wallet", "wallet", undefined, "balance points money"],
      ["Saved", "/saved", "bookmark", undefined, "bookmarks"],
      ["Leaderboard", "/leaderboard", "trophy", undefined, "ranking top"],
    ]),
    seedSection("Earn & Work", [
      ["Daily Mission", "/daily-mission", "target", "dailyMission", "today checklist streak"],
      ["Missions", "/missions", "rocket", undefined, "goals prizes"],
      ["Tasks", "/tasks", "listTodo", "tasks", "jobs work offers"],
      ["Board Tasks", "/board-tasks", "pin", "tasks", "pinned board"],
      ["Browse & Earn", "/watch-ads", "coins", undefined, "watch ads passive cpm"],
      ["CPA Offers", "/cpa", "badgeDollar", undefined, "cpa offers signup partner apps proof"],
      ["Quiz Games", "/quizzes", "brain", undefined, "trivia questions"],
      ["Games", "/games", "gamepad", "games", "play arcade"],
      ["Events", "/events", "sparkles", undefined, "campaign limited"],
      ["Lottery", "/lottery", "ticket", "lottery", "raffle draw ticket"],
    ]),
    seedSection("Learn & Shop", [
      ["Courses", "/courses", "graduation", "courses", "learn lessons lms"],
      ["My Learning", "/my-learning", "graduation", "courses", "enrolled progress certificate"],
      ["Marketplace", "/marketplace", "store", "marketplace", "buy sell shop products"],
    ]),
    seedSection("Network & Grow", [
      ["My Team", "/referrals", "users", "referrals", "referral refer invite downline"],
      ["Affiliate", "/affiliate", "handshake", undefined, "commission partner links"],
      ["Milestones", "/milestones", "target", undefined, "progress rewards"],
      ["Achievements", "/achievements", "award", undefined, "badges trophies"],
    ]),
    seedSection("Promote", [
      ["Create Ad", "/advertiser", "briefcase", "advertiser", "advertise campaign banner"],
      ["Create Task", "/create-task", "clipboardPlus", "createTasks", "post job hire"],
    ]),
    seedSection("Account & Admin", [
      ["Add Funds", "/deposit", "creditCard", undefined, "deposit top up recharge pay"],
      ["Withdrawal", "/withdrawal", "arrowUpRight", "withdrawals", "cash out payout redeem"],
      ["Transactions", "/transactions", "receipt", undefined, "history statement ledger"],
      ["Packages", "/packages", "package", undefined, "plans upgrade subscription"],
      ["My Package", "/my-package", "package", undefined, "current plan subscription"],
      ["Notifications", "/notifications", "bell", undefined, "alerts"],
      ["Chat", "/chat", "messageSquare", undefined, "messages dm inbox"],
      ["Help", "/support", "helpCircle", undefined, "support contact ticket faq"],
      ["Settings", "/settings", "settings", undefined, "preferences account theme privacy"],
    ]),
  ],
  modes: SIDEBAR_MODES.map((m) => ({ kind: m.kind, title: m.title })),
};

export function normalizeSidebar(raw: unknown): SidebarConfig {
  const r = (raw ?? {}) as { sections?: unknown; modes?: unknown };
  if (!Array.isArray(r.sections) || r.sections.length === 0) return DEFAULT_SIDEBAR;

  const sections: SidebarSection[] = [];
  let total = 0;
  for (const [si, sec] of r.sections.slice(0, SIDEBAR_SECTION_MAX).entries()) {
    const s = (sec ?? {}) as Record<string, unknown>;
    const title = str(s.title, SIDEBAR_LABEL_MAX);
    const items: SidebarItem[] = [];
    for (const [ii, it] of (Array.isArray(s.items) ? s.items : []).entries()) {
      if (total >= SIDEBAR_ITEM_MAX) break;
      const o = (it ?? {}) as Record<string, unknown>;
      const label = str(o.label, SIDEBAR_LABEL_MAX);
      const href = str(o.href, 300);
      if (!label || hrefProblem(href)) continue;
      const keywords = str(o.keywords, 200);
      items.push({
        id: cleanId(o.id, `sb-${si}-${ii}`),
        label,
        href,
        icon: isNavIconKey(o.icon) ? o.icon : "zap",
        feature: cleanFeature(o.feature),
        ...(keywords ? { keywords } : {}),
        visible: o.visible !== false,
      });
      total++;
    }
    sections.push({ id: cleanId(s.id, `sb-sec-${si}`), title: title || "Menu", items });
  }
  if (total === 0) return DEFAULT_SIDEBAR;

  // Modes: each exactly once, stored order first, forgotten ones appended.
  const modes: SidebarMode[] = [];
  const seen = new Set<string>();
  for (const m of Array.isArray(r.modes) ? r.modes : []) {
    const o = (m ?? {}) as Record<string, unknown>;
    const def = SIDEBAR_MODES.find((d) => d.kind === o.kind);
    if (!def || seen.has(def.kind)) continue;
    seen.add(def.kind);
    modes.push({ kind: def.kind, title: str(o.title, SIDEBAR_LABEL_MAX) || def.title });
  }
  for (const d of SIDEBAR_MODES) {
    if (!seen.has(d.kind)) modes.push({ kind: d.kind, title: d.title });
  }
  return { sections, modes };
}

// ── Save-time validation ─────────────────────────────────────────────────────

export const QUICK_EARN_MAX = 24;
export const QUICK_EARN_LABEL_MAX = 24;

/**
 * What is wrong with a value about to be saved under a navigation key, in
 * words an admin can act on. Empty = fine. The normalisers above are the
 * read-side safety net; this is what stops a bad save in the first place.
 */
export function navSettingProblems(key: string, value: unknown): string[] {
  const out: string[] = [];
  const link = (where: string, o: Record<string, unknown>, labelMax: number) => {
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!label) out.push(`${where} needs a label.`);
    else if (label.length > labelMax) out.push(`${where}: "${label}" is longer than ${labelMax} characters.`);
    const h = hrefProblem(o.href);
    if (h) out.push(`${where} ${h}.`);
    if (o.icon !== undefined && !isNavIconKey(o.icon)) out.push(`${where} has an unknown icon.`);
    if (o.feature !== undefined && o.feature !== null && o.feature !== "" && !FEATURE_SET.has(String(o.feature)))
      out.push(`${where} has an unknown feature key "${String(o.feature)}".`);
  };
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

  if (key === NAV_KEYS.quickEarn) {
    if (!Array.isArray(value)) return ["Quick Earn tiles must be a list."];
    if (value.length > QUICK_EARN_MAX) out.push(`At most ${QUICK_EARN_MAX} Quick Earn tiles.`);
    value.forEach((t, i) => link(`Tile ${i + 1}`, obj(t), QUICK_EARN_LABEL_MAX));
  } else if (key === NAV_KEYS.bottomTabs) {
    if (!Array.isArray(value) || value.length !== BOTTOM_TAB_SLOTS)
      return [`The tab bar has exactly ${BOTTOM_TAB_SLOTS} slots.`];
    value.forEach((t, i) => link(`Tab ${i + 1}`, obj(t), BOTTOM_TAB_LABEL_MAX));
    const primaries = value.filter((t) => obj(t).primary === true).length;
    if (primaries !== 1) out.push("Exactly one tab must be the big centre button.");
  } else if (key === NAV_KEYS.header) {
    const items = obj(value).items;
    if (!Array.isArray(items)) return ["Header config must have an items list."];
    const shortcuts = items.filter((i) => obj(i).kind === "shortcut");
    if (shortcuts.length > HEADER_SHORTCUT_MAX)
      out.push(`At most ${HEADER_SHORTCUT_MAX} header shortcuts — more do not fit a phone.`);
    shortcuts.forEach((s, i) => link(`Shortcut ${i + 1}`, obj(s), HEADER_LABEL_MAX));
    for (const i of items) {
      const k = obj(i).kind;
      if (k !== "shortcut" && !HEADER_BUILTINS.some((b) => b.kind === k))
        out.push(`Unknown header item "${String(k)}".`);
    }
    if (items.some((i) => obj(i).kind === "notifications" && obj(i).visible === false))
      out.push("The notifications bell cannot be hidden.");
  } else if (key === NAV_KEYS.sidebar) {
    const v = obj(value);
    if (!Array.isArray(v.sections) || v.sections.length === 0) return ["The menu needs at least one section."];
    if (v.sections.length > SIDEBAR_SECTION_MAX) out.push(`At most ${SIDEBAR_SECTION_MAX} menu sections.`);
    let total = 0;
    v.sections.forEach((s, si) => {
      const o = obj(s);
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!title) out.push(`Section ${si + 1} needs a title.`);
      else if (title.length > SIDEBAR_LABEL_MAX) out.push(`Section "${title}" title is too long.`);
      const items = Array.isArray(o.items) ? o.items : [];
      total += items.length;
      items.forEach((it, ii) => link(`${title || `Section ${si + 1}`} → item ${ii + 1}`, obj(it), SIDEBAR_LABEL_MAX));
    });
    if (total === 0) out.push("The menu needs at least one item.");
    if (total > SIDEBAR_ITEM_MAX) out.push(`At most ${SIDEBAR_ITEM_MAX} menu items.`);
    if (v.modes !== undefined && !Array.isArray(v.modes)) out.push("Pinned sections must be a list.");
    for (const m of Array.isArray(v.modes) ? v.modes : []) {
      const o = obj(m);
      if (!SIDEBAR_MODES.some((d) => d.kind === o.kind)) out.push(`Unknown pinned section "${String(o.kind)}".`);
      const t = typeof o.title === "string" ? o.title.trim() : "";
      if (!t || t.length > SIDEBAR_LABEL_MAX) out.push(`Pinned section titles need 1–${SIDEBAR_LABEL_MAX} characters.`);
    }
  }
  return out;
}
