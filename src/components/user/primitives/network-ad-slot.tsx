"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { hasMarketingConsent } from "@/lib/ad-consent";
import { isIncentivisedPath } from "@/lib/ad-placements";
import type { NetworkSlotConfig } from "@/lib/ad-network";

/**
 * A real, in-page Google ad slot — AdSense `<ins>` or an Ad Manager GPT div.
 *
 * These used to be composed into a self-contained HTML document on the server
 * and rendered inside a sandboxed iframe, which meant every slot on a page
 * loaded its own copy of `adsbygoogle.js` / `gpt.js`. That under-fills, rules out
 * anchor and vignette formats, and is not how Google expects its tag to be
 * deployed. The script now loads once from the root layout (see
 * `network-scripts.tsx`) and this renders against it.
 *
 * Things this has to survive that a plain snippet does not:
 *
 *  - React mounting the component twice in development, and client-side
 *    navigation re-mounting it. Pushing an `<ins>` twice or defining the same
 *    GPT slot twice both break the slot, so each is guarded — and the guard is
 *    RESET on unmount, so a remount (new ad id, `key` changed) initialises.
 *  - **An incentivised route.** This refuses to render at all on a page that
 *    pays the user, whatever the server sent. The server already refuses to
 *    serve Google into those spaces; this is the second lock.
 *  - **No fill / no script.** AdSense has no callback. If the unit has not
 *    been processed (`data-adsbygoogle-status`) or reports
 *    `data-ad-status="unfilled"` within ~3s, the slot gives up and the caller
 *    shows its own inventory. GPT reports emptiness through ONE page-level
 *    `slotRenderEnded` listener, and a GPT that never loads times out the same
 *    way.
 */

declare global {
  interface Window {
    adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number; loaded?: boolean };
    googletag?: {
      cmd: Array<() => void>;
      apiReady?: boolean;
      defineSlot?: (
        path: string,
        size: [number, number],
        divId: string
      ) => GptSlot | null;
      pubads?: () => GptPubAds;
      enableServices?: () => void;
      display?: (divId: string) => void;
      destroySlots?: (slots: GptSlot[]) => boolean;
    };
  }
}

interface GptSlot {
  addService: (svc: unknown) => GptSlot;
  getSlotElementId: () => string;
}
interface GptPubAds {
  addEventListener: (
    ev: string,
    cb: (e: { slot: GptSlot; isEmpty: boolean }) => void
  ) => void;
  setPrivacySettings?: (s: { nonPersonalizedAds?: boolean }) => void;
  refresh?: (slots: GptSlot[]) => void;
}

/** How long a unit may stay unprocessed / unfilled before the house fallback. */
const FILL_TIMEOUT_MS = 3000;

/* ── GPT page-level state ────────────────────────────────────────────────────
 * One `slotRenderEnded` listener for the whole page, and `enableServices()`
 * exactly once. Each slot used to add its own listener (N slots → N listeners,
 * each firing for every slot, and never removed) and call enableServices again.
 */
const gptEmptyHandlers = new Map<string, () => void>();
let gptListenerAdded = false;
let gptServicesEnabled = false;

function ensureGptPageSetup(g: NonNullable<Window["googletag"]>) {
  const pubads = g.pubads?.();
  if (!pubads) return;
  if (!gptListenerAdded) {
    gptListenerAdded = true;
    pubads.addEventListener("slotRenderEnded", (e) => {
      const id = e.slot?.getSlotElementId?.();
      if (!id) return;
      const h = gptEmptyHandlers.get(id);
      if (h && e.isEmpty) h();
    });
  }
  if (!gptServicesEnabled) {
    gptServicesEnabled = true;
    g.enableServices?.();
  }
}

/**
 * Fixed-size AdSense units, chosen from the space and the viewport.
 *
 * `data-ad-format="auto"` let Google pick a unit size, and in a capped space it
 * regularly picked one taller than the cap — which the cap then CLIPPED. A
 * clipped Google ad is a policy problem, and in the anchor bar the responsive
 * `<ins>` (width:100%) inside a shrink-wrapped container measured 0px wide and
 * never filled at all. A fixed size fits the space by construction and
 * reserves its box before the ad arrives.
 */
function adsenseUnitSize(maxHeightPx: number, viewportW: number): { w: number; h: number } {
  const wide = viewportW >= 768;
  if (maxHeightPx <= 96) return wide ? { w: 468, h: 60 } : { w: 320, h: 50 };
  if (maxHeightPx <= 160) return wide ? { w: 728, h: 90 } : { w: 320, h: 100 };
  return { w: 300, h: 250 };
}

