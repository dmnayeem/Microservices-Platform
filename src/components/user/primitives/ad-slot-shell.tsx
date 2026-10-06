"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { measureAdSlot } from "@/lib/ad-measure-client";

/**
 * THE wrapper every rendered ad mounts inside — banner, strip, card, network
 * slot, HTML frame, native feed card, interstitial, page script.
 *
 * It exists so measurement has exactly one place to attach. Viewable-impression
 * counting, click validation and bot filtering all need the same four facts
 * about an ad on screen — which ad, which space, which instance, which network
 * — and the same DOM node to observe. Spreading that across the five layouts in
 * `AdRenderer`, the feed card and the overlays would guarantee one of them is
 * forgotten. So they all render through here, and tracking subscribes here.
 *
 * ## Hook for the measurement layer
 *
 *     import { registerAdSlotTracker } from "@/components/user/primitives/ad-slot-shell";
 *     registerAdSlotTracker((el, info) => {
 *       // attach IntersectionObserver / click validation to `el`
 *       return () => { /* detach *\/ };
 *     });
 *
 * Trackers registered before or after a slot mounts both see it. Each slot
 * also carries `data-ad-*` attributes so a DOM-level script can find it.
 *
 * Real measurement (src/lib/ad-measure-client.ts) is registered here on the
 * first mount: viewable impressions, estimated third-party clicks and page
 * script executions are all counted from this node, against the serve token
 * `st`. A slot without a token is never counted.
 */

export interface AdSlotInfo {
  adId: string;
  placement: string;
  /** Distinguishes two instances of the same space on one page. */
  slotKey: string;
  /** "adsense" | "gam" | registry network id | "own" (LOCAL / untagged HTML). */
  network: string;
  /** Ad type as served (LOCAL / HTML / ADSENSE / GAM / NATIVE / PAGE_SCRIPT). */
  type?: string;
  /** Serve token, when the delivery carried one (billable click proof). */
  st?: string;
}

export type AdSlotTracker = (
  el: HTMLElement,
  info: AdSlotInfo
) => void | (() => void);

type Mounted = { el: HTMLElement; info: AdSlotInfo; cleanups: Map<AdSlotTracker, () => void> };

const trackers = new Set<AdSlotTracker>();
const mounted = new Set<Mounted>();
let measurementRegistered = false;

function attach(m: Mounted, t: AdSlotTracker) {
  try {
    const c = t(m.el, m.info);
    if (typeof c === "function") m.cleanups.set(t, c);
  } catch {
    /* a tracker must never break an ad */
  }
}

/** Subscribe a tracker to every ad slot, present and future. Returns an unsubscribe. */
export function registerAdSlotTracker(t: AdSlotTracker): () => void {
  trackers.add(t);
  for (const m of mounted) attach(m, t);
  return () => {
    trackers.delete(t);
    for (const m of mounted) {
      const c = m.cleanups.get(t);
      m.cleanups.delete(t);
      try {
        c?.();
      } catch {
        /* ignore */
      }
    }
  };
}

/** Map a served ad to the network label the shell carries. */
export function adNetworkLabel(ad: { type?: string; networkId?: string | null }): string {
  if (ad.type === "ADSENSE") return "adsense";
  if (ad.type === "GAM") return "gam";
  if (ad.type === "HTML" && ad.networkId) return ad.networkId;
  return "own";
}

export function AdSlotShell({
  info,
  className,
  style,
  children,
}: {
  info: AdSlotInfo;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { adId, placement, slotKey, network, type, st } = info;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!measurementRegistered) {
      measurementRegistered = true;
      registerAdSlotTracker(measureAdSlot);
    }
    const m: Mounted = {
      el,
      info: { adId, placement, slotKey, network, type, st },
      cleanups: new Map(),
    };
    mounted.add(m);
    for (const t of trackers) attach(m, t);
    return () => {
      mounted.delete(m);
      for (const c of m.cleanups.values()) {
        try {
          c();
        } catch {
          /* ignore */
        }
      }
    };
  }, [adId, placement, slotKey, network, type, st]);

  return (
    <div
      ref={ref}
      className={cn("ad-slot-shell", className)}
      style={style}
      data-ad-id={adId}
      data-ad-placement={placement}
      data-ad-slot-key={slotKey}
      data-ad-network={network}
      data-ad-type={type}
    >
      {children}
    </div>
  );
}
