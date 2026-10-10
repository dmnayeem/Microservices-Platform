import { assertPageVisible } from "@/lib/page-visibility-server";
import { planFeatureGate } from "@/lib/plan-gate";
import { profileGateResponse } from "@/lib/profile-gate-server";
import { NextRequest, NextResponse } from "next/server";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { auth } from "@/lib/auth";
import { getEffectivePackage } from "@/lib/packages";
import { claimEvent } from "@/lib/events";
import { requireActiveUser } from "@/lib/require-active";

// POST /api/events/:id/claim — claim the reward. For an UPLOAD_PROOF event this
// SUBMITS the proof for admin review instead (`pendingReview: true`); the
// reward is paid on approval (POST /api/admin/events/proofs).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Plan switch (Admin → Packages): this plan may not use it.
  const planGated = await planFeatureGate(session.user.id, "events");
  if (planGated) return planGated;
  // Super-admin page visibility: refuse when /events is hidden for this user.
  const pageHidden = await assertPageVisible(session.user.id, "/events");
  if (pageHidden) return pageHidden;
  // Reward claim. Correctness comes from the unique ledger constraints; this
  // keeps a claim flood from being absorbed by the database.
  const limited = await enforceDbRateLimit(req, "claim", session.user.id, 30, 60_000);
  if (limited) return limited;
  // Profile gate — events are goals like missions and share its switch.
  const profileGated = await profileGateResponse(session.user.id, "missions");
  if (profileGated) return profileGated;
  // A reward claim pays out: a banned / suspended account may not claim.
  const active = await requireActiveUser(session.user.id);
  if (!active.ok) {
    return NextResponse.json({ error: active.message }, { status: active.httpStatus });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    proofUrl?: string;
    tierThreshold?: number;
  };
  const pkg = await getEffectivePackage(session.user.id).catch(() => null);
  const result = await claimEvent(
    session.user.id,
    id,
    pkg?.accessLevel ?? 0,
    typeof body.proofUrl === "string" ? body.proofUrl : undefined,
    typeof body.tierThreshold === "number" ? body.tierThreshold : undefined
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
