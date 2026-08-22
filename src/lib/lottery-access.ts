import "server-only";
import { can } from "@/lib/permissions";
import { hasPermission, type UserRole } from "@/lib/rbac";

/**
 * Who may see and manage lotteries.
 *
 * `lottery.view` / `lottery.manage` exist in the permission table, are
 * described, and are granted to several roles — but until now **nothing
 * enforced them**. Every lottery page and route gated on `settings.view` /
 * `settings.edit` instead, while the sidebar entry gated on `lottery.view`. A
 * role with `lottery.view` therefore saw the nav link and got redirected the
 * moment it clicked.
 *
 * Either permission grants access. Switching to `lottery.*` alone would have
 * locked out anyone who has `settings.edit` today, which is how a fix for a
 * broken link turns into an access-control incident.
 */

export async function canViewLottery(userId: string): Promise<boolean> {
  return (
    (await can(userId, "lottery.view")) || (await can(userId, "settings.view"))
  );
}

export async function canManageLottery(userId: string): Promise<boolean> {
  return (
    (await can(userId, "lottery.manage")) || (await can(userId, "settings.edit"))
  );
}

/**
 * Static-role variants for server pages that only have `session.user.role`.
 * Prefer the `can()` versions — these can't see custom roles or per-user
 * overrides — but pages already using `hasPermission` stay consistent.
 */
export function roleCanViewLottery(role: UserRole | undefined): boolean {
  return (
    hasPermission(role, "lottery.view") ||
    hasPermission(role, "settings.view") ||
    hasPermission(role, "settings.edit")
  );
}

export function roleCanManageLottery(role: UserRole | undefined): boolean {
  return (
    hasPermission(role, "lottery.manage") || hasPermission(role, "settings.edit")
  );
}
