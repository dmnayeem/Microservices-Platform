import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { syncUserLevelQuietly } from "@/lib/level-sync";
import { claimLevelReward, levelRewardsFor } from "@/lib/level-rewards-server";

/**
 * GET  /api/level-rewards — the ladder for the signed-in user (reached / claimed).
 * POST /api/level-rewards — `{ level }`: claim that level's reward (once).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Bring the stored level up to the XP first, so a user who just crossed a
  // level sees its reward without waiting for the next award.
  await syncUserLevelQuietly(session.user.id);
  return NextResponse.json(await levelRewardsFor(session.user.id));
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceDbRateLimit(request, "claim", session.user.id, 30, 60_000);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { level?: unknown };
  const level = Math.round(Number(body.level));
  if (!Number.isFinite(level)) return NextResponse.json({ error: "Which level?" }, { status: 400 });
  const r = await claimLevelReward(session.user.id, level);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, points: r.points });
}
