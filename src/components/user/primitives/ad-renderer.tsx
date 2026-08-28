"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Megaphone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveAdSize } from "@/lib/ad-sizes";
import type { NetworkSlotConfig } from "@/lib/ad-network";
import {
  placementSizeKey,
  placementSpec,
  type AdPlacementName,
} from "@/lib/ad-placements";
import { SandboxedAdFrame } from "@/components/user/primitives/sandboxed-ad-frame";
import { NetworkAdSlot } from "@/components/user/primitives/network-ad-slot";

// Derive from the canonical catalog so this never drifts again (previously a
// hand-maintained duplicate that was missing VIDEO_OVERLAY / REWARD_INTERSTITIAL).
export type AdPlacement = AdPlacementName;

export type AdType = "LOCAL" | "HTML" | "ADSENSE" | "GAM";

export interface AdResponse {
  id: string;
  type: AdType;
  imageUrl?: string;
  videoUrl?: string;
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  html?: string;
  sponsor?: string;
  size?: string;
  width?: number;
  height?: number;
  impressionPixel?: string;
  clickTracker?: string;
  allowSameOrigin?: boolean;
  /** Present only for ADSENSE / GAM — what a real in-page slot needs. */
  network?: NetworkSlotConfig;
}

interface AdRendererProps {
  placement: AdPlacement;
  className?: string;
  // SSR-injected first ad (+ its rotation interval). When present the component
  // paints it immediately from the server HTML — an ad-blocker can't hide markup
  // that's already in the initial document — and skips the initial fetch (the
  // impression was already counted server-side). Rotation continues client-side.
  initialAd?: AdResponse | null;
  initialRotateMs?: number;
  /** Show a × so the viewer can dismiss the ad (used for the video overlay slots). */
  dismissible?: boolean;
}

// How many recently-shown ad ids to remember per placement, so reloads +
// auto-rotation cycle evenly across the pool instead of bouncing A→B→A.
const RECENT_KEEP = 4;

