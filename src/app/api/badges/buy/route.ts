import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { buyBadge, buyStyle } from "@/lib/badges-server";

// POST /api/badges/buy { item: "badge" | <style key>, method: "CASH" | "POINTS" }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  return withIdempotency(req, userId, async () => {
    const body = (await req.json().catch(() => ({}))) as { item?: unknown; method?: unknown };
    const method = body.method === "POINTS" ? "POINTS" : body.method === "CASH" ? "CASH" : null;
    if (!method || typeof body.item !== "string") {
      return NextResponse.json({ error: "Choose what to buy and how to pay." }, { status: 400 });
    }
    const r = body.item === "badge" ? await buyBadge(userId, method) : await buyStyle(userId, body.item, method);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, expiresAt: r.expiresAt.toISOString() });
  });
}
