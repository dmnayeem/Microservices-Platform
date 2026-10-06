import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import {
  MAX_BATCH,
  serveAd,
  serveAdBatch,
  servePageScripts,
} from "@/lib/ad-serve";
import { PAGE_SCRIPT_PLACEMENT } from "@/lib/ad-placements";

/**
 * Serve ads for placements (banner / interstitial). The web client reaches this
 * via the neutral `/api/spaces/panel` rewrite. Selection + targeting +
 * impression counting live in `serveAd` (shared with SSR injection).
 *
 *   ?placement=X                     one ad (original shape)
 *   ?placements=A,B,A                batch: `{ results: [...] }` in input order
 *                                    plus `map` (first result per placement)
 *   ?placement=PAGE_SCRIPT           every eligible site-wide page script
 */

/**
 * Throttle, in memory.
 *
 * This used `enforceDbRateLimit`, which is one `RateLimitHit` upsert per serve
 * — on the single most-requested route in the app, that write was how the
 * limiter table became the largest on the platform, and every ad on every page
 * waited for it. A per-instance limiter is enough here: the thing being
 * protected is impression counts, and those are bot-filtered and (next) moved
 * to viewable counting; this only has to stop a runaway loop.
 *
 * Signed-in viewers are keyed by user. Anonymous visitors are keyed by IP + UA,
 * so one office NAT or mobile carrier IP does not throttle everyone behind it,
 * with a higher ceiling for the same reason.
 */
function limitServe(req: NextRequest, userId: string | null | undefined): NextResponse | null {
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 160);
  const key = userId ? `ads-serve:u:${userId}` : `ads-serve:a:${clientIp(req)}:${ua}`;
  const { ok, retryAfterSec } = rateLimit(key, userId ? 180 : 240, 60_000);
  if (ok) return null;
  return NextResponse.json(
    { error: `Too many requests. Try again in ${retryAfterSec}s.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const placement = searchParams.get("placement");
  const batch = (searchParams.get("placements") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_BATCH);
  if (!placement && batch.length === 0) {
    return NextResponse.json({ error: "placement required" }, { status: 400 });
  }
  const exclude = (searchParams.get("exclude") ?? "")
    .split(",")
    .filter(Boolean)
    .slice(0, 100);

  const session = await auth();
  const userId = session?.user?.id ?? null;

  const limited = limitServe(request, userId);
  if (limited) return limited;

  if (placement === PAGE_SCRIPT_PLACEMENT) {
    const res = await servePageScripts({ userId });
    return NextResponse.json(res, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  if (batch.length > 0) {
    const results = await serveAdBatch({ placements: batch, userId, exclude });
    const shaped = results.map((r) => (r.ad ? r : { ad: null }));
    const map: Record<string, unknown> = {};
    batch.forEach((p, i) => {
      if (!(p in map)) map[p] = shaped[i];
    });
    return NextResponse.json({ results: shaped, map });
  }

  const result = await serveAd({
    placement: placement!,
    userId,
    exclude,
    // `own=1` — the client asking for a replacement after a Google slot came
    // back unfilled. Neutral param name, like the rest of this route.
    ownInventoryOnly: searchParams.get("own") === "1",
    // `rot=1` — a timed rotation of a slot already showing an ad. Never serves
    // Google inventory (that would be ad refresh).
    rotation: searchParams.get("rot") === "1",
  });

  // Preserve the original response shape: `{ ad: null }` when nothing eligible.
  if (!result.ad) return NextResponse.json({ ad: null });
  return NextResponse.json(result);
}
