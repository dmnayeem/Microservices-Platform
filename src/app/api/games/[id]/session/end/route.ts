import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { endSession, heartbeat } from "@/lib/game-session";

/**
 * POST /api/games/:id/session/end — close a session.
 *
 * Also reached via `navigator.sendBeacon` on `pagehide`, so it must tolerate
 * being called twice (an explicit Quit racing the beacon). `endSession` CASes on
 * `endedAt`, so the totals are folded into the game's counters exactly once.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string; scoreTotal?: number };
  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  // A connected game's last score: one final beat pays what is due now
  // instead of waiting for the next minute that will never come.
  if (typeof body.scoreTotal === "number") {
    await heartbeat(session.user.id, id, body.sessionId, {
      loaded: true,
      scoreTotal: body.scoreTotal,
      final: true,
    }).catch(() => {});
  }
  const totals = await endSession(session.user.id, id, body.sessionId);
  if (!totals) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...totals });
}
