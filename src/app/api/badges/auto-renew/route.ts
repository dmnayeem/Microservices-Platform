import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { requireActiveUser } from "@/lib/require-active";
import { setAutoRenew } from "@/lib/badges-server";

// POST /api/badges/auto-renew { item: "badge" | <style key>, on: boolean }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  // Auto-renew authorises a future charge — a banned or suspended account may
  // not switch it on (switching it OFF is always allowed).
  const body = (await req.json().catch(() => ({}))) as { item?: unknown; on?: unknown };
  const on = body.on === true;
  if (on) {
    const active = await requireActiveUser(userId);
    if (!active.ok) return NextResponse.json({ error: active.message }, { status: active.httpStatus });
  }
  return withIdempotency(req, userId, async () => {
    const r = await setAutoRenew(userId, String(body.item ?? ""), on);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  });
}
