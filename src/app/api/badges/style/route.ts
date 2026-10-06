import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { requireActiveUser } from "@/lib/require-active";
import { applyStyle } from "@/lib/badges-server";

// POST /api/badges/style { style } — show an owned style (BLUE always allowed).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const active = await requireActiveUser(userId);
  if (!active.ok) return NextResponse.json({ error: active.message }, { status: active.httpStatus });
  return withIdempotency(req, userId, async () => {
    const body = (await req.json().catch(() => ({}))) as { style?: unknown };
    const r = await applyStyle(userId, String(body.style ?? ""));
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  });
}
