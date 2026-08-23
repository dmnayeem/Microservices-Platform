"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import type { AdPlacementName } from "@/lib/ad-placements";
import { SandboxedAdFrame } from "@/components/user/primitives/sandboxed-ad-frame";

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
  impressionPixel?: string;
  allowSameOrigin?: boolean;
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
  allowClose = false,
  source,
}: {
  open: boolean;
  onDone: () => void;
  skipSeconds?: number;
  placement?: AdPlacementName;
  /** Show an always-available × so the viewer can close the ad immediately,
   *  without waiting out the forced-watch countdown (used for video tasks). */
  allowClose?: boolean;
  /**
   * Fetch the ad from a caller-owned endpoint instead of the shared serve
   * route. The response shape is identical.
   *
   * Games use this so the SERVER both serves the ad and records that this play
   * session saw one. The impression path has no per-user row of its own —
   * `serveAd` buffers a per-ad counter and the client `view` beacon is skipped
   * for interstitials — so the serve is the only moment the platform knows who
   * was shown what, and `rewardRequiresAd` has to be counted there.
   */
  source?: { url: string; body?: unknown };
}) {
  const [ad, setAd] = useState<Ad | null>(null);
  const [left, setLeft] = useState(skipSeconds);
  const [total, setTotal] = useState(skipSeconds);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    // Timeout so a hung request never blocks the host flow (the gate resolves).
    const req: Promise<Response> = source
      ? fetch(source.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(source.body ?? {}),
          signal: AbortSignal.timeout(8000),
        })
      : fetch(`/api/spaces/panel?placement=${placement}`, {
          signal: AbortSignal.timeout(8000),
        });
    req
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancel) return;
        if (d?.ad) {
          setAd(d.ad);
          // Duration is admin-set per space (server), falling back to the prop.
          const secs = Number(d.interstitialSeconds) || skipSeconds;
          setLeft(secs);
          setTotal(secs);
          // The serve call already counted this impression server-side; firing
          // the beacon too would double-count every interstitial.
          if (!d.countedServerSide) {
            fetch(`/api/spaces/${d.ad.id}/event`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: "view" }),
            }).catch(() => {});
          }
        } else {
          doneRef.current(); // no ad → don't block
        }
      })
      .catch(() => !cancel && doneRef.current());
    return () => {
      cancel = true;
      setAd(null); // clear on close so a reopen never flashes a stale ad
    };
    // `source` is intentionally read by identity, not deep-compared: callers
    // pass a stable object, and re-fetching on every render would serve (and
    // count) a new ad each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, skipSeconds, placement, source?.url]);

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

  const done = left <= 0;
  const progress = total > 0 ? Math.min(100, ((total - left) / total) * 100) : 100;

  return (
    <div className="fixed inset-0 z-10001 bg-black/95 flex flex-col items-center justify-center p-4">
      <span className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider text-white/60">
        Sponsored
      </span>
      {allowClose && (
        <button
          type="button"
          onClick={onDone}
          aria-label="Close ad"
          className="absolute top-3 right-3 z-10 w-9 h-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Creative — pick by what the ad actually carries (a house video is
          stored as type LOCAL with a videoUrl), so key off presence not type. */}
      {ad.videoUrl ? (
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
      ) : ad.html ? (
        <div className="max-w-md w-full">
          <SandboxedAdFrame
            html={ad.html}
            height={280}
            impressionPixel={ad.impressionPixel}
            badge={false}
            allowSameOrigin={ad.allowSameOrigin}
          />
        </div>
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

      {/* Bottom bar — the countdown runs here; a Close button appears at 0, then
          the caller reveals the reward. */}
      <div className="absolute inset-x-0 bottom-0 p-4 flex flex-col items-center gap-2 bg-linear-to-t from-black/90 to-transparent">
        {!done ? (
          <>
            <div className="w-full max-w-md h-1.5 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-[width] duration-1000 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs font-semibold text-white/80 tabular-nums">
              Reward unlocks in {left}s
            </p>
          </>
        ) : (
          <button
            onClick={onDone}
            className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold"
          >
            <X className="w-4 h-4" />
            Close &amp; claim reward
          </button>
        )}
      </div>
    </div>
  );
}
