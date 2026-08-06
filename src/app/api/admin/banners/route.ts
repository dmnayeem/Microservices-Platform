import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(2).max(120),
  subtitle: z.string().max(240).optional().nullable(),
  imageUrl: z.string().url().optional().nullable().or(z.literal("")),
  videoUrl: z.string().url().optional().nullable().or(z.literal("")),
  iconEmoji: z.string().max(8).optional().nullable(),
  bgGradient: z.string().max(80).optional().nullable(),
  linkUrl: z.string().url().optional().nullable().or(z.literal("")),
  location: z
    .enum(["HOME", "EARN_HUB", "MARKETPLACE", "DASHBOARD", "ALL"])
    .default("HOME"),
  order: z.number().int().default(0),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "banners.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const banners = await prisma.banner.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ banners });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "banners.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json();
  const v = schema.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const data = v.data;
  const banner = await prisma.banner.create({
    data: {
      title: data.title,
      subtitle: data.subtitle ?? null,
      imageUrl: data.imageUrl || null,
      videoUrl: data.videoUrl || null,
      iconEmoji: data.iconEmoji ?? null,
      bgGradient: data.bgGradient ?? null,
      linkUrl: data.linkUrl || null,
      location: data.location,
      order: data.order,
      isActive: data.isActive,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      createdById: session.user.id,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "BANNER_CREATED",
      entity: "Banner",
      entityId: banner.id,
      newData: { title: banner.title, location: banner.location },
    },
  });
  return NextResponse.json({ success: true, banner }, { status: 201 });
}
