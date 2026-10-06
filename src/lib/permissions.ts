import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getSetting, invalidateSettingsCache,
  primeSetting } from "@/lib/system-settings";
import {
  ROLE_PERMISSIONS,
  isPermission,
  parsePermissionOverrides,
  stripProtectedForRole,
  expandLegacyPermissions,
  GRANULAR_SPLIT_MARKER,
  moduleForPath,
  ADMIN_MODULES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type Permission,
  type UserRole,
  type ModuleCategory,
  type AdminModule,
} from "@/lib/rbac";
import {
  ADMIN_MODULE_RULES_KEY,
  decideModule,
  moduleForApiPath,
  parseAdminModuleRules,
  parseModuleOverrides,
  permissionsGrantedByModules,
  type AdminModuleRules,
  type ModuleDecision,
  type ModuleOverrides,
} from "@/lib/admin-module-rules";

/**
 * Effective-permission engine. Resolves what a user can actually do by layering:
 *
 *   code defaults (ROLE_PERMISSIONS)  ← the seed
 *   → runtime role config (SystemSetting `rbac.role_permissions`)  ← super-admin editable
 *   → per-user grants/denials (User.permissionOverrides)           ← per-admin tuning
 *
 * SUPER_ADMIN is always full — neither the config nor per-user overrides can strip
 * it (a lock-out safety). Everything is request-cached via React.cache.
 */

const ROLE_PERM_SETTING_KEY = "rbac.role_permissions";
const SETTING_CATEGORY = "access";

/** Sparse per-role permission config: a role present here REPLACES its defaults. */
export type RolePermissionConfig = Partial<Record<UserRole, Permission[]>>;

/** Was the stored role matrix saved after the adjust-permission split?
 *  (see GRANULAR_SPLIT_MARKER in rbac.ts) */
function isSplitMarked(raw: unknown): boolean {
  return !!raw && typeof raw === "object" && (raw as Record<string, unknown>)[GRANULAR_SPLIT_MARKER] === true;
}

/** Sanitize a stored/submitted role→permission config (drops unknown keys). */
export function parseRolePermissionConfig(raw: unknown): RolePermissionConfig {
  const out: RolePermissionConfig = {};
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (const role of Object.keys(ROLE_PERMISSIONS) as UserRole[]) {
    const arr = src[role];
    if (Array.isArray(arr)) {
      out[role] = Array.from(new Set(arr.filter(isPermission)));
    }
  }
  return out;
}

/**
 * The configured permission set per role (config over defaults). Request-cached.
 * SUPER_ADMIN is forced to its full default set regardless of config.
 */
export const getConfiguredRolePermissions = cache(
  async function getConfiguredRolePermissions(): Promise<
    Record<UserRole, Set<Permission>>
  > {
    const raw = await getSetting<unknown>(ROLE_PERM_SETTING_KEY, null);
    const cfg = parseRolePermissionConfig(raw);
    const marked = isSplitMarked(raw);
    const result = {} as Record<UserRole, Set<Permission>>;
    for (const role of Object.keys(ROLE_PERMISSIONS) as UserRole[]) {
      if (role === "SUPER_ADMIN") {
        result[role] = new Set(ROLE_PERMISSIONS.SUPER_ADMIN);
        continue;
      }
      // Expanded HERE, once: a saved role in a marked matrix is literal; an
      // unmarked (pre-split) one and the code defaults get the legacy expansion.
      result[role] = expandLegacyPermissions(
        new Set(cfg[role] ?? ROLE_PERMISSIONS[role]),
        marked && cfg[role] !== undefined
      );
    }
    return result;
  }
);

/** The config as stored (for the editor to seed its initial state). A matrix
 *  saved before the adjust split is shown expanded — as it is enforced — so a
 *  plain re-save (which marks it literal) does not take anything away. */
export async function getRolePermissionConfig(): Promise<RolePermissionConfig> {
  const raw = await getSetting<unknown>(ROLE_PERM_SETTING_KEY, null);
  const cfg = parseRolePermissionConfig(raw);
  if (isSplitMarked(raw)) return cfg;
  for (const role of Object.keys(cfg) as UserRole[]) {
    cfg[role] = [...expandLegacyPermissions(new Set(cfg[role]))];
  }
  return cfg;
}

