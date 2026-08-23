import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { probeEmbed } from "@/lib/embed-probe";

/**
 * POST /api/admin/games/probe — check whether a URL can be framed.
 *
 * Admin-only and rate limited: this makes the server fetch an arbitrary URL, so
 * it must not become an open request relay.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limited = await enforceDbRateLimit(
    request,
    "game-probe",
    session.user.id,
    20,
    60_000
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as {
    url?: string;
    gameId?: string;
  };
  if (!body.url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const result = await probeEmbed(body.url);

  // Cache the verdict on the game so the list can flag a broken embed without
  // re-probing on every render.
  if (body.gameId) {
    await prisma.game
      .update({
        where: { id: body.gameId },
        data: { embedProbe: result as never },
      })
      .catch(() => {});
  }

  return NextResponse.json(result);
}
