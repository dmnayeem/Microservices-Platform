import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = String(body.title);
  if (body.category !== undefined) data.category = body.category || null;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.iconUrl !== undefined) data.iconUrl = String(body.iconUrl);
  if (body.embedUrl !== undefined) data.embedUrl = String(body.embedUrl);
  if (body.order !== undefined) data.order = parseInt(body.order) || 0;
  if (body.isActive !== undefined) data.isActive = !!body.isActive;

  const game = await prisma.game.update({ where: { id }, data });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "GAME_UPDATED",
      entity: "Game",
      entityId: id,
      newData: JSON.parse(JSON.stringify(data)),
    },
  });
  return NextResponse.json({ success: true, game });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.game.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "GAME_DELETED",
      entity: "Game",
      entityId: id,
    },
  });
  return NextResponse.json({ success: true });
}
