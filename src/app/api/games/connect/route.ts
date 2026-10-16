import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/require-active";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { writeAudit } from "@/lib/audit";
import { isAllowedGameOrigin, normalizeOrigin, signGameConnectToken } from "@/lib/game-connect";

/**
 * POST /api/games/connect { origin } — the member pressed "Allow" on
 * /connect/games. Runs on revtype.com with the member's own session; returns a
 * token the popup hands to the game website (see src/lib/game-connect.ts).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const active = await requireActiveUser(session.user.id);
  if (!active.ok) return NextResponse.json({ error: active.message }, { status: active.httpStatus });
  const limited = await enforceDbRateLimit(req, "game-connect", session.user.id, 10, 60_000);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { origin?: string };
  const origin = normalizeOrigin(body.origin);
  if (!origin || !(await isAllowedGameOrigin(origin))) {
    return NextResponse.json({ error: "This website is not allowed to connect to RevType." }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, username: true },
  });
  await writeAudit({
    actorId: session.user.id,
    targetUserId: session.user.id,
    action: "GAME_SITE_CONNECTED",
    entity: "User",
    entityId: session.user.id,
    summary: `Connected the game website ${origin}`,
    meta: { origin },
  }).catch(() => {});

  return NextResponse.json({
    token: signGameConnectToken(session.user.id, origin),
    name: user?.name || user?.username || "RevType member",
  });
}
