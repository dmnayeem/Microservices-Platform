"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, X, MoreHorizontal, Play, ChevronRight } from "lucide-react";
import { SmartImage } from "@/components/user/primitives/smart-image";

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

/**
 * Compact "Sponsored" ad card — Facebook link-ad style: thumbnail on the left,
 * headline + green destination URL + "Advertiser · Ad" on the right, with a
 * dismiss (×) and an options (⋯) menu. Clicking the card opens the destination.
 * Impression (view) + click (open) tracking is unchanged.
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

  const initial = (ad.author.name || "A").charAt(0).toUpperCase();
  const poster = ad.images[0] || null;
  const hasVideo = !!ad.videoUrl;
  const url = ad.targetUrl;

  // The thumbnail block (image poster / video first-frame / placeholder + play).
  const thumb = (
    <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 overflow-hidden rounded-lg bg-gray-950">
      {poster ? (
        <SmartImage
          src={poster}
          alt=""
          fill
          sizes="112px"
          className="object-cover"
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
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full grid place-items-center bg-linear-to-br from-indigo-600/30 to-purple-600/20 text-2xl font-extrabold text-white/80">
          {initial}
        </div>
      )}
      {hasVideo && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="w-9 h-9 rounded-full bg-black/55 backdrop-blur grid place-items-center">
            <Play className="w-4 h-4 text-white fill-white translate-x-px" />
          </span>
        </span>
      )}
    </div>
  );

  const bodyInner = (
    <>
      {thumb}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white leading-snug line-clamp-2 pr-6">
          {ad.content || ad.author.name}
        </p>
        {url && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-400 max-w-full">
            <Play className="w-3 h-3 shrink-0 fill-emerald-400" />
            <span className="truncate">{displayUrl(url)}</span>
          </p>
        )}
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-500 truncate max-w-full">
          <span className="truncate">{ad.author.name}</span>
          {ad.author.isBlueVerified && (
            <CheckCircle className="w-3 h-3 shrink-0 text-blue-400 fill-blue-500/30" />
          )}
          <span aria-hidden>·</span>
          <span>Ad</span>
        </p>
      </div>
    </>
  );

  return (
    <article
      ref={ref}
      className="relative rounded-xl border border-gray-800 bg-gray-900 overflow-hidden"
    >
      {/* Dismiss (×) */}
      <button
        type="button"
        aria-label="Hide ad"
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 z-10 w-6 h-6 grid place-items-center rounded-full text-gray-500 hover:text-white hover:bg-gray-800/70 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Body — links to the destination (or a plain block when no URL) */}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener sponsored noreferrer"
          onClick={trackClick}
          className="flex items-start gap-3 p-3 hover:bg-gray-800/30 transition-colors"
        >
          {bodyInner}
        </a>
      ) : (
        <div className="flex items-start gap-3 p-3">{bodyInner}</div>
      )}

      {/* Options (⋯) */}
      <div className="absolute bottom-1.5 right-1.5 z-10">
        <button
          type="button"
          aria-label="Ad options"
          onClick={() => setMenuOpen((v) => !v)}
          className="w-6 h-6 grid place-items-center rounded-full text-gray-500 hover:text-white hover:bg-gray-800/70 transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute bottom-8 right-0 z-20 w-44 rounded-lg border border-gray-700 bg-gray-900 shadow-xl overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setDismissed(true);
                }}
                className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800"
              >
                Hide this ad
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setShowWhy(true);
                }}
                className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 inline-flex items-center gap-1"
              >
                Why this ad? <ChevronRight className="w-3 h-3 text-gray-500" />
              </button>
            </div>
          </>
        )}
      </div>

      {showWhy && (
        <p className="px-3 pb-2 -mt-1 text-[11px] text-gray-500">
          This is a sponsored ad — ads like this help keep the platform free.
        </p>
      )}
    </article>
  );
}
