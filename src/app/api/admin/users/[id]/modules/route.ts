import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getModuleAccessInputs } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import {
  ADMIN_MODULES,
  ADMIN_ROLES,
  FINANCE_PERMISSIONS,
  type UserRole,
} from "@/lib/rbac";
import {
  decideInherited,
  isConfigurableModule,
  parseModuleOverrides,
  type ModuleOverrides,
} from "@/lib/admin-module-rules";

// Per-admin admin-page overrides (`User.moduleOverrides`). Super admin only,
// both ways: the inherited state it shows is itself access information.

type Ctx = { params: Promise<{ id: string }> };

async function requireSuper() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (me?.role !== "SUPER_ADMIN") {
    return {
      error: NextResponse.json(
        { error: "Only a super admin can set an admin's pages" },
        { status: 403 }
      ),
    };
  }
  return { actorId: session.user.id };
}

const FINANCE = new Set<string>(FINANCE_PERMISSIONS);

export async function GET(_req: NextRequest, { params }: Ctx) {
  const guard = await requireSuper();
  if ("error" in guard) return guard.error;
  const { id } = await params;

  const { role, basePerms, moduleOverrides, rules } = await getModuleAccessInputs(id);
  if (!role) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!ADMIN_ROLES.includes(role) || role === "SUPER_ADMIN") {
    return NextResponse.json({ role, applicable: false, modules: [] });
  }

  const modules = ADMIN_MODULES.map((m) => {
    const inherited = decideInherited(m, role, basePerms, rules);
    return {
      href: m.href,
      name: m.name,
      icon: m.icon,
      category: m.category,
      configurable: isConfigurableModule(m),
      // A finance page shown by override still needs a finance grant to work:
      // its permissions are stripped without one.
      financeOnly: m.permissions.every((p) => FINANCE.has(p)),
      override: moduleOverrides[m.href] ?? null,
      inherited,
    };
  });
  return NextResponse.json({ role, applicable: true, modules });
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const guard = await requireSuper();
  if ("error" in guard) return guard.error;
  const { id } = await params;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const role = target.role as UserRole;
  if (!ADMIN_ROLES.includes(role) || role === "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Admin pages can only be set for admin accounts below super admin" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const next: ModuleOverrides = parseModuleOverrides(body?.overrides);
  const { moduleOverrides: before } = await getModuleAccessInputs(id);

  try {
    await prisma.user.update({
      where: { id },
      data: { moduleOverrides: Object.keys(next).length ? next : Prisma.DbNull },
    });
  } catch (e) {
    if (/moduleOverrides/i.test(String((e as Error)?.message ?? e))) {
      return NextResponse.json(
        {
          error:
            "The database is missing User.moduleOverrides — apply migration 20260929400000_admin_module_overrides first.",
        },
        { status: 409 }
      );
    }
    throw e;
  }

  const nameOf = (h: string) => ADMIN_MODULES.find((m) => m.href === h)?.name ?? h;
  const changes: string[] = [];
  for (const h of new Set([...Object.keys(before), ...Object.keys(next)])) {
    if (before[h] === next[h]) continue;
    changes.push(`${nameOf(h)}: ${before[h] ?? "inherit"} → ${next[h] ?? "inherit"}`);
  }

  await writeAudit({
    actorId: guard.actorId,
    action: "ADMIN_MODULE_OVERRIDES_UPDATED",
    entity: "User",
    entityId: id,
    targetUserId: id,
    summary: `Admin pages for ${target.email}: ${changes.length ? changes.join("; ") : "no change"}`,
    meta: { before, after: next },
  });

  return NextResponse.json({ ok: true, overrides: next });
}
