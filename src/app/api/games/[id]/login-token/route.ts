import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { requireActiveUser } from "@/lib/require-active";
import { prisma } from "@/lib/prisma";
import { GAME_LOGIN_TTL_SECONDS, isAllowedGameOrigin, normalizeOrigin, signGameLoginToken } from "@/lib/game-connect";

/**
 * POST /api/games/:id/login-token — "Sign in with RevType" for a game played INSIDE RevType's Games page.
 *
 * The game's website runs in RevType's player iframe, where it cannot open the
 * connect popup flow; the player (first-party, signed in) asks for a one-time
 * login token here and hands it to the game (SDK: RevType.getLoginToken() in
 * player mode). Same token as /api/games/ext/login-token: 5 minutes, single
 * use, bound to the game's listed website; its server trades it once at
 * /api/games/s2s/login.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const active = await requireActiveUser(session.user.id);
  if (!active.ok) return NextResponse.json({ error: active.message }, { status: active.httpStatus });
  const limited = await enforceDbRateLimit(req, "game-login-token", session.user.id, 10, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const g = await prisma.game.findUnique({ where: { id }, select: { embedUrl: true } });
  const origin = normalizeOrigin(g?.embedUrl);
  if (!origin || !(await isAllowedGameOrigin(origin))) {
    return NextResponse.json({ error: "This game has no listed website." }, { status: 404 });
  }
  return NextResponse.json({ loginToken: signGameLoginToken(session.user.id, origin), expiresIn: GAME_LOGIN_TTL_SECONDS });
}
