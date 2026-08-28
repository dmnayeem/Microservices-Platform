import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { creativeUrl, isFirstPartyAdType } from "@/lib/ad-proxy";
import {
  describeNetworkSlot,
  getNetworkGlobals,
  resolveNetworkSlot,
} from "@/lib/ad-network";
import { placementSizeKey } from "@/lib/ad-placements";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Render THIS ad's creative, whatever its status, without counting anything.
 *
 * The existing `/api/admin/ads/preview?placement=` route runs the live serve
 * path, which hard-filters `status: "ACTIVE"` and picks randomly by weight — so
 * a PENDING ad, the only kind a reviewer needs to see, could never be previewed.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const ad = await prisma.ad.findUnique({
    where: { id },
    include: {
      campaign: { select: { title: true } },
      placement: { select: { name: true } },
    },
  });
  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 });

  const proxy = isFirstPartyAdType(ad.type);
  const html = ad.htmlContent ?? undefined;

  // A network ad is DESCRIBED here, never rendered.
  //
  // This used to compose a live AdSense/GAM document, so every time an admin
  // opened a space or a reviewer opened an ad, the panel fetched a real Google
  // ad. Repeated ad requests with no viewer behind them is exactly the
  // invalid-traffic pattern publisher accounts get banned for — the same
  // reasoning as the impression pixel below, which this route already refuses
  // to fire for exactly that reason.
  let networkLabel: string | undefined;
  if (ad.type === "ADSENSE" || ad.type === "GAM") {
    const cfg = resolveNetworkSlot(
      ad,
      await getNetworkGlobals(),
      ad.placement.name
    );
    networkLabel = cfg
      ? describeNetworkSlot(cfg)
      : `${ad.type} — not configured yet (set the publisher id in Monetization)`;
  }

  return NextResponse.json({
    ad: {
      id: ad.id,
      type: ad.type,
      format: ad.format,
      imageUrl: creativeUrl(ad.id, "img", ad.contentUrl, proxy),
      videoUrl: creativeUrl(ad.id, "video", ad.videoUrl, proxy),
      title: ad.brandName || ad.campaign.title,
      body: ad.headline ?? undefined,
      ctaLabel: ad.ctaLabel ?? "Learn More",
      ctaUrl: ad.targetUrl ?? undefined,
      brandLogo: ad.brandLogo ?? undefined,
      html,
      networkLabel,
      // Never fire the advertiser's third-party pixel from an admin screen —
      // that would report an impression that no user ever saw.
      impressionPixel: undefined,
      size: ad.size ?? placementSizeKey(ad.placement.name),
      width: ad.width ?? undefined,
      height: ad.height ?? undefined,
      allowSameOrigin: ad.allowSameOrigin || undefined,
    },
  });
}
