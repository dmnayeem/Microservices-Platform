/**
 * Super-admin page-visibility control (feature #3).
 *
 * A catalog of every user-facing page + a pure resolver that decides which
 * pages are HIDDEN for a given user, combining four layers:
 *   1. everyone            (hide page X for every user)
 *   2. per-package rules   (hide page X for everyone on package "free")
 *   3. per-role rules      (hide page X for role AGENCY)
 *   4. per-user overrides  (force show/hide for one user — wins over 1–3)
 *
 * Layers 1–3 union together (hidden anywhere ⇒ hidden). A per-user "show"
 * re-opens the page for that one person even when it is hidden for everyone.
 *
 * A page's key is a path PREFIX: hiding "/tutor" hides "/tutor/courses/new";
 * hiding "/u" hides "/u/alice" but not "/update-password" (segment match).
 *
 * This file must stay CLIENT-SAFE (no prisma import) — it is imported by the
 * admin matrix UI and the client nav. The server resolver that reads the DB
 * lives in ./page-visibility-server.
 */

export interface UserPage {
  /** The route path — also the stable visibility key. */
  path: string;
  label: string;
  group: string;
}

/** Every togglable user-facing page, grouped for the admin matrix. */
export const USER_PAGES: UserPage[] = [
  // Main
  { path: "/social", label: "Home (Feed)", group: "Main" },
  { path: "/dashboard", label: "Dashboard", group: "Main" },
  { path: "/tasks", label: "Tasks hub", group: "Main" },
  { path: "/earn", label: "Earn Hub", group: "Main" },
  { path: "/wallet", label: "Wallet", group: "Main" },
  { path: "/referrals", label: "My Team", group: "Main" },
  // Tasks
  { path: "/manual-tasks", label: "Manual Tasks", group: "Tasks" },
  { path: "/custom-tasks", label: "Custom Tasks", group: "Tasks" },
  { path: "/article-tasks", label: "Article Tasks", group: "Tasks" },
  { path: "/video-tasks", label: "Video Tasks", group: "Tasks" },
  { path: "/quiz-tasks", label: "Quiz Tasks", group: "Tasks" },
  { path: "/survey-tasks", label: "Survey Tasks", group: "Tasks" },
  { path: "/social-tasks", label: "Social Tasks", group: "Tasks" },
  { path: "/social-posts", label: "Social Posts", group: "Tasks" },
  { path: "/proxy-tasks", label: "Proxy Tasks", group: "Tasks" },
  { path: "/app-install-tasks", label: "App Install", group: "Tasks" },
  { path: "/board-tasks", label: "Board Tasks", group: "Tasks" },
  // Earn
  { path: "/offerwalls", label: "Offerwalls", group: "Earn" },
  { path: "/cpa", label: "CPA Offers", group: "Earn" },
  { path: "/watch-ads", label: "Browse & Earn", group: "Earn" },
  { path: "/daily-mission", label: "Daily Mission", group: "Earn" },
  { path: "/missions", label: "Missions", group: "Earn" },
  { path: "/events", label: "Events", group: "Earn" },
  { path: "/milestones", label: "Milestones", group: "Earn" },
  { path: "/achievements", label: "Achievements", group: "Earn" },
  { path: "/leaderboard", label: "Leaderboard", group: "Earn" },
  { path: "/quizzes", label: "Quiz Games", group: "Earn" },
  { path: "/games", label: "Games", group: "Earn" },
  { path: "/lottery", label: "Lottery", group: "Earn" },
  { path: "/affiliate", label: "Affiliate", group: "Earn" },
  // Learn
  { path: "/courses", label: "Courses", group: "Learn" },
  { path: "/my-learning", label: "My Learning", group: "Learn" },
  { path: "/learn", label: "Lesson player", group: "Learn" },
  { path: "/certificates", label: "Certificates", group: "Learn" },
  { path: "/course-creator", label: "Course Creator", group: "Learn" },
  { path: "/tutor", label: "Tutor area", group: "Learn" },
  // Community
  { path: "/groups", label: "Groups", group: "Community" },
  { path: "/hashtag", label: "Hashtags", group: "Community" },
  { path: "/u", label: "Public profiles (/u)", group: "Community" },
  { path: "/saved", label: "Saved posts", group: "Community" },
  { path: "/chat", label: "Chat", group: "Community" },
  // Buy & sell
  { path: "/marketplace", label: "Marketplace", group: "Buy & sell" },
  { path: "/packages", label: "Packages", group: "Buy & sell" },
  { path: "/my-package", label: "My Package", group: "Buy & sell" },
  { path: "/badge", label: "Blue Badge shop", group: "Buy & sell" },
  { path: "/subscriptions", label: "Subscriptions", group: "Buy & sell" },
  { path: "/advertiser", label: "Create Ad", group: "Buy & sell" },
  { path: "/create-task", label: "Create Task", group: "Buy & sell" },
  { path: "/buyer", label: "Buyer Hub", group: "Buy & sell" },
  { path: "/buy-points", label: "Buy Credit", group: "Buy & sell" },
  { path: "/agency", label: "Agency Console", group: "Buy & sell" },
  // Account
  { path: "/profile", label: "Profile", group: "Account" },
  { path: "/deposit", label: "Add Funds", group: "Account" },
  { path: "/withdrawal", label: "Withdrawal", group: "Account" },
  { path: "/transactions", label: "Transactions", group: "Account" },
  { path: "/payment-methods", label: "Payment methods", group: "Account" },
  { path: "/kyc", label: "KYC verification", group: "Account" },
  { path: "/notifications", label: "Notifications", group: "Account" },
  { path: "/support", label: "Help", group: "Account" },
];

