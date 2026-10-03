// Admin-page (module) visibility — the layer ABOVE permissions.
//
// Permissions decide what an admin can DO; this decides which admin PAGES
// exist for them. It has to be its own layer because modules share
// permissions (settings.view alone opens six pages), so a permission cannot
// switch one page off without switching off its siblings.
//
// Pure and client-safe: the super-admin editor and the per-admin panel use the
// same `decideModule()` the server enforces with, so what the screen says is
// what the guard does. Server reads/writes live in src/lib/permissions.ts.
//
// Precedence (first match wins):
//   1. SUPER_ADMIN                      → shown. Never restricted, by anything.
//   2. locked module (/admin dashboard) → follows its permission; cannot be hidden,
//                                         because "hidden" redirects there.
//   3. super-admin-only module          → hidden (nothing can grant it).
//   4. per-admin override "hide"        → hidden.
//   5. per-admin override "show"        → shown; its permissions are added to
//                                         the admin's effective set (finance and
//                                         staff-admin permissions still stripped).
//   6. "Off for all admins"             → hidden.
//   7. hidden for the admin's role      → hidden.
//   8. the permission rule              → shown if ANY module permission is held.

import {
  ADMIN_MODULES,
  ADMIN_ROLES,
  SUPERADMIN_ONLY_PERMISSIONS,
  type AdminModule,
  type Permission,
  type UserRole,
} from "./rbac";

export const ADMIN_MODULE_RULES_KEY = "admin_modules.rules";

export interface AdminModuleRules {
  /** Module hrefs switched off for every admin except the super admin. */
  disabled: string[];
  /** Module hrefs hidden per admin role. SUPER_ADMIN is never stored. */
  roles: Partial<Record<UserRole, string[]>>;
}

export type ModuleOverride = "show" | "hide";
/** `User.moduleOverrides`: module href → forced state for that one admin. */
export type ModuleOverrides = Record<string, ModuleOverride>;

/** Modules that can never be hidden: a hidden module redirects to /admin. */
export const LOCKED_MODULE_HREFS: readonly string[] = ["/admin"];

/** Roles the rules can target — every admin role but the super admin. */
export const CONFIGURABLE_ADMIN_ROLES: UserRole[] = ADMIN_ROLES.filter(
  (r) => r !== "SUPER_ADMIN"
);

const MODULE_HREFS = new Set(ADMIN_MODULES.map((m) => m.href));
const SUPER_ONLY_PERMS = new Set<Permission>(SUPERADMIN_ONLY_PERMISSIONS);

export function isLockedModule(href: string): boolean {
  return LOCKED_MODULE_HREFS.includes(href);
}

/** A module no one but the super admin may see, whatever the rules say. */
export function isSuperAdminOnlyModule(m: AdminModule): boolean {
  return m.superAdminOnly === true;
}

/** True for a module the rules/overrides may act on. */
export function isConfigurableModule(m: AdminModule): boolean {
  return !isLockedModule(m.href) && !isSuperAdminOnlyModule(m);
}

function cleanHrefs(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const h of v) {
    if (typeof h !== "string" || !MODULE_HREFS.has(h) || isLockedModule(h)) continue;
    out.add(h);
  }
  return [...out];
}

/** Sanitize stored/submitted rules: unknown hrefs, locked modules and SUPER_ADMIN dropped. */
export function parseAdminModuleRules(raw: unknown): AdminModuleRules {
  const out: AdminModuleRules = { disabled: [], roles: {} };
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  out.disabled = cleanHrefs(src.disabled);
  const roles =
    src.roles && typeof src.roles === "object"
      ? (src.roles as Record<string, unknown>)
      : {};
  for (const role of CONFIGURABLE_ADMIN_ROLES) {
    const hrefs = cleanHrefs(roles[role]);
    if (hrefs.length) out.roles[role] = hrefs;
  }
  return out;
}

/** Sanitize `User.moduleOverrides`: known, configurable modules only. */
export function parseModuleOverrides(raw: unknown): ModuleOverrides {
  const out: ModuleOverrides = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [href, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v !== "show" && v !== "hide") continue;
    const m = ADMIN_MODULES.find((x) => x.href === href);
    if (!m || !isConfigurableModule(m)) continue;
    out[href] = v;
  }
  return out;
}

/**
 * Permissions a per-admin "show" adds. Staff-administration permissions are
 * never added (a MANAGER keeps them through `stripProtectedForRole`, so they
 * must be filtered here); finance permissions are added but then stripped by
 * `stripProtectedForRole` unless `financeGrants` holds them.
 */
export function permissionsGrantedByModules(overrides: ModuleOverrides): Permission[] {
  const out = new Set<Permission>();
  for (const [href, v] of Object.entries(overrides)) {
    if (v !== "show") continue;
    const m = ADMIN_MODULES.find((x) => x.href === href);
    if (!m) continue;
    for (const p of m.permissions) if (!SUPER_ONLY_PERMS.has(p)) out.add(p);
  }
  return [...out];
}

export type ModuleSource =
  | "super-admin"
  | "locked"
  | "super-admin-only"
  | "override-show"
  | "override-hide"
  | "off-for-all"
  | "role"
  | "permission"
  | "no-permission";

export interface ModuleDecision {
  visible: boolean;
  source: ModuleSource;
}

