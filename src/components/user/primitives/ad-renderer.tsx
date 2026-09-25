"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ExternalLink, MoreVertical, X } from "lucide-react";
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
  /**
   * Optional brand mark, already first-party proxied by the server
   * (`/api/spaces/media/[id]?f=logo`, the same shape `/api/ads/feed` returns).
   * The panel payload does not carry it today; when it starts to, the round
   * avatar below the creative picks it up with no change here. Until then the
   * monogram stands in — deliberately CSS, because a placeholder image would be
   * a second network request on 27 placements.
   */
  logoUrl?: string;
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

/**
 * The floor on how often a slot may re-ask for a creative, in ms.
 *
 * A dev-server capture of 973 requests found `/api/spaces/panel` was 398 of
 * them — 41% of everything the app asks for, and 185s of 400s of render time —
 * from roughly seven mounted slots each rotating every ~12s. Each of those also
 * costs one `RateLimitHit` upsert, which is how that table became the largest
 * on the platform.
 *
 * This is a CLIENT floor over the server's `rotateMs`, not a change to it: the
 * per-space `rotateSeconds` an admin sets is still the setting, and a space
 * configured slower than this keeps its own value. Nobody perceives a banner
 * changing every 25s rather than every 12s, and the slower cadence gives each
 * impression a longer chance of being seen instead of scrolled past.
 */
const MIN_ROTATE_MS = 25_000;

/* ── Presentation pieces shared by the three layouts ────────────────────────
   All of these are pure string work on the payload that is already on screen.
   None of them fetches anything: the renderer is mounted on 27 spaces and a
   single extra request per render would be 27 extra requests per page view. */

/** The brand pill, same family, one step lighter because it carries less text. */
const CHIP_BG = "rgba(8,9,14,0.78)";

