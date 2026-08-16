import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEffectivePackage } from "@/lib/packages";
import { claimEvent } from "@/lib/events";

// POST /api/events/:id/claim — claim the reward (optionally with a proof URL).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
