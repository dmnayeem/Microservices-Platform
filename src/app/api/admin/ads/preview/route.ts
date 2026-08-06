import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { serveAd } from "@/lib/ad-serve";

// GET /api/admin/ads/preview?placement=X — admin-only, side-effect-free preview
// of a real served creative for a placement (skips ad-free/targeting/budget and
// never counts an impression). Returns { ad } or { ad: null }.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const placement = new URL(req.url).searchParams.get("placement") ?? "";
  if (!placement) {
    return NextResponse.json({ error: "placement required" }, { status: 400 });
  }
  const result = await serveAd({ placement, preview: true });
  return NextResponse.json({ ad: result.ad });
}
