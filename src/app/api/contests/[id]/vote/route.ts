import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { castContestVote } from "@/lib/contests-server";

/** POST /api/contests/[id]/vote — `{ entryId }` (one vote per member per contest) */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceDbRateLimit(request, "contest-vote", session.user.id, 20, 60_000);
  if (limited) return limited;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { entryId?: unknown };
  const r = await castContestVote(session.user.id, id, String(body.entryId ?? ""));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