/** Persist the whole role→permission config. SUPER_ADMIN edits are never saved. */
export async function saveRolePermissionConfig(
  cfg: RolePermissionConfig
): Promise<void> {
  const clean = parseRolePermissionConfig(cfg);
  delete clean.SUPER_ADMIN;
  // Saved now = saved after the adjust split: every role in it is literal.
  const stored = { ...clean, [GRANULAR_SPLIT_MARKER]: true };
  await prisma.systemSetting.upsert({
    where: { key: ROLE_PERM_SETTING_KEY },
    create: {
      key: ROLE_PERM_SETTING_KEY,
      category: SETTING_CATEGORY,
      value: stored as unknown as object,
    },
    update: { category: SETTING_CATEGORY, value: stored as unknown as object },
  });
  // Clear first, then prime — priming before the clear would simply be wiped
  // by it. The read goes through an Accelerate cacheStrategy whose edge cache
  // is not ours to clear, so without the prime a permission change appeared to
  // take up to a minute to apply, or nothing at all on the very first save.
  invalidateSettingsCache();
  primeSetting(ROLE_PERM_SETTING_KEY, stored);
}

/** What the effective-permission engine resolves for one user. */
interface ResolvedAccess {
  role: UserRole | null;
  /** Final set — what `can()` answers from. Includes permissions added by the
   *  admin's own module "show" overrides. */
  perms: Set<Permission>;
  /** The same set WITHOUT the module-override additions. The page decision
   *  reads this, so showing one page does not open its permission-siblings. */
  basePerms: Set<Permission>;
  moduleOverrides: ModuleOverrides;
}

// `User.moduleOverrides` ships in migration 20260929400000. Until it is
// applied, selecting it throws; fall back to the old select (no overrides)
// and skip the doomed query for a few minutes.
let moduleColumnMissingUntil = 0;

type AccessUserRow = {
  role: string;
  permissionOverrides: unknown;
  financeGrants: string[] | null;
  customRoleId: string | null;
  customRole: { permissions: string[]; isActive: boolean } | null;
  moduleOverrides?: unknown;
};

// Last-known-good access row per user, so a DB blip (the prisma retry
// extension already rode out the short ones) doesn't take down every admin
// page. Bounded in size AND age: a memo older than ACCESS_MEMO_MAX_AGE_MS is
// never served, so a revocation is honoured at most that long into an outage.
// No memo → the error propagates and the caller denies; it never grants.
//
// No `cacheStrategy` on the read itself on purpose: an edge-cached row would
// keep a revoked role working for its TTL even when the DB is healthy.
const ACCESS_MEMO_MAX = 500;
const ACCESS_MEMO_MAX_AGE_MS = 10 * 60_000;
const accessMemo = new Map<string, { row: AccessUserRow | null; at: number }>();

function rememberAccess(userId: string, row: AccessUserRow | null) {
  accessMemo.delete(userId); // re-insert → most recent at the end
  accessMemo.set(userId, { row, at: Date.now() });
  if (accessMemo.size > ACCESS_MEMO_MAX) {
    const oldest = accessMemo.keys().next().value;
    if (oldest !== undefined) accessMemo.delete(oldest);
  }
}

async function loadAccessUser(userId: string): Promise<AccessUserRow | null> {
  try {
    const row = await loadAccessUserFresh(userId);
    rememberAccess(userId, row);
    return row;
  } catch (e) {
    const memo = accessMemo.get(userId);
    if (memo && Date.now() - memo.at < ACCESS_MEMO_MAX_AGE_MS) {
      console.error(
        `[permissions] access read failed for ${userId} — serving last-known-good from ${Math.round(
          (Date.now() - memo.at) / 1000
        )}s ago:`,
        e
      );
      return memo.row;
    }
    throw e;
  }
}

async function loadAccessUserFresh(userId: string): Promise<AccessUserRow | null> {
  const base = {
    role: true,
    permissionOverrides: true,
    financeGrants: true,
    customRoleId: true,
    customRole: { select: { permissions: true, isActive: true } },
  } as const;
  if (Date.now() >= moduleColumnMissingUntil) {
    try {
      return (await prisma.user.findUnique({
        where: { id: userId },
        select: { ...base, moduleOverrides: true },
      })) as AccessUserRow | null;
    } catch (e) {
      if (!/moduleOverrides/i.test(String((e as Error)?.message ?? e))) throw e;
      moduleColumnMissingUntil = Date.now() + 5 * 60_000;
    }
  }
  return (await prisma.user.findUnique({
    where: { id: userId },
    select: base,
  })) as AccessUserRow | null;
}

