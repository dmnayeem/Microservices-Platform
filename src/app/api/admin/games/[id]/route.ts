import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { gameUpdateSchema, gameConfigError } from "@/lib/games-admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Was a hand-rolled field-by-field assignment with no validation, so update
  // enforced none of the rules create did — including the ad-placement guard.
  const v = gameUpdateSchema.safeParse(await request.json());
  if (!v.success) {
    return NextResponse.json(
      { error: v.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const existing = await prisma.game.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  // Validate the MERGED config: a partial update can break a rule that the
  // incoming fields alone look fine against (e.g. switching ads off while
  // rewardRequiresAd stays on).
  const configErr = gameConfigError({ ...existing, ...v.data } as never);
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

  const game = await prisma.game.update({
    where: { id },
    data: v.data as never,
  });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "GAME_UPDATED",
      entity: "Game",
      entityId: id,
      oldData: { title: existing.title, rewardEnabled: existing.rewardEnabled },
      newData: { title: game.title, rewardEnabled: game.rewardEnabled },
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

  const existing = await prisma.game.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  // `GameSession.gameId` is `onDelete: Restrict` on purpose — those rows are the
  // record of what this game paid out, and a hard delete would either destroy
  // that history or fail with a raw foreign-key error. A game people have
  // actually played is deactivated instead.
  const played = await prisma.gameSession.count({ where: { gameId: id } });
  if (played > 0) {
    const game = await prisma.game.update({
      where: { id },
      data: { isActive: false },
    });
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "GAME_DEACTIVATED",
        entity: "Game",
        entityId: id,
        oldData: { title: existing.title },
        newData: { reason: `${played} play sessions exist; deactivated instead of deleted` },
      },
    });
    return NextResponse.json({
      success: true,
      deactivated: true,
      game,
      message: `This game has ${played} play session${played === 1 ? "" : "s"}, so it was hidden instead of deleted — the earning history is kept.`,
    });
  }

  await prisma.game.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "GAME_DELETED",
      entity: "Game",
      entityId: id,
      oldData: { title: existing.title },
    },
  });
  return NextResponse.json({ success: true });
}
