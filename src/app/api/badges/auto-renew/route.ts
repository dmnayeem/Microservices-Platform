import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setAutoRenew } from "@/lib/badges-server";

// POST /api/badges/auto-renew { item: "badge" | <style key>, on: boolean }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { item?: unknown; on?: unknown };
  const r = await setAutoRenew(session.user.id, String(body.item ?? ""), body.on === true);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
}
