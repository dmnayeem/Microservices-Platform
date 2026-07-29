"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import type { AdPlacementName } from "@/lib/ad-placements";

interface Ad {
  id: string;
  type: string;
  imageUrl?: string;
  videoUrl?: string;
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  html?: string;
  sponsor?: string;
}

/**
 * Imperative full-screen interstitial ad. When `open` flips true it fetches an
 * ad for `placement` (default GAME_INTERSTITIAL); if none is available (or the
 * plan is ad-free) it calls `onDone()` immediately so the host flow never
 * blocks. Otherwise it shows the ad with a skip countdown; closing calls
 * `onDone()`. Tracks impression on show and click on the CTA.
 */
export function AdInterstitialOverlay({
  open,
  onDone,
  skipSeconds = 5,
  placement = "GAME_INTERSTITIAL",
}: {
  open: boolean;
  onDone: () => void;
  skipSeconds?: number;
  placement?: AdPlacementName;
}) {
  const [ad, setAd] = useState<Ad | null>(null);
  const [left, setLeft] = useState(skipSeconds);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    // Timeout so a hung request never blocks the host flow (the gate resolves).
    fetch(`/api/spaces/panel?placement=${placement}`, {
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancel) return;
        if (d?.ad) {
          setAd(d.ad);
          // Duration is admin-set per space (server), falling back to the prop.
          setLeft(Number(d.interstitialSeconds) || skipSeconds);
          fetch(`/api/spaces/${d.ad.id}/event`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "view" }),
          }).catch(() => {});
        } else {
          doneRef.current(); // no ad → don't block
        }
      })
      .catch(() => !cancel && doneRef.current());
    return () => {
      cancel = true;
      setAd(null); // clear on close so a reopen never flashes a stale ad
    };
  }, [open, skipSeconds, placement]);

  // Skip countdown.
  useEffect(() => {
    if (!open || !ad || left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [open, ad, left]);

  if (!open || !ad) return null;

  const trackClick = () => {
    fetch(`/api/spaces/${ad.id}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "open" }),
    }).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-10001 bg-black/95 flex flex-col items-center justify-center p-4">
      <span className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider text-white/60">
        Sponsored
      </span>
      <button
        onClick={() => left <= 0 && onDone()}
        disabled={left > 0}
        className="absolute top-3 right-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-bold disabled:opacity-60"
      >
        {left > 0 ? `Skip in ${left}s` : (<><X className="w-3.5 h-3.5" /> Close</>)}
      </button>

      {ad.type === "VIDEO" && ad.videoUrl ? (
        <div className="max-w-md w-full rounded-2xl overflow-hidden border border-white/10 bg-black">
          {/* Autoplay must be muted to satisfy browser policies. */}
          <video
            src={ad.videoUrl}
            autoPlay
            muted
            playsInline
            controls
            className="w-full max-h-[70vh] bg-black"
          />
          {ad.ctaUrl && (
            <a
              href={ad.ctaUrl}
              target="_blank"
              rel="noopener sponsored noreferrer"
              onClick={trackClick}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-500 text-white text-sm font-bold"
            >
              {ad.ctaLabel || "Learn More"}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      ) : ad.type === "HTML" && ad.html ? (
        <div
          className="max-w-md w-full rounded-2xl overflow-hidden border border-white/10"
          dangerouslySetInnerHTML={{ __html: ad.html }}
        />
      ) : (
        <a
          href={ad.ctaUrl ?? "#"}
          target="_blank"
          rel="noopener sponsored noreferrer"
          onClick={trackClick}
          className="max-w-md w-full rounded-2xl overflow-hidden border border-white/10 bg-gray-900 block"
        >
          {ad.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.imageUrl} alt={ad.title ?? "Ad"} className="w-full max-h-72 object-cover" />
          )}
          <div className="p-4">
            {ad.title && <p className="text-base font-bold text-white">{ad.title}</p>}
            {ad.body && <p className="text-sm text-gray-400 mt-1">{ad.body}</p>}
            <span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm font-bold">
              {ad.ctaLabel || "Learn More"}
              <ExternalLink className="w-3.5 h-3.5" />
            </span>
          </div>
        </a>
      )}
    </div>
  );
}
