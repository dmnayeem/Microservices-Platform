import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  ADMIN_MODULES,
  FINANCE_PERMISSIONS,
  isPermission,
  sanitizeCustomRolePermissions,
  type Permission,
  type UserRole,
} from "@/lib/rbac";
import {
  getAdminModuleRules,
  getRolePermissionConfig,
  saveAdminModuleRules,
  saveRolePermissionConfig,
} from "@/lib/permissions";
import { CONFIGURABLE_ADMIN_ROLES, isConfigurableModule } from "@/lib/admin-module-rules";
import { setRoleMoneyFor } from "@/lib/role-money";

/**
 * PUT /api/admin/access/designation — everything one designation (a built-in
 * staff role, or a custom role) gets, saved in one go from Access → By
 * designation: its permissions (money included) and the admin pages hidden
 * from it. Super admin only (DB role).
 *
 * Writes the same three stores the older tabs use, so those tabs keep showing
 * the truth: the role matrix (or the custom role row), the designation money
 * row (lib/role-money.ts) and the admin page rules.
 */

const FINANCE = new Set<string>(FINANCE_PERMISSIONS);

const schema = z.object({
  key: z.string().min(1).max(80),
  permissions: z.array(z.string()).max(500),
  hiddenPages: z.array(z.string()).max(500),
});

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (me?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only a super admin can change a designation's access" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { key } = parsed.data;

  const perms = [...new Set(parsed.data.permissions.filter(isPermission))] as Permission[];
  const money = perms.filter((p) => FINANCE.has(p));
  const ordinary = perms.filter((p) => !FINANCE.has(p));
  const configurableHrefs = new Set(ADMIN_MODULES.filter(isConfigurableModule).map((m) => m.href));
  const hidden = [...new Set(parsed.data.hiddenPages.filter((h) => configurableHrefs.has(h)))];

  let label: string;
  const rules = await getAdminModuleRules();

  if (key.startsWith("custom:")) {
    const id = key.slice("custom:".length);
    const cr = await prisma.customRole.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!cr) return NextResponse.json({ error: "That custom role no longer exists" }, { status: 404 });
    label = cr.name;
    await prisma.customRole.update({
      where: { id },
      data: { permissions: sanitizeCustomRolePermissions(ordinary) },
    });
    await setRoleMoneyFor(key, money);
    await saveAdminModuleRules({ ...rules, customRoles: { ...(rules.customRoles ?? {}), [id]: hidden } });
  } else {
    const role = key as UserRole;
    if (!CONFIGURABLE_ADMIN_ROLES.includes(role)) {
      return NextResponse.json({ error: "Unknown designation" }, { status: 400 });
    }
    label = role;
    const cfg = await getRolePermissionConfig();
    // The finance admin's money lives in its own role set (it is the finance
    // role); every other designation's money lives in the designation money row.
    cfg[role] = role === "FINANCE_ADMIN" ? perms : ordinary;
    await saveRolePermissionConfig(cfg);
    await setRoleMoneyFor(key, role === "FINANCE_ADMIN" ? [] : money);
    await saveAdminModuleRules({
      ...rules,
      roles: { ...rules.roles, [role]: hidden },
    });
  }

  await writeAudit({
    actorId: session.user.id,
    action: "DESIGNATION_ACCESS_UPDATED",
    entity: "Designation",
    entityId: key,
    summary: `Access for ${label}: ${perms.length} permission(s) (${money.length} money), ${hidden.length} page(s) hidden`,
    meta: { key, permissions: perms, money, hiddenPages: hidden },
  });

  return NextResponse.json({ ok: true });
}
