/**
 * Super-admin page-visibility control (feature #3).
 *
 * A catalog of every user-facing page + a pure resolver that decides which
 * pages are HIDDEN for a given user, combining three layers:
 *   1. per-package rules   (hide page X for everyone on package "free")
 *   2. per-role rules      (hide page X for role AGENCY)
 *   3. per-user overrides  (force show/hide for one user — wins over 1 & 2)
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

/** Every togglable user-facing page, grouped to mirror the sidebar. */
export const USER_PAGES: UserPage[] = [
  // Main
  { path: "/social", label: "Home (Feed)", group: "Main" },
  { path: "/dashboard", label: "Dashboard", group: "Main" },
  { path: "/tasks", label: "Tasks", group: "Main" },
  { path: "/daily-mission", label: "Daily Mission", group: "Main" },
  { path: "/quizzes", label: "Quizzes", group: "Main" },
  { path: "/wallet", label: "Wallet", group: "Main" },
  { path: "/referrals", label: "My Team", group: "Main" },
  // Earn
  { path: "/earn", label: "Earn Hub", group: "Earn" },
  { path: "/manual-tasks", label: "Manual Tasks", group: "Earn" },
  { path: "/article-tasks", label: "Article Tasks", group: "Earn" },
  { path: "/video-tasks", label: "Video Tasks", group: "Earn" },
  { path: "/quiz-tasks", label: "Quiz Tasks", group: "Earn" },
  { path: "/survey-tasks", label: "Survey Tasks", group: "Earn" },
  { path: "/social-tasks", label: "Social Tasks", group: "Earn" },
  { path: "/social-posts", label: "Social Posts", group: "Earn" },
  { path: "/proxy-tasks", label: "Proxy Tasks", group: "Earn" },
  { path: "/app-install-tasks", label: "App Install", group: "Earn" },
  { path: "/board-tasks", label: "Board Tasks", group: "Earn" },
  { path: "/offerwalls", label: "Offerwalls", group: "Earn" },
  { path: "/events", label: "Events", group: "Earn" },
  { path: "/watch-ads", label: "Browse & Earn", group: "Earn" },
  { path: "/milestones", label: "Milestones", group: "Earn" },
  { path: "/achievements", label: "Achievements", group: "Earn" },
  { path: "/leaderboard", label: "Leaderboard", group: "Earn" },
  // Grow
  { path: "/courses", label: "Courses", group: "Grow" },
  { path: "/my-learning", label: "My Learning", group: "Grow" },
  { path: "/marketplace", label: "Marketplace", group: "Grow" },
  { path: "/games", label: "Games", group: "Grow" },
  { path: "/lottery", label: "Lottery", group: "Grow" },
  { path: "/packages", label: "Packages", group: "Grow" },
  { path: "/advertiser", label: "Create Ad", group: "Grow" },
  { path: "/create-task", label: "Create Task", group: "Grow" },
  { path: "/agency", label: "Agency Console", group: "Grow" },
  // Account
  { path: "/deposit", label: "Add Funds", group: "Account" },
  { path: "/withdrawal", label: "Withdrawal", group: "Account" },
  { path: "/subscriptions", label: "Subscriptions", group: "Account" },
  { path: "/notifications", label: "Notifications", group: "Account" },
  { path: "/chat", label: "Chat", group: "Account" },
  { path: "/support", label: "Help", group: "Account" },
  { path: "/settings", label: "Settings", group: "Account" },
];

const VALID_PATHS = new Set(USER_PAGES.map((p) => p.path));

/** Persisted rules (SystemSetting `page_visibility.rules`). Arrays are HIDDEN paths. */
export interface PageVisibilityRules {
  packages: Record<string, string[]>; // packageSlug → hidden paths
  roles: Record<string, string[]>; // role → hidden paths
}

export function emptyPageRules(): PageVisibilityRules {
  return { packages: {}, roles: {} };
}

/** Coerce arbitrary JSON into a well-formed rules object (drops unknown paths). */
export function parsePageRules(raw: unknown): PageVisibilityRules {
  const out = emptyPageRules();
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  const coerce = (bucket: unknown): Record<string, string[]> => {
    const res: Record<string, string[]> = {};
    if (bucket && typeof bucket === "object") {
      for (const [key, val] of Object.entries(bucket as Record<string, unknown>)) {
        if (Array.isArray(val)) {
          const paths = val
            .filter((p): p is string => typeof p === "string")
            .filter((p) => VALID_PATHS.has(p));
          if (paths.length) res[key] = Array.from(new Set(paths));
        }
      }
    }
    return res;
  };
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

/**
 * Resolve the set of hidden paths for a user. Package + role rules union
 * together; a per-user override then force-shows (delete) or force-hides (add),
 * winning over the package/role layers.
 */
export function computeHiddenPaths(
  rules: PageVisibilityRules,
  packageSlug: string | null | undefined,
  role: string | null | undefined,
  userOverrides?: Record<string, boolean>
): string[] {
  const hidden = new Set<string>();
  if (packageSlug && rules.packages[packageSlug]) {
    rules.packages[packageSlug].forEach((p) => hidden.add(p));
  }
  if (role && rules.roles[role]) {
    rules.roles[role].forEach((p) => hidden.add(p));
  }
  if (userOverrides) {
    for (const [path, show] of Object.entries(userOverrides)) {
      if (show === false) hidden.add(path);
      else if (show === true) hidden.delete(path);
    }
  }
  return Array.from(hidden);
}
