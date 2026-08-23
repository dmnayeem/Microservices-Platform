import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";
import { serveAd } from "@/lib/ad-serve";
import { isInterstitialPlacement } from "@/lib/ad-placements";

/**
 * POST /api/games/:id/ad — serve this session its interstitial.
 *
 * ## Why the game doesn't just call /api/ads/serve like everything else
 *
 * `rewardRequiresAd` ties payout to ads the user actually saw, and **the
 * platform could not previously tell who saw an interstitial**:
 *
 *  - `serveAd()` records impressions as a buffered per-AD counter
 *    (`bufferImpression(adId)`) and never writes the viewer's id;
 *  - the one table that does carry `userId` — `AdEngagement` — is written by a
 *    *client* beacon that `AdInterstitialOverlay` deliberately skips for
 *    interstitials (`countedServerSide`), which is exactly this placement.
 *
 * So the count has to come from the only moment the server knows an ad was
 * delivered to a specific person: the serve itself. This route does the serving
 * and bumps `GameSession.adsShown` in the same request. The client renders what
 * it is given and asserts nothing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await enforceDbRateLimit(
    req,
    "game-ad",
    session.user.id,
    40,
    60_000
  );
  if (limited) return limited;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string };

  const game = await prisma.game.findUnique({
    where: { id },
    select: { id: true, isActive: true, adsEnabled: true, adPlacement: true },
  });
  if (!game || !game.isActive || !game.adsEnabled) {
    // Not an error — the caller just proceeds without an ad.
    return NextResponse.json({ ad: null });
  }

  // Defence in depth: `adPlacement` is validated on write, but a row edited
  // directly must still not be able to pull advertiser inventory into a
  // full-screen slot it was never bought for.
  const placement = isInterstitialPlacement(game.adPlacement)
    ? game.adPlacement
    : "GAME_INTERSTITIAL";

  const served = await serveAd({ placement, userId: session.user.id });

  // Count only a real delivery. A session that gets `{ad: null}` (nothing
  // eligible) must not earn ad credit it never saw.
  if (served.ad && body.sessionId) {
    await prisma.gameSession
      .updateMany({
        where: { id: body.sessionId, userId: session.user.id, gameId: id, endedAt: null },
        data: { adsShown: { increment: 1 } },
      })
      .catch(() => {});
  }

  return NextResponse.json(served);
}
