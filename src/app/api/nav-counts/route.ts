import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNavCounts } from "@/lib/nav-counts";

export const runtime = "nodejs";

/** GET /api/nav-counts — the red counts on Daily Mission, Missions and Events. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getNavCounts(session.user.id), {
    headers: { "Cache-Control": "no-store" },
  });
}
