import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import {
  isSuperAdmin,
  sanitizeCustomRolePermissions,
  type UserRole,
} from "@/lib/rbac";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const schema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().max(40).optional().nullable(),
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

async function gate(userId: string, role: UserRole | undefined) {
  return isSuperAdmin(role) && (await can(userId, "admins.manage"));
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await gate(session.user.id, session.user.role as UserRole | undefined)))
    return NextResponse.json({ error: "Only a super admin can manage custom roles" }, { status: 403 });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name.trim();
  if (d.color !== undefined) data.color = d.color?.trim() || null;
  if (d.permissions !== undefined) data.permissions = sanitizeCustomRolePermissions(d.permissions);
  if (d.isActive !== undefined) data.isActive = d.isActive;

  try {
    const role = await prisma.customRole.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CUSTOM_ROLE_UPDATED",
        entity: "CustomRole",
        entityId: id,
        newData: { name: role.name, permissions: role.permissions, isActive: role.isActive },
      },
    });
    return NextResponse.json({ role });
  } catch {
    return NextResponse.json({ error: "Role not found or name taken." }, { status: 400 });
  }
}

// DELETE — assigned users' customRoleId is set null via the FK (they fall back
// to plain ADMIN permissions).
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await gate(session.user.id, session.user.role as UserRole | undefined)))
    return NextResponse.json({ error: "Only a super admin can manage custom roles" }, { status: 403 });

  const { id } = await params;
  await prisma.customRole.delete({ where: { id } }).catch(() => null);
  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "CUSTOM_ROLE_DELETED", entity: "CustomRole", entityId: id },
  });
  return NextResponse.json({ ok: true });
}
