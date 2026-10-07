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
import { resolveVideoUrl } from "@/lib/video-url";
import { mediaSrc } from "@/lib/media-url";
import { getEffectivePackage } from "@/lib/packages";
import {
  isPopupQuietPath,
  popupPlacementMatches,
  popupSessionMatches,
  sanitizePopupDevices,
  sanitizePopupFrequency,
  sanitizePopupKind,
  sanitizePopupPlanAudience,
  sanitizePopupSize,
  type PopupDevice,
  type PopupVideo,
  type PopupView,
} from "@/lib/popups";
import { activePopups } from "@/lib/popups-server";

const DAY_MS = 86_400_000;

/** A video link → what the player needs; unknown links are dropped. */
function toPopupVideo(url: string): PopupVideo | null {
  const src = url.startsWith("/") || /^https?:\/\//i.test(url) ? mediaSrc(url) : null;
  if (!src) return null;
  const r = resolveVideoUrl(src);
  if (r.kind === "youtube" || r.kind === "vimeo" || r.kind === "iframe") return { kind: "embed", src: r.embedUrl };
  if (r.kind === "file") return { kind: "file", src, mime: r.mime };
  return null;
}

// GET /api/popups?path=/social&d=MOBILE — the popups this viewer may see on
// this page, highest priority first. Public: visitors see popups too (by IP
// country). The browser then applies the frequency rule and shows them one at
// a time.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const path = (sp.get("path") || "/").slice(0, 300);
  if (isPopupQuietPath(path)) return NextResponse.json({ popups: [] });
  // The device class the browser reports from its viewport width. Unknown →
  // no device rule can match it, so device-targeted popups are skipped.
  const device = sanitizePopupDevices([sp.get("d")])[0] as PopupDevice | undefined;

  const all = await activePopups().catch(() => []);
  if (all.length === 0) return NextResponse.json({ popups: [] });

  const session = await auth().catch(() => null);
  const signedIn = !!session?.user?.id;
  const now = Date.now();

  const inPlay = all.filter((p) => {
    if (p.startsAt && new Date(p.startsAt).getTime() > now) return false;
    if (p.endsAt && new Date(p.endsAt).getTime() <= now) return false;
    if (!popupSessionMatches(p.sessionAudience, signedIn)) return false;
    if (!popupPlacementMatches(p, path)) return false;
    const devices = sanitizePopupDevices(p.devices);
    if (devices.length && (!device || !devices.includes(device))) return false;
    return true;
  });
  if (inPlay.length === 0) return NextResponse.json({ popups: [] });

  // Who is looking. A visitor is known only by the country of their IP, so a
  // popup aimed at a district, a gender, a plan or a level is (correctly) not
  // shown to them.
  await syncCountryMode();
  let viewer: BannerViewer = { lastCountry: countryOfIp(clientIp(request)) };
  let level: number | null = null;
  let joinedAt: number | null = null;
  let plan: { id: string; paid: boolean } | null = null;
  if (signedIn) {
    const userId = session!.user!.id!;
    const [me, pkg] = await Promise.all([
      prisma.user
        .findUnique({
          where: { id: userId },
          select: { ...TASK_VIEWER_SELECT, kycStatus: true, createdAt: true },
        })
        .catch(() => null),
      // Only looked up when some popup has a plan rule.
      inPlay.some((p) => p.packageIds.length || sanitizePopupPlanAudience(p.planAudience) !== "ANY")
        ? getEffectivePackage(userId).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (me) {
      viewer = me;
      level = me.level ?? null;
      joinedAt = me.createdAt.getTime();
    }
    if (pkg) plan = { id: pkg.id, paid: !pkg.isDefault && (pkg.priceMonthly > 0 || (pkg.priceYearly ?? 0) > 0) };
  }

  const matchesExtra = (p: (typeof inPlay)[number]): boolean => {
    const planAudience = sanitizePopupPlanAudience(p.planAudience);
    if (planAudience !== "ANY" || p.packageIds.length) {
      if (!plan) return false;
      if (planAudience === "FREE" && plan.paid) return false;
      if (planAudience === "PAID" && !plan.paid) return false;
      if (p.packageIds.length && !p.packageIds.includes(plan.id)) return false;
    }
    if (p.minLevel != null || p.maxLevel != null) {
      if (level == null) return false;
      if (p.minLevel != null && level < p.minLevel) return false;
      if (p.maxLevel != null && level > p.maxLevel) return false;
    }
    if (p.minAccountDays != null || p.maxAccountDays != null) {
      if (joinedAt == null) return false;
      const days = Math.floor((now - joinedAt) / DAY_MS);
      if (p.minAccountDays != null && days < p.minAccountDays) return false;
      if (p.maxAccountDays != null && days > p.maxAccountDays) return false;
    }
    return true;
  };

  const popups: PopupView[] = inPlay
    .filter((p) => bannerMatches(p, viewer) && matchesExtra(p))
    .slice(0, 5)
    .map((p) => {
      const kind = sanitizePopupKind(p.kind);
      return {
        id: p.id,
        title: p.title,
        kind,
        body: p.body ? sanitizeRichHtml(p.body) : null,
        imageUrl: p.imageUrl,
        ctaLabel: p.ctaLabel,
        ctaUrl: p.ctaUrl,
        cta2Label: p.cta2Label,
        cta2Url: p.cta2Url,
        videos: kind === "VIDEO" ? p.videos.map(toPopupVideo).filter((v): v is PopupVideo => !!v) : [],
        htmlCode: kind === "HTML" ? p.htmlCode : null,
        htmlHeight: Math.max(80, Math.min(1200, p.htmlHeight)),
        size: sanitizePopupSize(p.size),
        frequency: sanitizePopupFrequency(p.frequency),
        delaySeconds: Math.max(0, Math.min(60, p.delaySeconds)),
        version: versionOf(`${p.id}:${new Date(p.updatedAt).getTime()}`),
      };
    });

  return NextResponse.json(
    { popups },
    // Per viewer, so never shared by a CDN.
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
