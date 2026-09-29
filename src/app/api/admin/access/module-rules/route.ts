import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, getAdminModuleRules, saveAdminModuleRules } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { ADMIN_MODULES } from "@/lib/rbac";
import type { AdminModuleRules } from "@/lib/admin-module-rules";

// Which admin pages exist for which admins: `admin_modules.rules`.
// Read: anyone who can see /admin/access. Write: the super admin only — the
// role is read from the database, not the (possibly stale) session token.

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "admins.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ rules: await getAdminModuleRules() });
}

function nameOf(href: string): string {
  return ADMIN_MODULES.find((m) => m.href === href)?.name ?? href;
}

function describeChange(before: AdminModuleRules, after: AdminModuleRules): string {
  const parts: string[] = [];
  const diff = (label: string, a: string[] = [], b: string[] = []) => {
    const on = b.filter((h) => !a.includes(h)).map(nameOf);
    const off = a.filter((h) => !b.includes(h)).map(nameOf);
    if (on.length) parts.push(`${label}: hid ${on.join(", ")}`);
    if (off.length) parts.push(`${label}: restored ${off.join(", ")}`);
  };
  diff("All admins", before.disabled, after.disabled);
  const roles = new Set([...Object.keys(before.roles), ...Object.keys(after.roles)]);
  for (const r of roles) {
    diff(r, before.roles[r as keyof typeof before.roles], after.roles[r as keyof typeof after.roles]);
  }
  return parts.length ? parts.join("; ") : "No change";
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (me?.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only a super admin can change which admin pages exist" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const before = await getAdminModuleRules();
  const saved = await saveAdminModuleRules(body?.rules);

  await writeAudit({
    actorId: session.user.id,
    action: "ADMIN_MODULE_RULES_UPDATED",
    entity: "AdminModuleRules",
    entityId: "admin_modules.rules",
    summary: `Admin pages: ${describeChange(before, saved)}`,
    meta: { before, after: saved },
  });

  return NextResponse.json({ ok: true, rules: saved });
}