export function NetworkAdSlot({
  config,
  maxHeightPx,
  className,
  /** Called when Google returns no ad, so the caller can show its own creative. */
  onUnfilled,
}: {
  config: NetworkSlotConfig;
  maxHeightPx: number;
  className?: string;
  onUnfilled?: () => void;
}) {
  const pathname = usePathname() ?? "";
  const blocked = isIncentivisedPath(pathname);
  const reactId = useId();
  // GPT needs a DOM id that is a valid, stable identifier. `useId` contains
  // colons, which are legal in an id attribute but awkward for GPT's lookups.
  const domId = `gpt-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const doneRef = useRef(false);
  const unfilledRef = useRef(onUnfilled);
  const [failed, setFailed] = useState(false);
  // AdSense unit size depends on the viewport, unknown during SSR. Null until
  // mounted; the reserved box below keeps the space while it is null.
  const [unit, setUnit] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    unfilledRef.current = onUnfilled;
  });

  useEffect(() => {
    if (config.kind !== "ADSENSE") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnit(adsenseUnitSize(maxHeightPx, window.innerWidth));
  }, [config.kind, maxHeightPx]);

  // Refuse on incentivised routes — and hand the space back to own inventory.
  useEffect(() => {
    if (!blocked) return;
    queueMicrotask(() => {
      setFailed(true);
      unfilledRef.current?.();
    });
  }, [blocked]);

  useEffect(() => {
    if (blocked) return;
    if (config.kind === "ADSENSE" && !unit) return;
    // Guard: never initialise the same element twice. React double-mounts in
    // development, and a re-render must not re-push a filled slot.
    if (doneRef.current) return;
    doneRef.current = true;

    const personalised = hasMarketingConsent();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // A failure is reported on the next microtask rather than inline. Pushing to
    // `adsbygoogle` throws synchronously when the script is blocked or absent,
    // and setting state in the effect body would make that a cascading render
    // during mount. The GPT paths below are already asynchronous.
    const fail = () => {
      if (settled) return;
      settled = true;
      queueMicrotask(() => {
        setFailed(true);
        unfilledRef.current?.();
      });
    };

    if (config.kind === "ADSENSE") {
      try {
        const arr = (window.adsbygoogle = window.adsbygoogle || []);
        // Non-personalised until the visitor has actually consented to
        // marketing. Must be set before the first push to take effect.
        if (!personalised) arr.requestNonPersonalizedAds = 1;
        // An <ins> AdSense already took (dev double-mount) must not be pushed
        // again — that is the "already have ads" error.
        const ins = hostRef.current?.querySelector("ins.adsbygoogle");
        if (!ins?.hasAttribute("data-adsbygoogle-status")) arr.push({});
      } catch {
        fail();
      }
      // No callback exists, so check once the script has had its chance:
      // unprocessed (script missing / blocked) or explicitly unfilled → fall back.
      timer = setTimeout(() => {
        const el = hostRef.current?.querySelector("ins.adsbygoogle");
        if (!el) return;
        const processed = el.hasAttribute("data-adsbygoogle-status");
        const unfilled = el.getAttribute("data-ad-status") === "unfilled";
        if (!processed || unfilled) fail();
      }, FILL_TIMEOUT_MS);
      return () => {
        if (timer) clearTimeout(timer);
        // Reset so a genuine remount (new ad → new key) initialises again.
        doneRef.current = false;
        settled = true;
      };
    }

    // ── Ad Manager (GPT) ─────────────────────────────────────────────────────
    const w = window;
    w.googletag = w.googletag || { cmd: [] };
    let slot: GptSlot | null = null;
    gptEmptyHandlers.set(domId, fail);

    // gpt.js missing or blocked: `cmd` is a plain array that never drains.
    timer = setTimeout(() => {
      if (!w.googletag?.apiReady) fail();
    }, FILL_TIMEOUT_MS + 1000);

    w.googletag.cmd.push(() => {
      try {
        const g = w.googletag!;
        if (!personalised) {
          g.pubads?.().setPrivacySettings?.({ nonPersonalizedAds: true });
        }
        slot =
          g.defineSlot?.(
            config.unitPath!,
            [config.width ?? 300, config.height ?? 250],
            domId
          ) ?? null;
        if (!slot) {
          fail();
          return;
        }
        slot.addService(g.pubads!());
        ensureGptPageSetup(g);
        g.display?.(domId);
      } catch {
        fail();
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
      gptEmptyHandlers.delete(domId);
      doneRef.current = false;
      settled = true;
      // Without this, navigating away and back re-defines the same slot id and
      // GPT silently stops filling it.
      try {
        if (slot) w.googletag?.destroySlots?.([slot]);
      } catch {
        /* GPT not loaded, or already torn down */
      }
    };
  }, [config, domId, unit, blocked]);

  // AdSense reports an unsold unit by stamping the <ins> with
  // data-ad-status="unfilled". There is no callback, so it is observed.
  useEffect(() => {
    if (config.kind !== "ADSENSE" || !unit) return;
    const el = hostRef.current?.querySelector("ins.adsbygoogle");
    if (!el) return;
    const check = () => {
      if (el.getAttribute("data-ad-status") === "unfilled") {
        setFailed(true);
        unfilledRef.current?.();
      }
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(el, { attributes: true, attributeFilter: ["data-ad-status"] });
    return () => obs.disconnect();
  }, [config.kind, unit]);

  // Collapse rather than leave a hole; the caller renders its fallback instead.
  if (failed || blocked) return null;

  if (config.kind === "ADSENSE") {
    // Reserve the box before the unit size is known (SSR / first paint).
    const reserveH = Math.min(maxHeightPx <= 96 ? 50 : maxHeightPx <= 160 ? 90 : 250, maxHeightPx);
    return (
      <div
        ref={hostRef}
        className={cn("mx-auto", className)}
        style={{
          width: unit ? unit.w : undefined,
          maxWidth: "100%",
          minHeight: unit ? unit.h : reserveH,
        }}
      >
        {unit && (
          <ins
            className="adsbygoogle"
            style={{ display: "inline-block", width: unit.w, height: unit.h }}
            data-ad-client={config.client}
            data-ad-slot={config.slot}
          />
        )}
      </div>
    );
  }

  return (
    <div ref={hostRef} className={cn("mx-auto", className)}>
      <div
        id={domId}
        style={{
          width: config.width,
          height: Math.min(config.height ?? 250, maxHeightPx),
          minHeight: Math.min(config.height ?? 250, maxHeightPx),
          maxWidth: "100%",
          margin: "0 auto",
        }}
      />
    </div>
  );
}
