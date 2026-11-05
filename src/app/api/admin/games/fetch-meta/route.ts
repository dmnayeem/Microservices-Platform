import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { fetchGameMeta } from "@/lib/game-meta";

export const runtime = "nodejs";

/**
 * POST /api/admin/games/fetch-meta — read a game link's title, description,
 * icon and cover (lib/game-meta.ts). Admin-only and rate limited like the
 * embed probe: the server fetches an address the admin typed.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !(await can(session.user.id, "games.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limited = await enforceDbRateLimit(request, "game-meta", session.user.id, 20, 60_000);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as { url?: string };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!/^https:\/\//i.test(url)) {
    return NextResponse.json({ error: "Enter the full game link, starting with https://" }, { status: 400 });
  }

  try {
    const meta = await fetchGameMeta(url, session.user.id);
    if (!meta) {
      return NextResponse.json(
        { error: "Couldn't read that page. Check the link opens in a browser, or add the images by hand." },
        { status: 422 }
      );
    }
    return NextResponse.json({ ok: true, ...meta });
  } catch {
    return NextResponse.json({ error: "That address can't be fetched." }, { status: 400 });
  }
}
