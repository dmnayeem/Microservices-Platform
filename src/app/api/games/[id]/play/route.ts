import { NextRequest, NextResponse } from "next/server";

/**
 * @deprecated Replaced by `POST /api/games/:id/session`.
 *
 * This incremented `Game.playsCount` from a client `useEffect` with no rate
 * limit, no dedupe and no per-user record — a shell loop could inflate it
 * freely. Harmless for a vanity counter, but the moment points hang off play
 * time it becomes a way to print money, so the whole flow moved to the session
 * protocol (session → heartbeat → end) where the server measures the time.
 *
 * Kept as a 410 for one release because clients cached in the wild still call
 * it; returning 404 would look like a bug, and silently accepting it would let
 * an old client think it had counted a play.
 */
export async function POST(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    {
      error: "Gone. Use POST /api/games/[id]/session instead.",
      replacedBy: "/api/games/[id]/session",
    },
    { status: 410 }
  );
}
