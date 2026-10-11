import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { toggleIdeaVote } from "@/lib/feedback-server";

/** POST — upvote an idea, or take the vote back. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceDbRateLimit(request, "idea-vote", session.user.id, 60, 60_000);
  if (limited) return limited;
  const { id } = await params;
  const r = await toggleIdeaVote(session.user.id, id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
