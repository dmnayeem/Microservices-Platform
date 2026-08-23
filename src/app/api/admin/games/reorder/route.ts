import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/admin/games/reorder — persist a drag-and-drop ordering.
 *
 * Ordering was a raw integer box per game, with no indication of what numbers
 * the neighbours already used, so reordering meant renumbering by hand.
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }
  // Bounded so a malformed request can't turn into an unbounded write burst.
  if (ids.length > 500) {
    return NextResponse.json({ error: "Too many ids" }, { status: 400 });
  }

  // One transaction: a half-applied reorder would leave duplicate positions and
  // a list that reshuffles itself on the next load.
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.game.update({ where: { id }, data: { order: index } })
    )
  );

  return NextResponse.json({ success: true, ordered: ids.length });
}
