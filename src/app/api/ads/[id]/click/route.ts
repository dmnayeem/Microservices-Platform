import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordClick } from "@/lib/ad-events";

/**
 * Records an authenticated ad click and bills the owning campaign. Legacy path
 * kept for back-compat (e.g. mobile clients); the web client now posts to
 * `/api/spaces/:id/event`. Delegates to the shared recorder (per-(user,ad)
 * cooldown + no-overspend budget CAS live there).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: true, billed: false });
  }

  await recordClick(id, session.user.id);
  return NextResponse.json({ success: true });
}