const resolveAccess = cache(async function resolveAccess(
  userId: string
): Promise<ResolvedAccess> {
  const [configured, user] = await Promise.all([
    getConfiguredRolePermissions(),
    loadAccessUser(userId),
  ]);
  if (!user) {
    return { role: null, perms: new Set(), basePerms: new Set(), moduleOverrides: {} };
  }
  const role = user.role as UserRole;
  // Super admin is always full — overrides/config can never strip it.
  if (role === "SUPER_ADMIN") {
    const full = new Set(ROLE_PERMISSIONS.SUPER_ADMIN);
    return { role, perms: full, basePerms: full, moduleOverrides: {} };
  }

  // Base = active custom-role permissions when assigned, else the configured
  // (or default) role set. Custom-role users carry role="ADMIN" as baseline.
  const customRole = user.customRole;
  // A set saved before the adjustment permissions were split gets them back
  // here (see expandLegacyPermissions); the per-user overrides below still
  // have the last word.
  // (The configured role sets arrive already expanded — see
  // getConfiguredRolePermissions — so only a custom role is expanded here.)
  const perms =
    user.customRoleId && customRole?.isActive
      ? expandLegacyPermissions(
          new Set(customRole.permissions.filter(isPermission)),
          customRole.permissions.includes(GRANULAR_SPLIT_MARKER)
        )
      : new Set(configured[role] ?? ROLE_PERMISSIONS[role] ?? []);

  const overrides = parsePermissionOverrides(user.permissionOverrides);
  for (const [perm, granted] of Object.entries(overrides)) {
    if (granted) perms.add(perm as Permission);
    else perms.delete(perm as Permission);
  }
  const financeGrants = user.financeGrants ?? [];
  const moduleOverrides = parseModuleOverrides(user.moduleOverrides);

  // A per-admin page "show" brings that page's permissions with it, so the
  // page and its APIs work. It goes in BEFORE the strip below, which removes
  // any finance permission not in financeGrants; staff-admin permissions are
  // never added in the first place (see permissionsGrantedByModules).
  const withModules = new Set(perms);
  for (const p of permissionsGrantedByModules(moduleOverrides)) withModules.add(p);

  // Hard backstop: strip admins.manage for non-super principals, and every
  // finance permission that was not granted to this person by name. See
  // `stripProtectedForRole` — `financeGrants` is the only way in.
  return {
    role,
    perms: stripProtectedForRole(withModules, role, financeGrants),
    basePerms: stripProtectedForRole(perms, role, financeGrants),
    moduleOverrides,
  };
});

/**
 * Where one admin's access comes from, for the Control Center: what their
 * role (or custom role) gives them, what the super admin granted or blocked
 * on top, their finance grants, and the result. `base` is the role's set
 * BEFORE per-user overrides, so the editor can show "Default" truthfully.
 */
export async function getAccessBreakdown(userId: string): Promise<{
  role: UserRole;
  base: Permission[];
  overrides: Record<string, boolean>;
  financeGrants: string[];
  effective: Permission[];
} | null> {
  const [configured, user] = await Promise.all([
    getConfiguredRolePermissions(),
    loadAccessUser(userId),
  ]);
  if (!user) return null;
  const role = user.role as UserRole;
  const base =
    role === "SUPER_ADMIN"
      ? new Set(ROLE_PERMISSIONS.SUPER_ADMIN)
      : user.customRoleId && user.customRole?.isActive
        ? expandLegacyPermissions(
            new Set(user.customRole.permissions.filter(isPermission)),
            user.customRole.permissions.includes(GRANULAR_SPLIT_MARKER)
          )
        : new Set(configured[role] ?? ROLE_PERMISSIONS[role] ?? []);
  return {
    role,
    base: [...base],
    overrides: parsePermissionOverrides(user.permissionOverrides),
    financeGrants: user.financeGrants ?? [],
    effective: [...(await resolveAccess(userId)).perms],
  };
}

/**
 * A user's effective permission set = configured role perms ± per-user
 * overrides + the permissions of admin pages shown to them by name.
 * Request-cached by user id (layout + child pages resolve once per render).
 */
export const getEffectivePermissions = cache(
  async function getEffectivePermissions(
    userId: string
  ): Promise<Set<Permission>> {
    return (await resolveAccess(userId)).perms;
  }
);

// ── Admin pages (modules): which exist for whom ──────────────────────────────

/** `admin_modules.rules` (sanitized). Rides getSetting's cache. */
export const getAdminModuleRules = cache(
  async function getAdminModuleRules(): Promise<AdminModuleRules> {
    return parseAdminModuleRules(
      await getSetting<unknown>(ADMIN_MODULE_RULES_KEY, null)
    );
  }
);

/** Persist the rules (caller must be the super admin). Returns what was saved. */
export async function saveAdminModuleRules(
  rules: unknown
): Promise<AdminModuleRules> {
  const clean = parseAdminModuleRules(rules);
  await prisma.systemSetting.upsert({
    where: { key: ADMIN_MODULE_RULES_KEY },
    create: {
      key: ADMIN_MODULE_RULES_KEY,
      category: SETTING_CATEGORY,
      value: clean as unknown as object,
    },
    update: { category: SETTING_CATEGORY, value: clean as unknown as object },
  });
  invalidateSettingsCache();
  primeSetting(ADMIN_MODULE_RULES_KEY, clean);
  return clean;
}

