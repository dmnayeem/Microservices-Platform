"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveAdSize } from "@/lib/ad-sizes";
import { placementSizeKey } from "@/lib/ad-placements";
import { SandboxedAdFrame } from "@/components/user/primitives/sandboxed-ad-frame";

export type AdPlacement =
  | "IN_FEED"
  | "FEED_POST_BELOW"
  | "FEED_SIDEBAR"
  | "TASK_LIST"
  | "TASK_START"
  | "VIDEO_ABOVE"
  | "VIDEO_BELOW"
  | "VIDEO_OVERLAY"
  | "TASK_COMPLETE"
  | "GAME_INTERSTITIAL"
  | "VIDEO_INTERSTITIAL"
  | "DASHBOARD"
  | "EARN_HUB"
  | "WALLET_TOP"
  | "MARKETPLACE_TOP"
  | "PROFILE_BOTTOM";

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
}

// How many recently-shown ad ids to remember per placement, so reloads +
// auto-rotation cycle evenly across the pool instead of bouncing A→B→A.
const RECENT_KEEP = 4;

export function AdRenderer({
  placement,
  className,
  initialAd = null,
  initialRotateMs = 0,
}: AdRendererProps) {
  const [ad, setAd] = useState<AdResponse | null>(initialAd);
  const [error, setError] = useState(false);
  const [fading, setFading] = useState(false);
  // Reserve space during the first fetch (no SSR ad) so the slot doesn't jump.
  const [loading, setLoading] = useState(!initialAd);
  // Rotation interval (ms) reported by the server; 0 = don't auto-rotate
  // (single-ad space or ad-free viewer). Seeded from the SSR value when present.
  const rotateMsRef = useRef(initialRotateMs);

  // Fetch an ad, excluding the recently-shown ids kept in sessionStorage. On
  // success it records the new id and updates the rotation interval.
  const loadAd = useCallback(
    async (opts?: { rotate?: boolean; initial?: boolean }) => {
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
        const res = await fetch(`/api/spaces/panel?placement=${placement}${qs}`);
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

  if (error) return null;
  if (!ad) {
    // Truly no ad → collapse (no permanent blank box).
    if (!loading) return null;
    // First load in flight → reserve a size-shaped skeleton so nothing jumps.
    const reserved = resolveAdSize(placementSizeKey(placement));
    return (
      <div
        className={cn(
          "rounded-2xl border border-gray-800 bg-gray-900/40 animate-pulse mx-auto",
          className
        )}
        style={{
          aspectRatio: reserved ? `${reserved.w} / ${reserved.h}` : undefined,
          maxWidth: reserved?.w,
          minHeight: reserved ? undefined : 90,
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
  // Fixed-size ads cap their width and honor the aspect ratio (no crop);
  // responsive ads stretch to the container at natural height.
  const mediaStyle = dim
    ? { aspectRatio: `${dim.w} / ${dim.h}` }
    : undefined;
  // Merge the rotation fade into the outer style.
  const outerStyle = {
    ...(dim ? { maxWidth: dim.w } : {}),
    opacity: fading ? 0 : 1,
    transition: "opacity 180ms ease",
  } as const;

  // HTML / AdSense / GAM creative — runs inside the shared sandboxed iframe so
  // injected <script> actually executes (dangerouslySetInnerHTML never does).
  if (
    (ad.type === "HTML" || ad.type === "ADSENSE" || ad.type === "GAM") &&
    ad.html
  ) {
    return (
      <div className={cn("mx-auto", className)} style={outerStyle}>
        <SandboxedAdFrame
          html={ad.html}
          height={dim?.h ?? 250}
          impressionPixel={ad.impressionPixel}
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
