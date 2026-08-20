import { NextRequest, NextResponse } from "next/server";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
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

  // An ad serve counts an impression, so an unthrottled loop both loads the DB
  // and corrupts advertiser impression figures. Generous enough that real
  // rotation (every ~12s per slot, ~7 slots) never trips it.
  const limited = await enforceDbRateLimit(
    request,
    "ads-serve",
    session?.user?.id,
    120,
    60_000
  );
  if (limited) return limited;

  const result = await serveAd({
    placement,
    userId: session?.user?.id ?? null,
    exclude,
  });

  // Preserve the original response shape: `{ ad: null }` when nothing eligible.
  if (!result.ad) return NextResponse.json({ ad: null });
  return NextResponse.json(result);
}
