import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import {
  GAME_CONNECT_ORIGINS_KEY,
  getGameConnectOrigins,
  getSiteServerKey,
  normalizeOrigin,
  rotateSiteServerKey,
} from "@/lib/game-connect";

/**
 * PUT /api/admin/games/websites { websites: string[] } — the owner's game
 * websites allowed to use "Connect RevType" (src/lib/game-connect.ts).
 * Same permission as editing games.
 */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { websites?: unknown };
  const list = Array.isArray(body.websites) ? body.websites.map(String).filter((s) => s.trim()) : [];
  const origins: string[] = [];
  for (const w of list) {
    const o = normalizeOrigin(w);
    if (!o) {
      return NextResponse.json({ error: `"${w}" is not a full https:// address.` }, { status: 400 });
    }
    if (!origins.includes(o)) origins.push(o);
  }
  if (origins.length > 50) return NextResponse.json({ error: "At most 50 websites." }, { status: 400 });

  const before = await getGameConnectOrigins();
  await saveSetting(GAME_CONNECT_ORIGINS_KEY, origins, "games");
  await writeAudit({
    actorId: session.user.id,
    action: "GAME_WEBSITES_UPDATED",
    entity: "SystemSetting",
    entityId: GAME_CONNECT_ORIGINS_KEY,
    summary: origins.length ? `Game websites: ${origins.join(", ")}` : "Game websites cleared",
    meta: { before, after: origins },
  }).catch(() => {});
  return NextResponse.json({ websites: origins });
}

/** GET — each listed website with its server key (for the game server). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const origins = await getGameConnectOrigins();
  const sites = await Promise.all(origins.map(async (origin) => ({ origin, key: await getSiteServerKey(origin) })));
  return NextResponse.json({ sites });
}

/** POST { origin } — rotate a website's server key (the old one stops working at once). */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { origin?: string };
  const origin = normalizeOrigin(body.origin);
  if (!origin || !(await getGameConnectOrigins()).includes(origin)) {
    return NextResponse.json({ error: "Not a listed game website." }, { status: 400 });
  }
  await rotateSiteServerKey(origin);
  await writeAudit({
    actorId: session.user.id,
    action: "GAME_SERVER_KEY_ROTATED",
    entity: "SystemSetting",
    entityId: origin,
    summary: `Rotated the game server key for ${origin}`,
  }).catch(() => {});
  return NextResponse.json({ origin, key: await getSiteServerKey(origin) });
}
