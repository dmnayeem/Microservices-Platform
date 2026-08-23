import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
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
  // Generous enough for the real cadence (4/min) with headroom for retries,
  // tight enough that a script can't turn the endpoint into a busy loop.
  const limited = await enforceDbRateLimit(
    req,
    "game-beat",
    session.user.id,
    30,
    60_000
  );
  if (limited) return limited;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    loaded?: boolean;
  };
  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const out = await heartbeat(session.user.id, id, body.sessionId, {
    loaded: body.loaded !== false,
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
