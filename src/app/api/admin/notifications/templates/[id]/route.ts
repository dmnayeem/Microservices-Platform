import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { cleanTemplateContent, TEMPLATE_NAME_MAX } from "@/lib/notification-templates";

async function gate() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await can(session.user.id, "notifications.send"))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

/** Update a template's name and/or content. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if ("error" in g) return g.error;
  const { id } = await params;

  const current = await prisma.notificationTemplate.findUnique({ where: { id }, select: { name: true } });
  if (!current) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { name?: unknown; content?: unknown } | null;
  const data: { name?: string; content?: object; updatedById: string } = { updatedById: g.userId };

  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Give the template a name" }, { status: 400 });
    if (name.length > TEMPLATE_NAME_MAX) {
      return NextResponse.json({ error: `Name is too long (max ${TEMPLATE_NAME_MAX})` }, { status: 400 });
    }
    if (name !== current.name) {
      const clash = await prisma.notificationTemplate.findUnique({ where: { name }, select: { id: true } });
      if (clash) {
        return NextResponse.json({ error: `A template named "${name}" already exists` }, { status: 409 });
      }
    }
    data.name = name;
  }
  if (body?.content !== undefined) {
    const c = cleanTemplateContent(body.content);
    if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
    data.content = c.content as object;
  }

  const t = await prisma.notificationTemplate.update({
    where: { id },
    data,
    select: { id: true, name: true, content: true, usageCount: true, lastUsedAt: true, updatedAt: true },
  });

  await writeAudit({
    actorId: g.userId,
    action: "NOTIFICATION_TEMPLATE_UPDATED",
    entity: "NotificationTemplate",
    entityId: id,
    summary:
      data.name && data.name !== current.name
        ? `Updated notification template "${current.name}" (renamed to "${data.name}")`
        : `Updated notification template "${current.name}"`,
  });

  return NextResponse.json({ template: t });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if ("error" in g) return g.error;
  const { id } = await params;

  const t = await prisma.notificationTemplate.findUnique({ where: { id }, select: { name: true, content: true } });
  if (!t) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  await prisma.notificationTemplate.delete({ where: { id } });

  // The row is gone after this, so the audit keeps a copy of what was deleted.
  await writeAudit({
    actorId: g.userId,
    action: "NOTIFICATION_TEMPLATE_DELETED",
    entity: "NotificationTemplate",
    entityId: id,
    summary: `Deleted notification template "${t.name}"`,
    meta: { name: t.name, content: t.content as Record<string, unknown> },
  });

  return NextResponse.json({ ok: true });
}