/**
 * The one decision. `perms` is the admin's permission set WITHOUT the
 * permissions added by their own "show" overrides — so granting one page does
 * not quietly open every other page that shares its permission.
 */
export function decideModule(
  m: AdminModule,
  role: UserRole,
  perms: ReadonlySet<Permission>,
  rules: AdminModuleRules,
  overrides: ModuleOverrides
): ModuleDecision {
  if (role === "SUPER_ADMIN") return { visible: true, source: "super-admin" };
  const byPerm = m.permissions.some((p) => perms.has(p));
  if (isLockedModule(m.href)) return { visible: byPerm, source: "locked" };
  if (isSuperAdminOnlyModule(m)) return { visible: false, source: "super-admin-only" };
  const ov = overrides[m.href];
  if (ov === "hide") return { visible: false, source: "override-hide" };
  if (ov === "show") return { visible: true, source: "override-show" };
  if (rules.disabled.includes(m.href)) return { visible: false, source: "off-for-all" };
  if (rules.roles[role]?.includes(m.href)) return { visible: false, source: "role" };
  return { visible: byPerm, source: byPerm ? "permission" : "no-permission" };
}

/** The same decision, ignoring the admin's own override (the "inherit" state). */
export function decideInherited(
  m: AdminModule,
  role: UserRole,
  perms: ReadonlySet<Permission>,
  rules: AdminModuleRules
): ModuleDecision {
  return decideModule(m, role, perms, rules, {});
}

export const MODULE_SOURCE_LABEL: Record<ModuleSource, string> = {
  "super-admin": "super admin",
  locked: "always on",
  "super-admin-only": "super admin only",
  "override-show": "shown for this admin",
  "override-hide": "hidden for this admin",
  "off-for-all": "off for all admins",
  role: "hidden for role",
  permission: "permission",
  "no-permission": "no permission",
};

/**
 * Modules that share at least one permission with another module — the UI
 * uses this to say that hiding a page does not remove its permission.
 */
export function modulesSharingPermissions(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of ADMIN_MODULES) {
    const peers = ADMIN_MODULES.filter(
      (o) => o.href !== m.href && o.permissions.some((p) => m.permissions.includes(p))
    ).map((o) => o.name);
    if (peers.length) out[m.href] = peers;
  }
  return out;
}

/**
 * Admin APIs that belong to exactly ONE admin page. When that page is hidden
 * for an admin, `can()` refuses these APIs for them too (see apiModuleAllowed
 * in permissions.ts). Only prefixes whose callers all live on that one page
 * are listed — an API shared by several pages (users, tasks, settings,
 * finance, ads, banners, submissions, notifications, boards, deposits, ai…)
 * keeps answering on its permission alone, because hiding one page must not
 * break the others. Longest prefix wins.
 */
export const API_MODULE_PREFIXES: Record<string, string> = {
  "/api/admin/cpa": "/admin/cpa",
  // Templates are one feature: the Templates page manages them and the task
  // form's picker / "save as template" use them. Switching the page off
  // switches the feature off too; the task form itself keeps working.
  "/api/admin/task-templates": "/admin/tasks/templates",
  "/api/admin/offerwall-callbacks": "/admin/offerwall-callbacks",
  "/api/admin/offerwalls": "/admin/offerwalls",
  "/api/admin/offerwall": "/admin/offerwalls",
  "/api/admin/lottery": "/admin/lottery",
  "/api/admin/games": "/admin/games",
  "/api/admin/coupons": "/admin/coupons",
  "/api/admin/tutors": "/admin/tutors",
  "/api/admin/creators": "/admin/creators",
  "/api/admin/sellers": "/admin/sellers",
  "/api/admin/missions": "/admin/missions",
  "/api/admin/daily-missions": "/admin/daily-missions",
  "/api/admin/events": "/admin/events",
  "/api/admin/quizzes": "/admin/quizzes",
  "/api/admin/gamification": "/admin/gamification",
  "/api/admin/support": "/admin/support",
  "/api/admin/fraud": "/admin/fraud",
  "/api/admin/abuse": "/admin/abuse",
  "/api/admin/kyc": "/admin/users/kyc",
  "/api/admin/proxy": "/admin/proxy",
  "/api/admin/campaigns": "/admin/campaigns",
  "/api/admin/broadcasts": "/admin/notifications/broadcasts",
  "/api/admin/popups": "/admin/popups",
  "/api/admin/offers": "/admin/offers",
  "/api/admin/splash": "/admin/splash-screen",
  "/api/admin/blog": "/admin/blog",
  "/api/admin/seo": "/admin/seo",
  "/api/admin/landing-page": "/admin/landing-page",
  "/api/admin/locations": "/admin/locations",
  "/api/admin/scheduler": "/admin/scheduler",
  "/api/admin/leaderboard": "/admin/leaderboard",
  "/api/admin/withdrawals": "/admin/withdrawals",
  "/api/admin/packages": "/admin/packages",
  "/api/admin/referrals": "/admin/referrals",
};

/** The admin page an admin API belongs to, or null when it is shared/unlisted. */
export function moduleForApiPath(pathname: string): string | null {
  let best: string | null = null;
  for (const prefix of Object.keys(API_MODULE_PREFIXES)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      if (!best || prefix.length > best.length) best = prefix;
    }
  }
  return best ? API_MODULE_PREFIXES[best] : null;
}
