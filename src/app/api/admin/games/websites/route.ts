import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { saveSetting } from "@/lib/system-settings";
import { writeAudit } from "@/lib/audit";
import { GAME_CONNECT_ORIGINS_KEY, getGameConnectOrigins, normalizeOrigin } from "@/lib/game-connect";

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
