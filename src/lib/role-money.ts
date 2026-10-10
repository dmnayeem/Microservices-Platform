import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSetting, invalidateSettingsCache, primeSetting } from "@/lib/system-settings";
import { FINANCE_PERMISSIONS, type Permission, type UserRole } from "@/lib/rbac";

/**
 * Money permissions given to a whole DESIGNATION (owner, 2026-10-10): points,
 * cash, withdrawals, payment methods, plans, payroll, finance books. Before
 * this, only Finance Admin held them by role and everyone else needed a
 * by-name grant; now the super admin decides per designation.
 *
 * Kept apart from the role permission matrix on purpose: `stripProtectedForRole`
 * still removes every money permission that did not come from here or from a
 * by-name grant, and only the super-admin designation route writes this row —
 * so a stray role-matrix save or a manager's per-user edit can still never
 * hand out money.
 *
 * Key: a built-in role ("MANAGER") or "custom:<customRoleId>".
 */

export const ROLE_MONEY_KEY = "rbac.role_money";
const CATEGORY = "access";
const FINANCE = new Set<string>(FINANCE_PERMISSIONS);

export type RoleMoney = Record<string, Permission[]>;

export function designationKey(role: UserRole | string, customRoleId?: string | null): string {
  return customRoleId ? `custom:${customRoleId}` : role;
}

export function parseRoleMoney(raw: unknown): RoleMoney {
  const out: RoleMoney = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^([A-Z_]+|custom:[A-Za-z0-9_-]+)$/.test(k) || k === "SUPER_ADMIN" || !Array.isArray(v)) continue;
    const perms = [...new Set(v.filter((p): p is Permission => typeof p === "string" && FINANCE.has(p)))];
    if (perms.length) out[k] = perms;
  }
  return out;
}

/** Request-cached; rides getSetting's cache. */
export const getRoleMoney = cache(async function getRoleMoney(): Promise<RoleMoney> {
  return parseRoleMoney(await getSetting<unknown>(ROLE_MONEY_KEY, null));
});

/** Replace one designation's money permissions. Caller must be the super admin. */
export async function setRoleMoneyFor(key: string, perms: string[]): Promise<RoleMoney> {
  const current = parseRoleMoney(await getSetting<unknown>(ROLE_MONEY_KEY, null));
  const clean = parseRoleMoney({ ...current, [key]: perms });
  if (!clean[key]) delete clean[key];
  await prisma.systemSetting.upsert({
    where: { key: ROLE_MONEY_KEY },
    create: { key: ROLE_MONEY_KEY, category: CATEGORY, value: clean as unknown as object },
    update: { category: CATEGORY, value: clean as unknown as object },
  });
  invalidateSettingsCache();
  primeSetting(ROLE_MONEY_KEY, clean);
  return clean;
}
