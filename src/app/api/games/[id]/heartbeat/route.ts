import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { heartbeat, BEAT_INTERVAL_SECONDS } from "@/lib/game-session";

/**
 * POST /api/games/:id/heartbeat — accrue play time and credit points.
 *
 * The body carries NO duration. The server measures the wall-clock gap since
 * the previous beat and clamps it, so beating faster than real time credits
 * nothing. `loaded` says whether the game iframe has actually fired its load
 * event — time does not accrue for staring at an embed that never rendered.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // The busiest endpoint in games, so its limiter is in memory, not a DB
  // write per beat. Money does not depend on it: a beat pays for the seconds
  // the SERVER measured since the last one, so beating faster pays nothing.
  // A banned / suspended account is checked where points are paid
  // (heartbeat's locked path) — not with an extra query on every beat.
  if (!rateLimit(`game-beat:${session.user.id}`, 20, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    loaded?: boolean;
    /** Connected games: the session's running score (RevType Games SDK). */
    scoreTotal?: number;
    final?: boolean;
  };
  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const out = await heartbeat(session.user.id, id, body.sessionId, {
    loaded: body.loaded !== false,
    scoreTotal: typeof body.scoreTotal === "number" ? body.scoreTotal : undefined,
    final: body.final === true,
  });
  if (!out.ok) {
    // 409, not 400: the request was well-formed, the session just isn't open
    // any more (another tab took the slot, or the sweep closed it).
    return NextResponse.json(
      { error: "This play session is no longer open.", reason: out.reason },
      { status: 409 }
    );
  }
  return NextResponse.json({ ...out.result, beatSeconds: BEAT_INTERVAL_SECONDS });
}
