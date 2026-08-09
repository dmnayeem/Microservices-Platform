"use client";

import { useEffect, useState } from "react";
import { X, Megaphone, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdResponse } from "@/components/user/primitives/ad-renderer";

/**
 * Dismissible in-video banner strip pinned over the bottom of a playing video
 * (video / YouTube / social watch tasks) — the "VIDEO_OVERLAY" placement.
 *
 * Reuses the shared ad pipeline: GET /api/spaces/panel?placement=VIDEO_OVERLAY
 * (→ serveAd) which counts the impression server-side, applies advertiser
 * targeting/budget, and returns nothing for ad-free plans (we render null).
 * Only first-party LOCAL banner creatives are shown as a strip. Clicking opens
 * the destination in a new tab (that blurs the window → watch-time pauses until
 * the user returns, same as any outbound link) and records a click; the × just
 * hides it in-page (no effect on watch accrual).
 */
export function VideoOverlayAd({ className }: { className?: string }) {
  const [ad, setAd] = useState<AdResponse | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch("/api/spaces/panel?placement=VIDEO_OVERLAY")
      .then((r) => r.json())
      .then((d) => {
        if (cancel) return;
        const a = (d?.ad ?? null) as AdResponse | null;
        // A thin strip only makes sense for a first-party banner creative.
        if (a && a.type === "LOCAL" && (a.imageUrl || a.title)) setAd(a);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

  // Slide in a few seconds after the video starts, so it doesn't clutter the intro.
  useEffect(() => {
    if (!ad) return;
    const t = setTimeout(() => setVisible(true), 3500);
    return () => clearTimeout(t);
  }, [ad]);

  if (!ad || dismissed) return null;

  const trackClick = () => {
    fetch(`/api/spaces/${ad.id}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "open" }),
    }).catch(() => {});
    if (ad.clickTracker) {
      try {
        void fetch(ad.clickTracker, { mode: "no-cors", keepalive: true });
      } catch {
        /* best-effort */
      }
    }
  };

  return (
    <div
      className={cn(
        "transition-all duration-300",
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2 pointer-events-none",
        className
      )}
    >
      <div className="relative flex items-center gap-2 rounded-lg border border-white/10 bg-black/70 backdrop-blur py-1.5 pl-2 pr-8 shadow-lg">
        {ad.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.imageUrl}
            alt=""
            className="w-10 h-10 rounded object-cover shrink-0 bg-black"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <a
          href={ad.ctaUrl ?? "#"}
          target="_blank"
          rel="noopener sponsored noreferrer"
          onClick={trackClick}
          className="flex-1 min-w-0"
        >
          <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold inline-flex items-center gap-1">
            <Megaphone className="w-2.5 h-2.5" /> Sponsored
          </p>
          <p className="text-xs font-semibold text-white truncate">{ad.title}</p>
        </a>
        <a
          href={ad.ctaUrl ?? "#"}
          target="_blank"
          rel="noopener sponsored noreferrer"
          onClick={trackClick}
          className="shrink-0 inline-flex items-center gap-1 rounded-md bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold px-2.5 py-1 transition-colors"
        >
          {ad.ctaLabel || "Learn More"} <ExternalLink className="w-3 h-3" />
        </a>
        <button
          type="button"
          aria-label="Hide ad"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDismissed(true);
          }}
          className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-full text-white/60 hover:text-white hover:bg-white/15"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {ad.impressionPixel && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ad.impressionPixel} alt="" width={1} height={1} className="hidden" />
      )}
    </div>
  );
}
