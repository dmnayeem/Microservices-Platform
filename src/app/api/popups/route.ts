import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bannerMatches, type BannerViewer } from "@/lib/banner-audience";
import { TASK_VIEWER_SELECT } from "@/lib/task-visibility";
import { syncCountryMode } from "@/lib/country-mode";
import { countryOfIp } from "@/lib/geo";
import { clientIp } from "@/lib/rate-limit";
import { sanitizeRichHtml } from "@/lib/rich-html";
import { versionOf } from "@/lib/brand-icons";
import {
  isPopupQuietPath,
  popupPlacementMatches,
  popupSessionMatches,
  sanitizePopupFrequency,
  sanitizePopupKind,
  type PopupView,
} from "@/lib/popups";
import { activePopups } from "@/lib/popups-server";

// GET /api/popups?path=/social — the popups this viewer may see on this page,
// highest priority first. Public: visitors see popups too (by IP country).
// The browser then applies the frequency rule and shows at most one.
export async function GET(request: NextRequest) {
  const path = (request.nextUrl.searchParams.get("path") || "/").slice(0, 300);
  if (isPopupQuietPath(path)) return NextResponse.json({ popups: [] });

  const all = await activePopups().catch(() => []);
  if (all.length === 0) return NextResponse.json({ popups: [] });

  const session = await auth().catch(() => null);
  const signedIn = !!session?.user?.id;
  const now = Date.now();

  const inPlay = all.filter(
    (p) =>
      (!p.startsAt || new Date(p.startsAt).getTime() <= now) &&
      (!p.endsAt || new Date(p.endsAt).getTime() > now) &&
      popupSessionMatches(p.sessionAudience, signedIn) &&
      popupPlacementMatches(p, path)
  );
  if (inPlay.length === 0) return NextResponse.json({ popups: [] });

  // Who is looking. A visitor is known only by the country of their IP, so a
  // popup aimed at a district or a gender is (correctly) not shown to them.
  await syncCountryMode();
  let viewer: BannerViewer = { lastCountry: countryOfIp(clientIp(request)) };
  if (signedIn) {
    const me = await prisma.user
      .findUnique({
        where: { id: session!.user!.id! },
        select: { ...TASK_VIEWER_SELECT, kycStatus: true },
      })
      .catch(() => null);
    if (me) viewer = me;
  }

  const popups: PopupView[] = inPlay
    .filter((p) => bannerMatches(p, viewer))
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      title: p.title,
      kind: sanitizePopupKind(p.kind),
      body: p.body ? sanitizeRichHtml(p.body) : null,
      imageUrl: p.imageUrl,
      ctaLabel: p.ctaLabel,
      ctaUrl: p.ctaUrl,
      frequency: sanitizePopupFrequency(p.frequency),
      delaySeconds: Math.max(0, Math.min(60, p.delaySeconds)),
      version: versionOf(`${p.id}:${new Date(p.updatedAt).getTime()}`),
    }));

  return NextResponse.json(
    { popups },
    // Per viewer, so never shared by a CDN.
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
