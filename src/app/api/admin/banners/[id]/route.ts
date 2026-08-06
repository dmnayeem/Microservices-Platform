import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "banners.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.subtitle !== undefined) data.subtitle = body.subtitle ?? null;
  if (body.iconEmoji !== undefined) data.iconEmoji = body.iconEmoji ?? null;
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl ?? null;
  if (body.videoUrl !== undefined) data.videoUrl = body.videoUrl || null;
  if (body.bgGradient !== undefined) data.bgGradient = body.bgGradient ?? null;
  if (body.linkUrl !== undefined) data.linkUrl = body.linkUrl ?? null;
  if (body.location !== undefined) data.location = body.location;
  if (body.order !== undefined) data.order = parseInt(body.order);
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  if (body.startsAt !== undefined)
    data.startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (body.endsAt !== undefined)
    data.endsAt = body.endsAt ? new Date(body.endsAt) : null;

  const updated = await prisma.banner.update({ where: { id }, data });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "BANNER_UPDATED",
      entity: "Banner",
      entityId: id,
      newData: JSON.parse(JSON.stringify(data)),
    },
  });
  return NextResponse.json({ success: true, banner: updated });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "banners.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.banner.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "BANNER_DELETED",
      entity: "Banner",
      entityId: id,
    },
  });
  return NextResponse.json({ success: true });
}
