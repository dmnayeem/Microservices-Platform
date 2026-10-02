import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordPwaSeen } from "@/lib/pwa-install";
import { PWA_DISPLAY_MODES, parsePwaHost, parsePwaPlatform } from "@/lib/pwa-shared";

export const runtime = "nodejs";

/**
 * POST — the signed-in user opened the installed app (PwaSeenBeacon, once per
 * local day) or the browser fired `appinstalled`. Needs a session, so it is
 * deliberately NOT in middleware's public API allowlist.
 *
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });

  // In memory, per instance — no database round trip. The day-gated UPDATE in
  // recordPwaSeen is what actually stops repeats; this only sheds a flood.
  if (!allow(userId)) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty body */
  }
  const displayMode = typeof body.displayMode === "string" ? body.displayMode : "";
  const standalone = (PWA_DISPLAY_MODES as readonly string[]).includes(displayMode);
  const installedEvent = body.event === "installed";

  try {
    const r = await recordPwaSeen(userId, {
      platform: parsePwaPlatform(body.platform),
      standalone,
      installedEvent,
      host: parsePwaHost(body.host),
    });
    return NextResponse.json({ ok: true, paid: r.paid });
  } catch (err) {
    console.error("[pwa/seen]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

const hits = new Map<string, { n: number; reset: number }>();
function allow(userId: string): boolean {
  const now = Date.now();
  const h = hits.get(userId);
  if (!h || now > h.reset) {
    if (hits.size > 5000) hits.clear();
    hits.set(userId, { n: 1, reset: now + 3_600_000 });
    return true;
  }
  h.n++;
  return h.n <= 10;
}
