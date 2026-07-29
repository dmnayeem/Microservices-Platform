import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serveAd } from "@/lib/ad-serve";

/**
 * Serve one ad for a placement (banner / interstitial). The web client reaches
 * this via the neutral `/api/spaces/panel` rewrite. Selection + targeting +
 * impression counting live in `serveAd` (shared with SSR injection).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const placement = searchParams.get("placement");
  if (!placement) {
    return NextResponse.json({ error: "placement required" }, { status: 400 });
  }
  const exclude = (searchParams.get("exclude") ?? "").split(",").filter(Boolean);

  const session = await auth();
  const result = await serveAd({
    placement,
    userId: session?.user?.id ?? null,
    exclude,
  });

  // Preserve the original response shape: `{ ad: null }` when nothing eligible.
  if (!result.ad) return NextResponse.json({ ad: null });
  return NextResponse.json(result);
}