/** Hostname of a destination, for when the payload carries no brand name. */
function hostOf(u?: string): string | null {
  if (!u) return null;
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Who is paying for this. Falls back to the destination, then to "Sponsored". */
function brandOf(ad: AdResponse): string {
  return ad.sponsor?.trim() || hostOf(ad.ctaUrl) || "Sponsored";
}

/** One letter for the monogram avatar / chip mark. */
function monogramOf(label: string): string {
  return (label.trim().charAt(0) || "S").toUpperCase();
}

/**
 * Split a headline so the LAST word can take the accent colour, which is the
 * shape of the reference. A single-word headline keeps its whole self in the
 * accent rather than losing the effect.
 */
function splitHeadline(title?: string): { lead: string; accent: string } {
  const t = (title ?? "").trim();
  if (!t) return { lead: "", accent: "" };
  const i = t.lastIndexOf(" ");
  if (i <= 0) return { lead: "", accent: t };
  return { lead: t.slice(0, i), accent: t.slice(i + 1) };
}

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
  // A strip-space image that is itself a whole banner (≥ 3:1 — a 728×90 or
  // 320×50 creative with its own headline and button baked in). Keyed by ad
  // id, because the slot rotates and the next creative may not be one.
  const [bannerImg, setBannerImg] = useState<{ id: string; w: number; h: number } | null>(null);
  // The ⋮ affordance on the card layout. Deliberately NOT a navigation control:
  // it never opens the destination and never records a click, which is why it is
  // drawn as a grey glyph and not as a button.
  const [menuOpen, setMenuOpen] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  // Reserve space during the first fetch (no SSR ad) so the slot doesn't jump.
  const [loading, setLoading] = useState(!initialAd);
  // Rotation interval (ms) reported by the server; 0 = don't auto-rotate
  // (single-ad space or ad-free viewer). Seeded from the SSR value when present.
  // The SSR seed takes the same floor as the fetched value; otherwise an
  // SSR-injected slot would keep the old 12s cadence for its whole life.
  const rotateMsRef = useRef(
    initialRotateMs > 0 ? Math.max(initialRotateMs, MIN_ROTATE_MS) : 0
  );
  // Is this slot actually on screen? Rotation is gated on it.
  //
  // Starts true so nothing is suppressed before the observer has reported; the
  // callback fires on observe, so an off-screen slot corrects itself in the
  // first frame. The FIRST load is deliberately NOT gated — every mounted slot
  // still fetches once and counts exactly the one impression it always did.
  // Only rotations are gated, and a rotation for a slot nobody could see was an
  // impression billed to an advertiser for a creative that was never on screen.
  const onScreenRef = useRef(true);
  const ioRef = useRef<IntersectionObserver | null>(null);
  /**
   * Ref callback on whichever root this render produced (there are five). A
   * callback rather than an effect because the root ELEMENT changes when the ad
   * type changes and when the skeleton is replaced by the real card — an effect
   * keyed on the usual deps would keep observing a node that had been thrown
   * away.
   */
  const attachRoot = useCallback((el: HTMLElement | null) => {
    ioRef.current?.disconnect();
    ioRef.current = null;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        onScreenRef.current = entries.some((e) => e.isIntersecting);
      },
      { threshold: 0 }
    );
    io.observe(el);
    ioRef.current = io;
  }, []);
  useEffect(() => () => ioRef.current?.disconnect(), []);

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
            ? Math.max(data.rotateMs, MIN_ROTATE_MS)
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
        // Three gates, all cheap, all checked at fire time rather than at
        // schedule time: a backgrounded tab, and a slot scrolled out of view,
        // both stop asking. Neither changes HOW an impression is recorded —
        // they stop asking for creatives nobody is looking at.
        if (document.hidden || !onScreenRef.current) return;
        void loadAd({ rotate: true });
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
      } else if (onScreenRef.current) {
        // Only a slot that is actually in view refetches on return. This used
        // to fire for every mounted slot on every tab focus — seven requests
        // (and seven rate-limit upserts) for one glance at the tab bar.
        void loadAd({ rotate: true }).then(() => !cancelled && startTimer());
      } else {
        startTimer();
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
    const placeSpec = placementSpec(placement);
    const cap = placeSpec.maxHeightPx;
    return (
      <div
        className={cn(
          "rounded-2xl border border-(--app-line) bg-(--app-surface)/40 animate-pulse mx-auto",
          className
        )}
        style={{
          aspectRatio: reserved ? `${reserved.w} / ${reserved.h}` : undefined,
          // Same rule as the loaded ad: a `fillsColumn` space reserves the
          // column, not the preset width. Reserving 300px and then landing a
          // 408px card is exactly the layout jump this skeleton exists to
          // prevent.
          maxWidth: placeSpec.fillsColumn ? undefined : reserved?.w,
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
  //
  // The ratio is ALWAYS set, which it was not before.
  //
  // `Ad.size` defaults to "responsive" and 43 rows resolve to no dimensions at
  // all, so `dim` is null for them and the media rendered `h-auto`: the box was
  // whatever the creative turned out to be, discovered only once the bytes
  // arrived, and everything under it moved. The fallback walks down to the
  // space's own preset and then to 16/9, so a creative that says nothing about
  // itself still reserves a box before it loads. `object-contain` (below) keeps
  // it whole inside that box rather than cropping it to fit.
  // Reserve the space, but only SHAPE it when the creative told us its shape.
  //
  // Two true things pull opposite ways here, and both were fixed once:
  //
  //  - A creative that declares no size used to render `h-auto`, so the box was
  //    whatever the bytes turned out to be and everything under it jumped.
  //  - Forcing the SLOT's ratio onto such a creative is the older bug: a
  //    600x200 image inside a 728x90 box gets contained down to ~270px wide —
  //    smaller than it was before anyone tried to help.
  //
  // So: the creative's own ratio when it has one, and otherwise a `minHeight`
  // instead. Height is all that is needed to stop the jump; constraining the
  // WIDTH as well is what shrank the creative, and a min-height reserves the
  // row without deciding anything about the shape of a picture we have not
  // seen yet. Capped by the space's own ceiling so the reservation can never
  // be taller than the thing it reserves for.
  // NO forced aspect ratio, in either branch.
  //
  // A box plus `object-contain` letterboxes: the creative sits in the middle
  // and the rest is a dark slab. That is what the owner saw as "black bars", and
  // it happens to almost every creative, because almost none matches the shape
  // we picked for it. Even the creative's OWN ratio is not worth forcing — it
  // only ever equals what the image would do by itself.
  //
  // So the image sets its own height (`h-auto`) and `minHeight` reserves the row
  // so nothing jumps while the bytes are in flight. Reserving height does not
  // decide shape, which is the entire difference between the two.
  const mediaStyle: React.CSSProperties = {
    minHeight: Math.min(
      spec.maxHeightPx,
      dim
        ? Math.round(spec.maxHeightPx * 0.5)
        : slotDim
          ? slotDim.h
          : Math.round(spec.maxHeightPx * 0.75)
    ),
    maxHeight: spec.maxHeightPx,
  };
  // A STRIP space is one that is meant to be a thin bar, not a card.
  //
  // Capping the media alone is right for a card, and wrong for these: a LOCAL
  // creative stacks its title/body/CTA block underneath, so `ANCHOR_BOTTOM` —
  // specced at 64px — measured **138px** in the browser. That bar is fixed to
  // the bottom of every screen and `<main>` reserves its height as padding on
  // every page, so the overflow was charged to the whole app, and it took 74px
  // off the social rail's scrolling window.
  //
  // Derived from the ceiling rather than a second hand-kept list of names, so a
  // new thin placement gets the strip layout automatically: ANCHOR_BOTTOM (64),
  // VIDEO_OVERLAY (72) and FEED_POST_BELOW (72) qualify; the leaderboard (120)
  // and rectangle (300) spaces keep the stacked card.
  const isStrip = spec.maxHeightPx <= 96;
  // A BANNER space is one that is tall enough to show a creative but not tall
  // enough to carry the full card underneath it.
  //
  // The reference card is creative + description + brand line + two buttons.
  // Under the rule this file has always used — the ceiling bounds the MEDIA,
  // the chrome stacks below it — putting that card on a 120px leaderboard space
  // would land a ~280px block on the top of sixteen pages. So these spaces get
  // the half of the reference that is free: the creative itself, with the brand
  // chip, the accented headline and the arrow overlaid ON it. Same language, no
  // extra height. Derived from the ceiling rather than a second list of names,
  // exactly like `isStrip`, so a new space picks its layout up automatically.
  const isBanner = !isStrip && spec.maxHeightPx <= 160;

  const brand = brandOf(ad);
  const monogram = monogramOf(brand);
  const { lead, accent } = splitHeadline(ad.title);
  // Everything that navigates goes through this one anchor shape, so there is
  // exactly one place a click is recorded from and no control can drift out of
  // it. `ad.ctaUrl ?? "#"` is deliberately unchanged from before — the creative
  // has always been clickable whether or not the campaign supplied a
  // destination, and the billed event is the same event it has always been.
  const linkProps = {
    href: ad.ctaUrl ?? "#",
    target: "_blank",
    rel: "noopener sponsored noreferrer",
    onClick: trackClick,
  } as const;
  // The buttons, by contrast, are only drawn when there IS somewhere to go. A
  // pair of full-width buttons on a campaign with no destination would be two
  // controls that look like the primary action and navigate nowhere.
  const hasUrl = !!ad.ctaUrl;

  /** The creative itself. Same element in all three layouts, same ceiling. */
  const media = (cls: string) =>
    ad.videoUrl ? (
      <video
        src={ad.videoUrl}
        autoPlay
        muted
        loop
        playsInline
        className={cn("block h-auto w-full", cls)}
        style={mediaStyle}
      />
    ) : ad.imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={ad.imageUrl}
        alt={ad.title ?? "Ad"}
        className={cn("block h-auto w-full", cls)}
        style={mediaStyle}
      />
    ) : (
      // No creative at all — the accent surface plus the monogram, so the space
      // still reserves its box instead of collapsing to a hairline.
      <div
        className={cn("grid place-items-center", cls)}
        style={{ ...mediaStyle, backgroundImage: "var(--app-grad)" }}
      >
        <span className="t-figure text-white/90">{monogram}</span>
      </div>
    );

  /**
   * The brand chip + headline + arrow, laid over the lower part of the
   * creative. Every child is `pointer-events-none`: the whole overlay lives
   * inside the one anchor, so a tap on the headline or on the arrow is the same
   * recorded click as a tap on the creative. Nothing here is a second control.
   */
  /* The brand chip alone. The card layout wants the chip without the headline
     under it — that moved onto the brand row, where the reference has it. The
     banner layouts still take both together via `overlay`. */
  const brandChip = (
    <span
      className="on-media pointer-events-none absolute left-2 top-2 z-20 inline-flex max-w-[75%] items-center gap-1.5 rounded-full px-2 py-1"
      style={{ backgroundColor: CHIP_BG }}
    >
      <span className="app-on-white [--app-on-white-ink:#000] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white text-[9px] font-black">
        {monogram}
      </span>
      <span className="truncate text-[11px] font-semibold text-white">
        {brand}
      </span>
    </span>
  );


  const overlay = (big: boolean) => (
    <>
      <span
        className="on-media pointer-events-none absolute left-2 top-2 z-20 inline-flex max-w-[75%] items-center gap-1.5 rounded-full px-2 py-1 backdrop-blur-sm"
        style={{ backgroundColor: CHIP_BG }}
      >
        {/* Inside the `on-media` chip above, so the light-mode family rule
            would paint this monogram white on its white disc. */}
        <span className="app-on-white [--app-on-white-ink:#000] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white text-[9px] font-black">
          {monogram}
        </span>
        <span className="truncate text-[11px] font-semibold text-white">
          {brand}
        </span>
      </span>
      {/* The headline sits UNDER the creative, not on it.
          It used to be overlaid on a black gradient band, and that band is what
          the owner reported as a black shadow across every ad. Light text on an
          arbitrary photo always needs something darkened, so the text moved off
          the photo instead: no scrim, and the creative is shown whole. Still
          inside the same anchor, so a tap is the same recorded click. */}
      {(lead || accent) && (
        <span className="flex items-center gap-2 px-4 pt-2.5 pb-1">
          <span
            className={cn(
              "min-w-0 flex-1 font-extrabold leading-tight text-(--app-ink)",
              big ? "text-lg line-clamp-2" : "text-sm line-clamp-1"
            )}
          >
            {lead}
            {accent ? (
              <span className="text-(--app-accent-ink)">
                {lead ? " " : ""}
                {accent}
              </span>
            ) : null}
          </span>
          {hasUrl ? (
            <span
              className={cn(
                "app-accent grid shrink-0 place-items-center rounded-full",
                big ? "h-11 w-11" : "h-9 w-9"
              )}
            >
              <ArrowUpRight className={big ? "h-5 w-5" : "h-4 w-4"} />
            </span>
          ) : null}
        </span>
      )}
    </>
  );
  // Merge the rotation fade into the outer style.
  const outerStyle = {
    // `fillsColumn` spaces skip the width cap — see the note on PlacementSpec.
    // In the feed rail the cap made the ad narrower than every widget beneath
    // it, which is the opposite of what the cap is for.
    ...(slotDim && !spec.fillsColumn ? { maxWidth: slotDim.w } : {}),
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
      <div ref={attachRoot} className={cn("relative mx-auto", className)} style={outerStyle}>
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
      <div ref={attachRoot} className={cn("relative mx-auto", className)} style={outerStyle}>
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

  // ── Strip layout ───────────────────────────────────────────────────────────
  // A thin bar, laid out ACROSS instead of stacked, and capped as a whole.
  //
  // The stacked card below puts the media above a title/body/CTA block, so its
  // real height is `maxHeightPx` PLUS that block — which is how a 64px anchor
  // space became a 138px bar pinned to the bottom of every screen. Here the
  // media sits beside the text and `maxHeight` bounds the card itself, so the
  // space's ceiling is the height the user actually sees.
  // A banner creative in a strip space is shown AS a banner: the image is the
  // whole ad. Laid out as a strip it was squeezed into the same row as a title
  // column and a CTA chip — on the anchor a 728×90 creative took the full
  // 320px card, the title column got 0px, the "See plans" chip overflowed out
  // of the card, and a dark band sat under an image 39px tall in a 56px card.
  // Sized from the image's own shape: as wide as the space's height ceiling
  // allows, and never wider than the column.
  if (isStrip && ad.imageUrl && !ad.videoUrl && bannerImg?.id === ad.id) {
    return (
      <a
        ref={attachRoot}
        {...linkProps}
        style={{
          ...outerStyle,
          maxWidth: Math.min(bannerImg.w, Math.round((spec.maxHeightPx * bannerImg.w) / bannerImg.h)),
        }}
        className={cn(
          "app-press group relative mx-auto block w-full overflow-hidden",
          "rounded-(--app-r-control) border border-(--app-line) hover:border-(--app-accent-edge)",
          className
        )}
      >
        {ad.impressionPixel ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.impressionPixel} alt="" width={1} height={1} className="absolute bottom-0 right-0 opacity-0 pointer-events-none" />
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ad.imageUrl} alt={ad.title ?? "Ad"} className="block h-auto w-full" />
        {/* The disclosure the strip's text column used to carry. */}
        <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/55 px-1 text-[9px] font-semibold uppercase tracking-wide text-white/85">
          {brand && brand !== "Sponsored" ? `Ad · ${brand}` : "Ad"}
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
            className="absolute top-0.5 right-0.5 z-20 w-5 h-5 grid place-items-center rounded-full bg-black/60 backdrop-blur text-white/70 hover:text-white hover:bg-black/80"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </a>
    );
  }

  if (isStrip) {
    return (
      <a
        ref={attachRoot}
        {...linkProps}
        // `height`, not `maxHeight`: the media's `h-full` needs a DEFINITE
        // height to be a percentage of. Under a max-height alone it fell back
        // to the image's natural size — a 3:2 photo rendered 318×212 in a 72px
        // card, cropped, and took the whole width, so the title column got 0px
        // and the CTA was pushed out past the card's edge.
        style={{ ...outerStyle, height: spec.maxHeightPx }}
        className={cn(
          "app-tap-row app-press group relative mx-auto flex items-stretch gap-3 overflow-hidden",
          "rounded-(--app-r-control) border border-(--app-line) bg-(--app-surface)",
          "hover:border-(--app-accent-edge)",
          className
        )}
      >
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
            className="h-full w-auto max-w-[45%] shrink-0 object-cover"
          />
        ) : (
          ad.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ad.imageUrl}
              alt={ad.title ?? "Ad"}
              className="h-full w-auto max-w-[45%] shrink-0 object-cover"
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (h > 0 && w / h >= 3) setBannerImg({ id: ad.id, w, h });
              }}
            />
          )
        )}
        <div className="min-w-0 flex-1 self-center py-1.5">
          {ad.title && (
            <p className="t-card-title truncate text-(--app-ink)">
              {lead}
              {accent ? (
                <span style={{ color: "var(--app-rail-a)" }}>
                  {lead ? " " : ""}
                  {accent}
                </span>
              ) : null}
            </p>
          )}
          <p className="t-meta truncate text-(--app-ink-3)">Sponsored · {brand}</p>
        </div>
        <span className="app-accent-soft mr-2 inline-flex shrink-0 items-center gap-1 self-center rounded-(--app-r-chip) px-2.5 py-1 text-[11px] font-bold">
          {ad.ctaLabel || "Learn More"}
          <ExternalLink className="h-3 w-3" />
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
            className="absolute top-0.5 right-0.5 z-20 w-5 h-5 grid place-items-center rounded-full bg-black/60 backdrop-blur text-white/70 hover:text-white hover:bg-black/80"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </a>
    );
  }

  // The 1×1 third-party impression pixel. Unchanged: same element, same
  // position, same zero-opacity, still fired by being in the document.
  const pixel = ad.impressionPixel ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ad.impressionPixel}
      alt=""
      width={1}
      height={1}
      className="pointer-events-none absolute bottom-0 right-0 opacity-0"
    />
  ) : null;

  // 44px of hit area, 28px of paint. `app-tap` is written on the button itself,
  // not on a child selector: the thing the finger has to find is the button,
  // not the glyph inside it.
  const hideButton = dismissible ? (
    <button
      type="button"
      aria-label="Hide ad"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDismissed(true);
      }}
      className="app-tap absolute right-0 top-0 z-30 grid place-items-center"
    >
      <span className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white/80 backdrop-blur-sm hover:bg-black/80 hover:text-white">
        <X className="h-3.5 w-3.5" />
      </span>
    </button>
  ) : null;

  // ── Banner layout ──────────────────────────────────────────────────────────
  // The creative, with the chip / headline / arrow laid over it. One anchor, so
  // every pixel of it is the same recorded click.
  if (isBanner) {
    return (
      <a
        ref={attachRoot}
        {...linkProps}
        style={outerStyle}
        className={cn(
          "app-press group relative mx-auto block overflow-hidden",
          "rounded-(--app-r-card) border border-(--app-line) bg-(--app-surface)",
          "hover:border-(--app-accent-edge)",
          className
        )}
      >
        {pixel}
        {media("w-full")}
        {overlay(false)}
        {hideButton}
      </a>
    );
  }

  // ── Card layout ────────────────────────────────────────────────────────────
  // The full reference shape, for the spaces with the height to carry it
  // (everything on RECTANGLE_SPEC: Task Complete, Profile, Feed Sidebar, Browse
  // & Earn). Creative + overlay on top, then the brand row, the Sponsored line
  // and the two buttons.
  //
  // This is an <article>, not one giant <a>: the buttons and the ⋮ are real
  // elements and nesting them inside an anchor is invalid HTML that browsers
  // reflow into something none of this markup describes. The creative keeps its
  // own anchor, and the buttons carry the same one.
  return (
    <article
      ref={attachRoot}
      style={outerStyle}
      className={cn(
        "app-card relative mx-auto overflow-hidden p-0",
        className
      )}
    >
      {pixel}
      <a
        {...linkProps}
        className="app-press group relative block"
        aria-label={ad.title ? `${ad.title} — ${brand}` : `Open ${brand}`}
      >
        {media("w-full")}
        {/* Only the brand chip here. The headline belongs on the row below,
            beside the avatar, which is where the reference puts it — and a
            circular arrow the size of a button, above two actual buttons,
            reads as a third action that does something different. */}
        {brandChip}
      </a>
      {hideButton}

      <div className="p-4">
        <div className="flex items-start gap-3">
          {ad.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ad.logoUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black text-white"
              style={{ backgroundImage: "var(--app-grad)" }}
            >
              {monogram}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="t-card-title line-clamp-2 min-w-0 text-(--app-ink)">
                {lead}
                {accent ? (
                  <span className="text-(--app-accent-ink)">
                    {lead ? " " : ""}
                    {accent}
                  </span>
                ) : null}
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-(--app-ink-3)" />
            </span>
            <span className="t-meta mt-0.5 block truncate text-(--app-ink-3)">
              Sponsored · {brand}
            </span>
          </span>
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
                  {/* Hiding is offered only where the space already allows it.
                      On Browse & Earn the viewer is being PAID per rotation, so
                      a hide control there would break the loop it belongs to. */}
                  {dismissible && (
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
                  )}
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

        {ad.body && (
          <p className="t-body mt-2 line-clamp-2 text-(--app-ink-2)">{ad.body}</p>
        )}
        {showWhy && (
          <p className="t-meta mt-1 text-(--app-ink-3)">
            Ads like this keep the platform free to use.
          </p>
        )}

        {/* Two full-width buttons, and BOTH of them bill.
            The reference reads "Watch" and "Visit site". "Watch" there is a
            rewarded-video play, which ships off — and a button that looks like
            the primary action while recording nothing is worse than one button,
            so the secondary carries the advertiser's own CTA label and opens the
            same destination through the same handler. Two labels, one billed
            event each, no decoration. */}
        {hasUrl && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              {...linkProps}
              className="app-tap-row app-press flex items-center justify-center rounded-(--app-r-control) border border-(--app-line) bg-(--app-surface-2) px-3 text-center text-sm font-bold text-(--app-ink)"
            >
              {ad.ctaLabel || "Learn More"}
            </a>
            <a
              {...linkProps}
              className="app-tap-row app-press flex items-center justify-center gap-1.5 rounded-(--app-r-control) bg-(--app-cta) px-3 text-sm font-bold text-(--app-on-cta)"
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
