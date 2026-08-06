import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseBlocks } from "@/lib/offers";
import { ensureUniqueOfferSlug } from "@/lib/offers-server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offers.view")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const offer = await prisma.offer.findUnique({ where: { id } });
  if (!offer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ offer });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offers.manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.offer.findUnique({ where: { id } });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.title === "string") data.title = body.title.trim().slice(0, 160) || "Untitled offer";
  if (body.description !== undefined)
    data.description = body.description ? String(body.description).slice(0, 300) : null;
  if (body.thumbnailUrl !== undefined) data.thumbnailUrl = body.thumbnailUrl || null;
  if (body.bgGradient !== undefined) data.bgGradient = body.bgGradient || null;
  if (body.status === "DRAFT" || body.status === "PUBLISHED") data.status = body.status;
  if (Array.isArray(body.blocks)) data.blocks = parseBlocks(body.blocks);

  // Slug: re-slugify + ensure uniqueness (excluding this offer) when provided.
  if (typeof body.slug === "string" && body.slug.trim()) {
    data.slug = await ensureUniqueOfferSlug(body.slug, id);
  }

  const offer = await prisma.offer.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "OFFER_UPDATED",
      entity: "Offer",
      entityId: id,
      newData: { title: offer.title, slug: offer.slug, status: offer.status },
    },
  });

  return NextResponse.json({ success: true, offer });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offers.manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.offer.delete({ where: { id } }).catch(() => {});

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "OFFER_DELETED",
      entity: "Offer",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}
