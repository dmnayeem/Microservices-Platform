"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle,
  ExternalLink,
  MoreVertical,
  Play,
  X,
} from "lucide-react";
import { mediaSrc } from "@/lib/media-url";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { placementSpec } from "@/lib/ad-placements";

/** A native feed ad, shaped by GET /api/ads/feed. */
export interface FeedAd {
  adId: string;
  kind: "post" | "brand";
  author: {
    name: string;
    username: string | null;
    avatar: string | null;
    isBlueVerified: boolean;
    verifiedBadgeStyle: string | null;
  };
  content: string;
  images: string[];
  videoUrl?: string | null;
  backgroundStyle: string | null;
  ctaLabel: string;
  targetUrl: string | null;
}

/** Pretty display URL: hostname + path, trailing slash trimmed. Falls back to raw. */
function displayUrl(u: string): string {
  try {
    const url = new URL(u);
    const s = (url.hostname + url.pathname).replace(/\/+$/, "");
    return s || url.hostname;
  } catch {
    return u.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
}

/* The overlay chrome is the same measured set the shared renderer uses — see
   the note on TEXT_BAND in src/components/user/primitives/ad-renderer.tsx. The
   two files are the only places white text sits on an unknown creative, and
   they must agree, so the values are asserted against each other in
   scripts/verify-ads-coverage.ts. */
const CHIP_BG = "rgba(8,9,14,0.78)";

/**
 * Split the ad copy into a headline and the description under the creative.
 *
 * A feed ad carries one block of text, and the reference wants two: a short
 * line ON the creative and a fuller one below it. Taking the first sentence for
 * the headline means the two are not the same words twice — and when there is
 * only one sentence, the description falls back to the destination rather than
 * repeating the headline.
 */
function splitPitch(content: string): { headline: string; rest: string } {
  const text = content.trim();
  if (!text) return { headline: "", rest: "" };
  const m = text.match(/^(.{1,90}?[.!?])(\s+|$)([\s\S]*)$/);
  if (m) return { headline: m[1].trim(), rest: m[3].trim() };
  if (text.length <= 90) return { headline: text, rest: "" };
  const cut = text.lastIndexOf(" ", 90);
  return {
    headline: text.slice(0, cut > 40 ? cut : 90).trim(),
    rest: text.slice(cut > 40 ? cut : 90).trim(),
  };
}

/** Last word of the headline takes the accent, as in the reference. */
function splitHeadline(title: string): { lead: string; accent: string } {
  const t = title.trim();
  if (!t) return { lead: "", accent: "" };
  const i = t.lastIndexOf(" ");
  if (i <= 0) return { lead: "", accent: t };
  return { lead: t.slice(0, i), accent: t.slice(i + 1) };
}

/**
 * The native in-feed ad card.
 *
 * Shape, top to bottom: the creative full-bleed with the brand chip and the
 * accented headline laid over it and an outbound arrow at its lower right; then
 * the round brand avatar, the description and the ⋮; then "Sponsored ·
 * BrandName"; then two full-width buttons.
 *
 * Impression (view) and click (open) tracking are the same two calls they were
 * before — `/api/spaces/[id]/event` with `kind: "view"` once on 50% visibility,
 * and `kind: "open"` from every control that navigates.
 */
export function FeedAdCard({ ad }: { ad: FeedAd }) {
  const ref = useRef<HTMLElement | null>(null);
  const firedRef = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  // Count one impression when the ad first scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !firedRef.current) {
            firedRef.current = true;
            fetch(`/api/spaces/${ad.adId}/event`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: "view" }),
            }).catch(() => {});
            io.disconnect();
          }
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ad.adId]);

  const trackClick = () => {
    fetch(`/api/spaces/${ad.adId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "open" }),
    }).catch(() => {});
  };

  if (dismissed) return null;

  const brand = ad.author.name || "Sponsored";
  const initial = brand.charAt(0).toUpperCase();
  const poster = ad.images[0] || null;
  const hasVideo = !!ad.videoUrl;
  const url = ad.targetUrl;
  const { headline, rest } = splitPitch(ad.content);
  const { lead, accent } = splitHeadline(headline || brand);
  const description = rest || (url ? displayUrl(url) : brand);

  // Same contract as every other space: the ceiling comes from the catalog, not
  // from a number typed here, and the box is reserved before the bytes land so
  // the feed does not shift under the reader's thumb.
  // NO forced aspect ratio. A fixed 16/9 box with `object-contain` is what put
  // black bars above and below every creative that is not 16/9 — and almost
  // none are. The creative sets its own height; `minHeight` reserves a row so
  // the feed still does not jump while the bytes are in flight, and the space's
  // ceiling still caps it. Reserving HEIGHT does not decide the shape, which is
  // the whole difference.
  const mediaMax = placementSpec("IN_FEED").maxHeightPx;
  const mediaStyle = {
    minHeight: Math.round(mediaMax * 0.5),
    maxHeight: mediaMax,
  };

  // One anchor shape for every region that navigates — the creative, the arrow
  // inside it, and both buttons. There is exactly one `trackClick`, so no
  // control can look actionable without billing.
  const linkProps = {
    href: url ?? "",
    target: "_blank",
    rel: "noopener sponsored noreferrer",
    onClick: trackClick,
  } as const;

  const creative = (
    <div
      className="on-media relative w-full overflow-hidden bg-(--app-media-well)"
      style={mediaStyle}
    >
        {poster ? (
          // A plain <img>, not the fill/Image path: `FeedAd` carries no
          // dimensions, and `fill` needs a parent with a fixed height — which
          // is precisely the box that letterboxed the creative and left the
          // black bars. Letting the image size itself is what removes them.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaSrc(poster)}
            alt=""
            loading="lazy"
            decoding="async"
            className="block h-auto w-full"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : hasVideo ? (
          <video
            src={ad.videoUrl ?? undefined}
            muted
            playsInline
            preload="metadata"
            className="block h-auto w-full"
          />
        ) : (
          <div
            className="grid h-full w-full place-items-center text-4xl font-black text-white/90"
            style={{ backgroundImage: "var(--app-grad)" }}
          >
            {initial}
          </div>
        )}
        {hasVideo && !poster && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 backdrop-blur-sm">
              <Play className="h-5 w-5 translate-x-px fill-white text-white" />
            </span>
          </span>
        )}

        {/* Brand chip */}
        <span
          className="on-media pointer-events-none absolute left-2 top-2 z-20 inline-flex max-w-[75%] items-center gap-1.5 rounded-full px-2 py-1 backdrop-blur-sm"
          style={{ backgroundColor: CHIP_BG }}
        >
          {/* A white disc inside `on-media`: the family rule would paint this
              monogram white too, leaving a blank circle — the same failure as
              the Claim button, in the place the owner first reported it. */}
          <span className="app-on-white [--app-on-white-ink:#000] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white text-[9px] font-black">
            {initial}
          </span>
          <span className="truncate text-[11px] font-semibold text-white">
            {brand}
          </span>
        </span>

        {/* Headline and arrow, on the creative — the reference card's layout.
          *
          * They used to sit in a row of their own beneath the image, and that
          * row is most of why this card was so much taller than the reference:
          * two lines of heading plus a 44px circle, above a description that is
          * usually the same sentence again.
          *
          * The headline was moved off the image once before, because a full
          * gradient band across the creative was the "black shadow" reported
          * over and over. What comes back is not that band: it covers the
          * bottom of the image only, fades to nothing well before the middle,
          * and exists solely so text on an unknown photo stays readable — the
          * same treatment the reference card uses. Nothing is drawn at all
          * when there is no headline. */}
        {(lead || accent) && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 block h-2/5 bg-linear-to-t from-black/70 via-black/25 to-transparent" />
        )}
        {((lead || accent) || url) && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end gap-2 p-3">
            {(lead || accent) && (
              <span className="on-media line-clamp-2 min-w-0 flex-1 text-base font-extrabold leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                {lead}
                {accent ? (
                  <span className="text-(--app-info)">
                    {lead ? " " : ""}
                    {accent}
                  </span>
                ) : null}
              </span>
            )}
            {url ? (
              <span className="app-accent ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            ) : null}
          </span>
        )}
      </div>
  );

  return (
    <article
      ref={ref}
      className="app-card relative isolate overflow-hidden p-0"
    >
      {url ? (
        <a {...linkProps} className="app-press block" aria-label={`${headline || brand} — ${brand}`}>
          {creative}
        </a>
      ) : (
        creative
      )}

      {/* Dismiss (×) — over the creative, never over a button. */}
      <button
        type="button"
        aria-label="Hide ad"
        onClick={() => setDismissed(true)}
        className="app-tap absolute right-0 top-0 z-30 grid place-items-center"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white/80 backdrop-blur-sm hover:bg-black/80 hover:text-white">
          <X className="h-3.5 w-3.5" />
        </span>
      </button>

      <div className="px-4 pb-3 pt-2">
        <div className="flex items-start gap-2.5">
          {ad.author.avatar ? (
            <SmartImage
              src={ad.author.avatar}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black text-white"
              style={{ backgroundImage: "var(--app-grad)" }}
            >
              {initial}
            </span>
          )}
          <p className="t-body line-clamp-2 min-w-0 flex-1 text-(--app-ink-2)">
            {description}
          </p>
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Ad options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="app-tap app-press -mr-2 -mt-2 grid place-items-center rounded-full text-(--app-ink-3) hover:text-(--app-ink)"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <span
                  className="fixed inset-0 z-30"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-9 z-40 w-44 overflow-hidden rounded-(--app-r-control) border border-(--app-line) bg-(--app-surface) shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setDismissed(true);
                    }}
                    className="app-tap-row w-full px-3 text-left text-xs text-(--app-ink-2) hover:bg-(--app-surface-2)"
                  >
                    Hide this ad
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowWhy(true);
                    }}
                    className="app-tap-row w-full px-3 text-left text-xs text-(--app-ink-2) hover:bg-(--app-surface-2)"
                  >
                    Why this ad?
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <p className="t-meta mt-2 inline-flex items-center gap-1 text-(--app-ink-3)">
          <span>Sponsored ·</span>
          <span className="truncate">{brand}</span>
          {ad.author.isBlueVerified && (
            <CheckCircle className="h-3 w-3 shrink-0 fill-blue-500/30 text-blue-400" />
          )}
        </p>
        {showWhy && (
          <p className="t-meta mt-1 text-(--app-ink-3)">
            Ads like this keep the platform free to use.
          </p>
        )}

        {/* Both buttons navigate and both bill — see the note in ad-renderer. */}
        {url && (
          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <a
              {...linkProps}
              className="app-tap-row app-press flex items-center justify-center rounded-(--app-r-control) border border-(--app-line) bg-(--app-surface-2) px-3 text-center text-sm font-bold text-(--app-ink)"
            >
              {ad.ctaLabel || "Learn More"}
            </a>
            <a
              {...linkProps}
              className="app-tap-row app-press flex items-center justify-center gap-1.5 rounded-(--app-r-control) bg-(--app-bright) px-3 text-sm font-bold text-(--app-on-bright)"
            >
              Visit site
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>
    </article>
  );
}