/** The admin's role, base permissions and own overrides (for the per-admin panel). */
export async function getModuleAccessInputs(userId: string) {
  const [access, rules] = await Promise.all([
    resolveAccess(userId),
    getAdminModuleRules(),
  ]);
  return { ...access, rules };
}

/** Every module's decision for one admin (rules + their own overrides). */
export async function getModuleDecisions(
  userId: string
): Promise<Map<string, ModuleDecision>> {
  const { role, basePerms, moduleOverrides, rules } =
    await getModuleAccessInputs(userId);
  const out = new Map<string, ModuleDecision>();
  if (!role) return out;
  for (const m of ADMIN_MODULES) {
    out.set(m.href, decideModule(m, role, basePerms, rules, moduleOverrides));
  }
  return out;
}

/** Is this admin page (module href) available to the user? Super admin: always. */
export async function moduleAllowed(userId: string, href: string): Promise<boolean> {
  const d = (await getModuleDecisions(userId)).get(href);
  return d ? d.visible : true;
}

/**
 * Route form of `moduleAllowed`: the module owning `pathname` (longest
 * prefix). Paths no module owns are allowed.
 */
export async function moduleRouteAllowed(
  userId: string,
  pathname: string
): Promise<boolean> {
  const mod = moduleForPath(pathname);
  if (!mod) return true;
  return moduleAllowed(userId, mod.href);
}

/**
 * API guard, applied inside `can()`/`canAny()`/`canAll()`: when the current
 * request is an admin API that belongs to exactly one admin page (see
 * API_MODULE_PREFIXES in admin-module-rules.ts), that page must be available
 * to the caller. Only ever refuses; fails OPEN when there is no request or no
 * x-pathname (scripts; `next dev`, where middleware does not run), and the
 * super admin is always allowed.
 */
async function apiModuleAllowed(userId: string): Promise<boolean> {
  let path = "";
  try {
    path = (await headers()).get("x-pathname") ?? "";
  } catch {
    return true;
  }
  if (!path.startsWith("/api/admin/")) return true;
  const href = moduleForApiPath(path);
  if (!href) return true;
  return moduleAllowed(userId, href);
}

/** The current session's effective permissions (empty if unauthenticated). */
export async function currentPermissions(): Promise<Set<Permission>> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return new Set();
  return getEffectivePermissions(id);
}

/** True if the user has the permission (effective, override-aware). */
export async function can(
  userId: string | undefined,
  permission: Permission
): Promise<boolean> {
  if (!userId) return false;
  if (!(await getEffectivePermissions(userId)).has(permission)) return false;
  return apiModuleAllowed(userId);
}

export async function canAny(
  userId: string | undefined,
  permissions: Permission[]
): Promise<boolean> {
  if (!userId) return false;
  const perms = await getEffectivePermissions(userId);
  if (!permissions.some((p) => perms.has(p))) return false;
  return apiModuleAllowed(userId);
}

export async function canAll(
  userId: string | undefined,
  permissions: Permission[]
): Promise<boolean> {
  if (!userId) return false;
  const perms = await getEffectivePermissions(userId);
  if (!permissions.every((p) => perms.has(p))) return false;
  return apiModuleAllowed(userId);
}

/**
 * Admin nav modules the user can actually see (grouped): permissions first,
 * then the page rules (off for all / per role / per admin).
 */
export async function getEffectiveModules(
  userId: string
): Promise<
  Array<{ category: ModuleCategory; label: string; modules: AdminModule[] }>
> {
  const decisions = await getModuleDecisions(userId);
  const visible = ADMIN_MODULES.filter((m) => decisions.get(m.href)?.visible);
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    modules: visible.filter((m) => m.category === category),
  })).filter((g) => g.modules.length > 0);
}

/**
 * Page guard: resolve the session, redirect to /login if unauthenticated, or to
 * /admin/no-access if the effective set lacks `permission`. Returns the session
 * so callers can reuse it. Use at the top of an admin server page.
 */
export async function requirePermission(permission: Permission) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const perms = await getEffectivePermissions(session.user.id);
  if (!perms.has(permission)) redirect("/admin/no-access");
  return session;
}

/**
 * Central path guard used by the admin layout: given the request pathname and
 * the user's effective perms, returns true if the owning module is accessible.
 * Paths not owned by any module are allowed (e.g. /admin/no-access itself).
 */
export function pathAllowed(pathname: string, perms: Set<Permission>): boolean {
  const mod = moduleForPath(pathname);
  if (!mod) return true;
  return mod.permissions.some((p) => perms.has(p));
}
