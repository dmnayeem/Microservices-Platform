import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { postIdea } from "@/lib/feedback-server";

/** POST `{ title, body? }` — post a feature idea (3 a day). */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceDbRateLimit(request, "idea", session.user.id, 10, 60_000);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { title?: unknown; body?: unknown };
  const r = await postIdea(session.user.id, String(body.title ?? ""), body.body ? String(body.body) : null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
