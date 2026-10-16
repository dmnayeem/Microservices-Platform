import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { reportScore } from "@/lib/game-session";

/**
 * POST /api/games/:id/score — a connected game's running score total.
 *
 * Older clients only: current ones put the score on the heartbeat. Sent by
 * the RevType game player (never by the game itself): the game, on its
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
  // Kept for older clients — new ones send the score on the heartbeat. Same
  // in-memory limiter; account status is checked where points are paid.
  if (!rateLimit(`game-score:${session.user.id}`, 20, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

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
