import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { submitContestEntry } from "@/lib/contests-server";

/** POST /api/contests/[id]/enter — `{ url, caption? }` */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceDbRateLimit(request, "contest-enter", session.user.id, 10, 60_000);
  if (limited) return limited;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { url?: unknown; caption?: unknown };
  const r = await submitContestEntry(session.user.id, id, String(body.url ?? ""), body.caption ? String(body.caption) : null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
