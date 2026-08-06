import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  title: z.string().min(2).max(120),
  category: z.string().max(40).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  iconUrl: z.string().min(1),
  embedUrl: z.string().url(),
  order: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export async function GET() {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "games.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const games = await prisma.game.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ games });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const v = schema.safeParse(await request.json());
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const d = v.data;
  const game = await prisma.game.create({
    data: {
      title: d.title,
      category: d.category || null,
      description: d.description || null,
      iconUrl: d.iconUrl,
      embedUrl: d.embedUrl,
      order: d.order,
      isActive: d.isActive,
      createdById: session.user.id,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "GAME_CREATED",
      entity: "Game",
      entityId: game.id,
      newData: { title: game.title },
    },
  });
  return NextResponse.json({ success: true, game }, { status: 201 });
}
