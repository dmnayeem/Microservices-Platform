import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { gameCreateSchema, gameConfigError } from "@/lib/games-admin";

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
  const v = gameCreateSchema.safeParse(await request.json());
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const configErr = gameConfigError(v.data);
  if (configErr) return NextResponse.json({ error: configErr }, { status: 400 });

  if (v.data.categoryId) {
    const cat = await prisma.gameCategory.findUnique({
      where: { id: v.data.categoryId },
      select: { id: true },
    });
    if (!cat) {
      return NextResponse.json({ error: "Category not found" }, { status: 400 });
    }
  }

  const game = await prisma.game.create({
    data: { ...v.data, createdById: session.user.id } as never,
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "GAME_CREATED",
      entity: "Game",
      entityId: game.id,
      newData: { title: game.title, rewardEnabled: game.rewardEnabled },
    },
  });
  return NextResponse.json({ success: true, game }, { status: 201 });
}