/**
 * Pages nobody can hide — security, recovery and the landing spot for a
 * hidden page. They are not in USER_PAGES (so the matrix never offers them)
 * and the parser drops them from any stored rule or override, including the
 * old `/settings` entry rules saved before it joined this list.
 */
export const ALWAYS_VISIBLE_PATHS: readonly string[] = [
  "/no-access",
  "/2fa-setup",
  "/update-password",
  "/settings",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-phone",
  "/appeal",
  "/onboarding",
];

/** Segment prefix match: "/u" covers "/u" and "/u/x", not "/update-password". */
export function pathMatches(pathname: string, page: string): boolean {
  return pathname === page || pathname.startsWith(`${page}/`);
}

function isAlwaysVisible(pathname: string): boolean {
  return ALWAYS_VISIBLE_PATHS.some((s) => pathMatches(pathname, s));
}

const VALID_PATHS = new Set(
  USER_PAGES.map((p) => p.path).filter((p) => !isAlwaysVisible(p))
);

/** True when `pathname` (a page or deep link) falls under a hidden page. */
export function isPathHidden(
  pathname: string,
  hiddenPaths: readonly string[] | null | undefined
): boolean {
  if (!hiddenPaths || hiddenPaths.length === 0) return false;
  const bare = pathname.split(/[?#]/)[0];
  if (isAlwaysVisible(bare)) return false;
  return hiddenPaths.some((p) => pathMatches(bare, p));
}

/**
 * The page that runs a task of `type` — used by the task APIs to refuse a
 * task whose page is hidden. Null = no dedicated page (no extra check).
 */
export function taskTypePage(type: string | null | undefined): string | null {
  switch ((type ?? "").toUpperCase()) {
    case "VIDEO":
      return "/video-tasks";
    case "ARTICLE":
      return "/article-tasks";
    case "SURVEY":
      return "/survey-tasks";
    case "CUSTOM":
      return "/custom-tasks";
    case "MANUAL":
      return "/manual-tasks";
    case "APPINSTALL":
      return "/app-install-tasks";
    case "SOCIAL":
      return "/social-tasks";
    case "QUIZ":
      return "/quiz-tasks";
    case "PROXY":
      return "/proxy-tasks";
    case "BOARD":
      return "/board-tasks";
    case "OFFERWALL":
      return "/offerwalls";
    default:
      return null;
  }
}

/** Persisted rules (SystemSetting `page_visibility.rules`). Arrays are HIDDEN paths. */
export interface PageVisibilityRules {
  /** Hidden for every user (the "Everyone" column). */
  global: string[];
  packages: Record<string, string[]>; // packageSlug → hidden paths
  roles: Record<string, string[]>; // role → hidden paths
}

export function emptyPageRules(): PageVisibilityRules {
  return { global: [], packages: {}, roles: {} };
}

function cleanPaths(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return Array.from(
    new Set(
      val
        .filter((p): p is string => typeof p === "string")
        .filter((p) => VALID_PATHS.has(p))
    )
  );
}

/**
 * Coerce arbitrary JSON into a well-formed rules object. Drops unknown and
 * always-visible paths. Rules saved before `global` existed parse with
 * `global: []`.
 */
export function parsePageRules(raw: unknown): PageVisibilityRules {
  const out = emptyPageRules();
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  const coerce = (bucket: unknown): Record<string, string[]> => {
    const res: Record<string, string[]> = {};
    if (bucket && typeof bucket === "object" && !Array.isArray(bucket)) {
      for (const [key, val] of Object.entries(bucket as Record<string, unknown>)) {
        const paths = cleanPaths(val);
        if (paths.length) res[key] = paths;
      }
    }
    return res;
  };
  out.global = cleanPaths(o.global);
  out.packages = coerce(o.packages);
  out.roles = coerce(o.roles);
  return out;
}

/** Per-user overrides: { [path]: true (force show) | false (force hide) }. */
export function parsePageOverrides(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (raw && typeof raw === "object") {
    for (const [path, val] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof val === "boolean" && VALID_PATHS.has(path)) out[path] = val;
    }
  }
  return out;
}

/** Which rule layer hides a page (before the per-user layer). */
export type HiddenSource = "everyone" | "package" | "role";

/** Per-path list of the rule layers that hide it (no per-user layer). */
export function hiddenSources(
  rules: PageVisibilityRules,
  packageSlug: string | null | undefined,
  role: string | null | undefined
): Record<string, HiddenSource[]> {
  const out: Record<string, HiddenSource[]> = {};
  const add = (paths: string[] | undefined, src: HiddenSource) => {
    for (const p of paths ?? []) (out[p] ??= []).push(src);
  };
  add(rules.global, "everyone");
  if (packageSlug) add(rules.packages[packageSlug], "package");
  if (role) add(rules.roles[role], "role");
  return out;
}

/**
 * Resolve the set of hidden paths for a user. Everyone + package + role rules
 * union together; a per-user override then force-shows (delete) or
 * force-hides (add), winning over every other layer.
 */
export function computeHiddenPaths(
  rules: PageVisibilityRules,
  packageSlug: string | null | undefined,
  role: string | null | undefined,
  userOverrides?: Record<string, boolean>
): string[] {
  const hidden = new Set<string>(
    Object.keys(hiddenSources(rules, packageSlug, role))
  );
  if (userOverrides) {
    for (const [path, show] of Object.entries(userOverrides)) {
      if (!VALID_PATHS.has(path)) continue;
      if (show === false) hidden.add(path);
      else if (show === true) hidden.delete(path);
    }
  }
  return Array.from(hidden);
}
