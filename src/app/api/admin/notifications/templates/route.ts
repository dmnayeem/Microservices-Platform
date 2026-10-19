import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { cleanTemplateContent, TEMPLATE_NAME_MAX } from "@/lib/notification-templates";

/**
 * Saved notification templates. Same gate as the composer itself
 * (`notifications.send`) — a template is only useful to someone who can send.
 */
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

export async function GET() {
  const g = await gate();
  if ("error" in g) return g.error;

  const templates = await prisma.notificationTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: { id: true, name: true, content: true, usageCount: true, lastUsedAt: true, updatedAt: true },
  });
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const g = await gate();
  if ("error" in g) return g.error;

  const body = (await req.json().catch(() => null)) as { name?: unknown; content?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Give the template a name" }, { status: 400 });
  if (name.length > TEMPLATE_NAME_MAX) {
    return NextResponse.json({ error: `Name is too long (max ${TEMPLATE_NAME_MAX})` }, { status: 400 });
  }
  const c = cleanTemplateContent(body?.content);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });

  const exists = await prisma.notificationTemplate.findUnique({ where: { name }, select: { id: true } });
  if (exists) {
    return NextResponse.json(
      { error: `A template named "${name}" already exists — pick another name or update that one` },
      { status: 409 }
    );
  }

  const t = await prisma.notificationTemplate.create({
    data: { name, content: c.content as object, createdById: g.userId, updatedById: g.userId },
    select: { id: true, name: true, content: true, usageCount: true, lastUsedAt: true, updatedAt: true },
  });

  await writeAudit({
    actorId: g.userId,
    action: "NOTIFICATION_TEMPLATE_CREATED",
    entity: "NotificationTemplate",
    entityId: t.id,
    summary: `Saved notification template "${name}"`,
  });

  return NextResponse.json({ template: t }, { status: 201 });
}
