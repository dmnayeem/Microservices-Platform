import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { placeSpotlightBid } from "@/lib/spotlight-server";

/** POST `{ postId, amount }` — bid (or raise your bid) on a Spotlight auction. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceDbRateLimit(request, "spotlight-bid", session.user.id, 20, 60_000);
  if (limited) return limited;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { postId?: unknown; amount?: unknown };
  const r = await placeSpotlightBid(session.user.id, id, String(body.postId ?? ""), Math.round(Number(body.amount)));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
