import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { startSession } from "@/lib/game-session";

/**
 * POST /api/games/:id/session — open a play session.
 *
 * Replaces `POST /api/games/:id/play`, which incremented a counter from a
 * client mount with no rate limit and no per-user record. Opening a session
 * force-ends any other session this user has open, so extra tabs cannot
 * multiply the earn rate.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await enforceDbRateLimit(
    req,
    "game-session",
    session.user.id,
    20,
    60_000
  );
  if (limited) return limited;

  const { id } = await params;
  const result = await startSession(session.user.id, id);
  if (!result) {
    return NextResponse.json({ error: "Game not available" }, { status: 404 });
  }
  return NextResponse.json(result);
}
