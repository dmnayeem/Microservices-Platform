import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import {
  isSuperAdmin,
  isPermission,
  stripProtectedForRole,
  type Permission,
  type UserRole,
} from "@/lib/rbac";
import { z } from "zod";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "role";

/** Keep only real permissions and drop protected caps (finance + admins.manage). */
export function sanitizeCustomRolePermissions(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const set = new Set<Permission>(list.filter(isPermission) as Permission[]);
  // "ADMIN" role → strips finance + admins.manage (custom roles never hold them).
  return Array.from(stripProtectedForRole(set, "ADMIN"));
}

const schema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().max(40).optional().nullable(),
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// Super-admin gate shared by all custom-role writes.
async function requireSuperAdmin(userId: string, role: UserRole | undefined) {
  return isSuperAdmin(role) && (await can(userId, "admins.manage"));
}

// GET — list custom roles (visible to admins.view for the assignment dropdown).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "admins.view")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const roles = await prisma.customRole.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });
  return NextResponse.json({ roles });
}

// POST — create a custom role (super-admin only).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role as UserRole | undefined;
  if (!(await requireSuperAdmin(session.user.id, role)))
    return NextResponse.json({ error: "Only a super admin can manage custom roles" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;

  let slug = slugify(d.name);
  for (let i = 2; await prisma.customRole.findUnique({ where: { slug } }); i++) slug = `${slugify(d.name)}-${i}`;

  try {
    const created = await prisma.customRole.create({
      data: {
        name: d.name.trim(),
        slug,
        color: d.color?.trim() || null,
        permissions: sanitizeCustomRolePermissions(d.permissions),
        isActive: d.isActive ?? true,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CUSTOM_ROLE_CREATED",
        entity: "CustomRole",
        entityId: created.id,
        newData: { name: created.name, permissions: created.permissions },
      },
    });
    return NextResponse.json({ role: created });
  } catch {
    return NextResponse.json({ error: "A role with that name already exists." }, { status: 409 });
  }
}
