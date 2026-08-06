import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import {
  getRolePermissionConfig,
  saveRolePermissionConfig,
  parseRolePermissionConfig,
} from "@/lib/permissions";
import { isSuperAdmin, type UserRole } from "@/lib/rbac";

// GET: the saved role→permission overrides (super-admin editor seeds from this).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "admins.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const config = await getRolePermissionConfig();
  return NextResponse.json({ config });
}

// POST: replace the role→permission config. Super-admin only; SUPER_ADMIN's own
// row is always ignored (it is force-full in the engine — no lock-out).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = session.user.role as UserRole | undefined;
  if (!isSuperAdmin(role) || !(await can(session.user.id, "admins.manage"))) {
    return NextResponse.json(
      { error: "Only a super admin can edit role permissions" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const config = parseRolePermissionConfig(body?.config);
  await saveRolePermissionConfig(config);

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "ROLE_PERMISSIONS_UPDATED",
      entity: "RolePermissions",
      entityId: "rbac.role_permissions",
      newData: config as unknown as object,
    },
  });

  return NextResponse.json({ ok: true, config });
}
