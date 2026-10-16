import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { reportScore } from "@/lib/game-session";
import { requireActiveUser } from "@/lib/require-active";

/**
 * POST /api/games/:id/score — a connected game's running score total.
 *
 * Sent by the RevType game player (never by the game itself): the game, on its
 * own domain inside the player's iframe, posts its total to the player through
 * the RevType Games SDK (public/sdk/revtype-games.js); the player checks the
 * message came from that game's frame and origin, then forwards it here with
 * the member's own session cookie. The score is still treated as untrusted —
 * reportScore bounds what it can pay by server-measured play time and caps.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const activeCheck = await requireActiveUser(session.user.id);
  if (!activeCheck.ok) {
    return NextResponse.json({ error: activeCheck.message }, { status: activeCheck.httpStatus });
  }
  // The player sends at most one report every few seconds.
  const limited = await enforceDbRateLimit(req, "game-score", session.user.id, 20, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; total?: number };
  const total = Number(body.total);
  if (!body.sessionId || !Number.isFinite(total) || total < 0) {
    return NextResponse.json({ error: "sessionId and a score total are required" }, { status: 400 });
  }

  const out = await reportScore(session.user.id, id, body.sessionId, total);
  if (!out.ok) {
    return NextResponse.json(
      {
        error: out.reason === "off" ? "This game does not pay for scores." : "This play session is no longer open.",
        reason: out.reason,
      },
      { status: out.reason === "off" ? 403 : 409 }
    );
  }
  return NextResponse.json(out.result);
}
