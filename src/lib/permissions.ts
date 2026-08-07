import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getSetting, invalidateSettingsCache } from "@/lib/system-settings";
import {
  ROLE_PERMISSIONS,
  isPermission,
  parsePermissionOverrides,
  stripProtectedForRole,
  getGroupedModulesForPerms,
  moduleForPath,
  type Permission,
  type UserRole,
  type ModuleCategory,
  type AdminModule,
} from "@/lib/rbac";

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
    const result = {} as Record<UserRole, Set<Permission>>;
    for (const role of Object.keys(ROLE_PERMISSIONS) as UserRole[]) {
      if (role === "SUPER_ADMIN") {
        result[role] = new Set(ROLE_PERMISSIONS.SUPER_ADMIN);
        continue;
      }
      result[role] = new Set(cfg[role] ?? ROLE_PERMISSIONS[role]);
    }
    return result;
  }
);

/** The raw config as stored (for the editor to seed its initial state). */
export async function getRolePermissionConfig(): Promise<RolePermissionConfig> {
  const raw = await getSetting<unknown>(ROLE_PERM_SETTING_KEY, null);
  return parseRolePermissionConfig(raw);
}

/** Persist the whole role→permission config. SUPER_ADMIN edits are never saved. */
export async function saveRolePermissionConfig(
  cfg: RolePermissionConfig
): Promise<void> {
  const clean = parseRolePermissionConfig(cfg);
  delete clean.SUPER_ADMIN;
  await prisma.systemSetting.upsert({
    where: { key: ROLE_PERM_SETTING_KEY },
    create: {
      key: ROLE_PERM_SETTING_KEY,
      category: SETTING_CATEGORY,
      value: clean as unknown as object,
    },
    update: { category: SETTING_CATEGORY, value: clean as unknown as object },
  });
  invalidateSettingsCache();
}

/**
 * A user's effective permission set = configured role perms ± per-user overrides.
 * Request-cached by user id (layout + child pages resolve once per render).
 */
export const getEffectivePermissions = cache(
  async function getEffectivePermissions(
    userId: string
  ): Promise<Set<Permission>> {
    const [configured, user] = await Promise.all([
      getConfiguredRolePermissions(),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          permissionOverrides: true,
          customRoleId: true,
          customRole: { select: { permissions: true, isActive: true } },
        },
      }),
    ]);
    if (!user) return new Set();
    const role = user.role as UserRole;
    // Super admin is always full — overrides/config can never strip it.
    if (role === "SUPER_ADMIN") return new Set(ROLE_PERMISSIONS.SUPER_ADMIN);

    // Base = active custom-role permissions when assigned, else the configured
    // (or default) role set. Custom-role users carry role="ADMIN" as baseline.
    const customRole = user.customRole as
      | { permissions: string[]; isActive: boolean }
      | null;
    const perms =
      user.customRoleId && customRole?.isActive
        ? new Set(customRole.permissions.filter(isPermission))
        : new Set(configured[role] ?? ROLE_PERMISSIONS[role] ?? []);

    const overrides = parsePermissionOverrides(user.permissionOverrides);
    for (const [perm, granted] of Object.entries(overrides)) {
      if (granted) perms.add(perm as Permission);
      else perms.delete(perm as Permission);
    }
    // Hard backstop: strip finance + admins.manage for non-super principals
    // (finance kept only for the built-in FINANCE_ADMIN role).
    return stripProtectedForRole(perms, role);
  }
);

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
  return (await getEffectivePermissions(userId)).has(permission);
}

export async function canAny(
  userId: string | undefined,
  permissions: Permission[]
): Promise<boolean> {
  if (!userId) return false;
  const perms = await getEffectivePermissions(userId);
  return permissions.some((p) => perms.has(p));
}

export async function canAll(
  userId: string | undefined,
  permissions: Permission[]
): Promise<boolean> {
  if (!userId) return false;
  const perms = await getEffectivePermissions(userId);
  return permissions.every((p) => perms.has(p));
}

/** Admin nav modules the user can actually see (grouped), config/override-aware. */
export async function getEffectiveModules(
  userId: string
): Promise<
  Array<{ category: ModuleCategory; label: string; modules: AdminModule[] }>
> {
  const perms = await getEffectivePermissions(userId);
  return getGroupedModulesForPerms(perms);
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
