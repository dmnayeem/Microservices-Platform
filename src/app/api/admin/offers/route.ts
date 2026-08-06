import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ensureUniqueOfferSlug } from "@/lib/offers-server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offers.view")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const offers = await prisma.offer.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ offers });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "offers.manage")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 160)
      : "Untitled offer";
  const slug = await ensureUniqueOfferSlug(body.slug || title);

  const offer = await prisma.offer.create({
    data: {
      title,
      slug,
      blocks: [],
      status: "DRAFT",
      createdById: session.user.id,
    },
    select: { id: true, slug: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "OFFER_CREATED",
      entity: "Offer",
      entityId: offer.id,
      newData: { title, slug },
    },
  });

  return NextResponse.json({ success: true, offer }, { status: 201 });
}
