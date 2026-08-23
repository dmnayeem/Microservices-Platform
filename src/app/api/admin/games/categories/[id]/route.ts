import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { gameCategorySchema } from "@/lib/games-admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const v = gameCategorySchema.partial().safeParse(await request.json());
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  if (v.data.slug) {
    const clash = await prisma.gameCategory.findUnique({
      where: { slug: v.data.slug },
      select: { id: true },
    });
    if (clash && clash.id !== id) {
      return NextResponse.json(
        { error: "Another category already uses that slug." },
        { status: 409 }
      );
    }
  }
  const category = await prisma.gameCategory.update({
    where: { id },
    data: v.data,
  });
  return NextResponse.json({ success: true, category });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // `Game.categoryId` is `onDelete: SetNull`, so deleting a category quietly
  // uncategorises its games. That is recoverable but surprising, so say how
  // many rather than doing it silently.
  const games = await prisma.game.count({ where: { categoryId: id } });
  await prisma.gameCategory.delete({ where: { id } });
  return NextResponse.json({
    success: true,
    uncategorised: games,
    message:
      games > 0
        ? `Category deleted. ${games} game${games === 1 ? "" : "s"} moved to "uncategorised".`
        : "Category deleted.",
  });
}