export function AdRenderer({
  placement,
  className,
  initialAd = null,
  initialRotateMs = 0,
  dismissible = false,
}: AdRendererProps) {
  const [ad, setAd] = useState<AdResponse | null>(initialAd);
  const [error, setError] = useState(false);
  const [fading, setFading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Reserve space during the first fetch (no SSR ad) so the slot doesn't jump.
  const [loading, setLoading] = useState(!initialAd);
  // Rotation interval (ms) reported by the server; 0 = don't auto-rotate
  // (single-ad space or ad-free viewer). Seeded from the SSR value when present.
  const rotateMsRef = useRef(initialRotateMs);

  // Fetch an ad, excluding the recently-shown ids kept in sessionStorage. On
  // success it records the new id and updates the rotation interval.
  const loadAd = useCallback(
    async (opts?: {
      rotate?: boolean;
      initial?: boolean;
      /** Ask for own/direct inventory only — used when a Google slot goes unfilled. */
      excludeNetwork?: boolean;
    }) => {
      const storeKey = `ad-recent-${placement}`;
      let recent: string[] = [];
      try {
        recent = JSON.parse(sessionStorage.getItem(storeKey) ?? "[]");
        if (!Array.isArray(recent)) recent = [];
      } catch {
        recent = [];
      }
      try {
        const qs = recent.length
          ? `&exclude=${encodeURIComponent(recent.join(","))}`
          : "";
        const noNet = opts?.excludeNetwork ? "&own=1" : "";
        const res = await fetch(
          `/api/spaces/panel?placement=${placement}${qs}${noNet}`
        );
        const data = res.ok ? await res.json() : null;
        if (!data?.ad) {
          // Only hide the slot when the very first load finds nothing; a failed
          // rotation keeps the current creative on screen.
          if (opts?.initial) setError(true);
          return false;
        }
        rotateMsRef.current =
          data.poolSize > 1 && typeof data.rotateMs === "number"
            ? data.rotateMs
            : 0;
        // Smoothly swap when this is a rotation (not the first paint).
        if (opts?.rotate) {
          setFading(true);
          await new Promise((r) => setTimeout(r, 180));
        }
        setAd(data.ad);
        setFading(false);
        try {
          const next = [data.ad.id, ...recent.filter((id) => id !== data.ad.id)]
            .slice(0, RECENT_KEEP);
          sessionStorage.setItem(storeKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return true;
      } catch {
        if (opts?.initial) setError(true);
        return false;
      }
    },
    [placement]
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const startTimer = () => {
      if (timer || rotateMsRef.current <= 0) return;
      timer = setInterval(() => {
        if (!document.hidden) void loadAd({ rotate: true });
      }, rotateMsRef.current);
    };
    const stopTimer = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    // Pause rotation on hidden tabs (don't churn impressions); resume + rotate
    // once on return.
    const onVisibility = () => {
      if (document.hidden) {
        stopTimer();
      } else {
        void loadAd({ rotate: true }).then(() => !cancelled && startTimer());
      }
    };

    if (initialAd) {
      // SSR already painted (and impression-counted) the first ad. Remember it
      // so the first client rotation doesn't repeat it, then start rotation
      // WITHOUT a second fetch (which would double-count the impression).
      try {
        const storeKey = `ad-recent-${placement}`;
        const prev: string[] = JSON.parse(
          sessionStorage.getItem(storeKey) ?? "[]"
        );
        const next = [initialAd.id, ...prev.filter((id) => id !== initialAd.id)]
          .slice(0, RECENT_KEEP);
        sessionStorage.setItem(storeKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      startTimer();
      document.addEventListener("visibilitychange", onVisibility);
    } else {
      // loadAd only setState()s after an `await fetch` (a real async boundary),
      // so this is not a synchronous cascading render — the rule is a false
      // positive.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadAd({ initial: true }).then((ok) => {
        if (cancelled) return;
        setLoading(false);
        if (!ok) return;
        startTimer();
        document.addEventListener("visibilitychange", onVisibility);
      });
    }

    return () => {
      cancelled = true;
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadAd, initialAd, placement]);

  if (error || dismissed) return null;
  if (!ad) {
    // Truly no ad → collapse (no permanent blank box).
    if (!loading) return null;
    // First load in flight → reserve a size-shaped skeleton so nothing jumps.
    // Uses the same space ceiling the real ad does, so the reserved box and the
    // box that lands are the same box. They used to disagree: the skeleton was
    // shaped from the placement while the ad was shaped from itself, which is
    // why the layout jumped when an oversized creative arrived.
    const reserved = resolveAdSize(placementSizeKey(placement));
    const cap = placementSpec(placement).maxHeightPx;
    return (
      <div
        className={cn(
          "rounded-2xl border border-gray-800 bg-gray-900/40 animate-pulse mx-auto",
          className
        )}
        style={{
          aspectRatio: reserved ? `${reserved.w} / ${reserved.h}` : undefined,
          maxWidth: reserved?.w,
          maxHeight: cap,
          minHeight: reserved ? undefined : Math.min(90, cap),
        }}
      />
    );
  }

  const trackClick = () => {
    fetch(`/api/spaces/${ad.id}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "open" }),
    }).catch(() => {});
    // Optional third-party click tracker.
    if (ad.clickTracker) {
      try {
        void fetch(ad.clickTracker, { mode: "no-cors", keepalive: true });
      } catch {
        /* best-effort */
      }
    }
  };

  const dim = resolveAdSize(ad.size, ad.width, ad.height);
  // How wide this SPACE is meant to be, for creatives that don't say.
  //
  // `Ad.size` defaults to "responsive" and every row in the database uses it, so
  // `dim` above is null for all of them and `outerStyle.maxWidth` was never set.
  // The card then filled whatever width it was handed — which on a wide page
  // left a small creative marooned in the middle of a very large empty band,
  // because `object-contain` below letterboxes rather than crops.
  //
  // The network path already resolves in exactly these two steps
  // (`src/lib/ad-network.ts` — `resolveAdSize(…) ?? resolveAdSize(placementSizeKey(…))`);
  // the LOCAL path only ever did the first. A leaderboard space now caps at
  // 728px and centres, which is what a leaderboard unit is meant to look like.
  //
  // Deliberately WIDTH ONLY, not the aspect ratio. The demo creatives are 600×200
  // and a real one can be anything; forcing them into a 728×90 box would contain
  // them down to ~270px wide. Capping the width and letting `maxHeight` bound the
  // rest shows the creative as large as the space allows. A space whose only size
  // is "responsive" (IN_FEED) still resolves to null and keeps filling its column,
  // which is correct there.
  const slotDim = dim ?? resolveAdSize(placementSizeKey(placement));
  // The SPACE decides the ceiling; the ad decides its shape within it.
  //
  // This used to read the ad's size alone. `Ad.size` defaults to "responsive",
  // and `resolveAdSize` returns null for that (and for an unknown string, and
  // for a malformed "custom") — which meant no maxWidth, no aspect ratio and no
  // height cap anywhere. Every ad in the database is "responsive", so in
  // practice nothing was ever capped: a tall creative rendered `w-full h-auto`
  // and ran for several screens. The loading skeleton above already sized
  // itself from the placement, so the layout jumped when the ad landed.
  //
  // `maxHeight` is the part that matters. Write-time validation cannot reach
  // rows that already exist; this can.
  const spec = placementSpec(placement);
  // The ceiling goes on the MEDIA, not on the card. A LOCAL ad renders the
  // image above a title/body block, and capping the whole card would clip the
  // text instead of the thing that was oversized. Capping the media bounds the
  // card anyway: image ≤ maxHeightPx, plus a fixed text block.
  //
  // `object-contain` (already on both elements) letterboxes rather than crops,
  // so a tall creative is shown whole at a smaller size instead of being cut.
  const mediaStyle = {
    ...(dim ? { aspectRatio: `${dim.w} / ${dim.h}` } : {}),
    maxHeight: spec.maxHeightPx,
  };
  // Merge the rotation fade into the outer style.
  const outerStyle = {
    ...(slotDim ? { maxWidth: slotDim.w } : {}),
    opacity: fading ? 0 : 1,
    transition: "opacity 180ms ease",
  } as const;

  // AdSense / Ad Manager — a REAL in-page slot, not an iframe.
  //
  // These used to be composed into a self-contained document and rendered in the
  // sandboxed frame below, which loaded Google's script once per slot. The
  // script now loads once from the root layout and this renders against it.
  //
  // `onUnfilled` is the fallback the platform needs while AdSense is young: when
  // Google returns nothing, the slot asks for own/direct inventory instead of
  // leaving a hole. Without it every unsold impression is simply lost.
  if ((ad.type === "ADSENSE" || ad.type === "GAM") && ad.network) {
    return (
      <div className={cn("relative mx-auto", className)} style={outerStyle}>
        <NetworkAdSlot
          config={ad.network}
          maxHeightPx={spec.maxHeightPx}
          onUnfilled={() => void loadAd({ rotate: true, excludeNetwork: true })}
        />
      </div>
    );
  }

  // HTML creative — runs inside the shared sandboxed iframe so injected <script>
  // actually executes (dangerouslySetInnerHTML never does).
  if (ad.type === "HTML" && ad.html) {
    return (
      <div className={cn("relative mx-auto", className)} style={outerStyle}>
        {dismissible && (
          <button
            type="button"
            aria-label="Hide ad"
            onClick={() => setDismissed(true)}
            className="absolute top-1.5 left-1.5 z-20 w-6 h-6 grid place-items-center rounded-full bg-black/60 backdrop-blur text-white/70 hover:text-white hover:bg-black/80"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <SandboxedAdFrame
          html={ad.html}
          // Clamped by the space, not just the ad. A `custom` size could set an
          // arbitrary pixel height here, and the frame applies it inline with no
          // ceiling of its own.
          height={Math.min(dim?.h ?? 250, spec.maxHeightPx)}
          impressionPixel={ad.impressionPixel}
          allowSameOrigin={ad.allowSameOrigin}
        />
      </div>
    );
  }

  return (
    <a
      href={ad.ctaUrl ?? "#"}
      target="_blank"
      rel="noopener sponsored noreferrer"
      onClick={trackClick}
      style={outerStyle}
      className={cn(
        "relative block rounded-2xl overflow-hidden border border-gray-800 bg-gray-900 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5 transition-all group mx-auto",
        className
      )}
    >
      <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur text-[9px] font-bold uppercase tracking-wider text-white/90">
        <Megaphone className="w-2.5 h-2.5" />
        Sponsored
      </span>
      {dismissible && (
        <button
          type="button"
          aria-label="Hide ad"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDismissed(true);
          }}
          className="absolute top-2 left-2 z-20 w-6 h-6 grid place-items-center rounded-full bg-black/60 backdrop-blur text-white/70 hover:text-white hover:bg-black/80"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {ad.impressionPixel ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ad.impressionPixel} alt="" width={1} height={1} className="absolute bottom-0 right-0 opacity-0 pointer-events-none" />
      ) : null}
      {ad.videoUrl ? (
        <video
          src={ad.videoUrl}
          autoPlay
          muted
          loop
          playsInline
          className={cn("w-full object-contain bg-black", !dim && "h-auto")}
          style={mediaStyle}
        />
      ) : (
        ad.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.imageUrl}
            alt={ad.title ?? "Ad"}
            className={cn("w-full object-contain", !dim && "h-auto")}
            style={mediaStyle}
          />
        )
      )}
      <div className="p-3.5">
        {ad.title && (
          <p className="text-sm font-bold text-white line-clamp-1">
            {ad.title}
          </p>
        )}
        {ad.body && (
          <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">
            {ad.body}
          </p>
        )}
        <div className="flex items-center justify-between mt-2.5">
          <span className="text-[10px] text-gray-500">
            {ad.sponsor ? `by ${ad.sponsor}` : "Sponsored"}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/15 text-xs font-bold text-indigo-300 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
            {ad.ctaLabel || "Learn More"}
            <ExternalLink className="w-3 h-3" />
          </span>
        </div>
      </div>
    </a>
  );
}
