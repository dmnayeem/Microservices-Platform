"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { hasMarketingConsent } from "@/lib/ad-consent";
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
 * Two things this has to survive that a plain snippet does not: React mounting
 * the component twice in development, and client-side navigation re-mounting it.
 * Pushing an `<ins>` twice or defining the same GPT slot twice both break the
 * slot, so each is guarded and GPT slots are destroyed on unmount.
 */

declare global {
  interface Window {
    adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number };
    googletag?: {
      cmd: Array<() => void>;
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
  const reactId = useId();
  // GPT needs a DOM id that is a valid, stable identifier. `useId` contains
  // colons, which are legal in an id attribute but awkward for GPT's lookups.
  const domId = `gpt-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const doneRef = useRef(false);
  const unfilledRef = useRef(onUnfilled);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    unfilledRef.current = onUnfilled;
  });

  useEffect(() => {
    // Guard: never initialise the same element twice. React double-mounts in
    // development, and a re-render must not re-push a filled slot.
    if (doneRef.current) return;
    doneRef.current = true;

    const personalised = hasMarketingConsent();

    // A failure is reported on the next microtask rather than inline. Pushing to
    // `adsbygoogle` throws synchronously when the script is blocked or absent,
    // and setting state in the effect body would make that a cascading render
    // during mount. The GPT paths below are already asynchronous.
    const fail = () => {
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
        arr.push({});
      } catch {
        fail();
      }
      return;
    }

    // ── Ad Manager (GPT) ─────────────────────────────────────────────────────
    const w = window;
    w.googletag = w.googletag || { cmd: [] };
    let slot: GptSlot | null = null;

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
        // An empty render is a real outcome, not an error — the caller fills it
        // with its own inventory rather than leaving a gap.
        g.pubads?.().addEventListener("slotRenderEnded", (e) => {
          if (e.slot?.getSlotElementId?.() === domId && e.isEmpty) {
            fail();
          }
        });
        g.enableServices?.();
        g.display?.(domId);
      } catch {
        fail();
      }
    });

    return () => {
      // Without this, navigating away and back re-defines the same slot id and
      // GPT silently stops filling it.
      try {
        if (slot) w.googletag?.destroySlots?.([slot]);
      } catch {
        /* GPT not loaded, or already torn down */
      }
    };
  }, [config, domId]);

  // AdSense reports an unsold unit by stamping the <ins> with
  // data-ad-status="unfilled". There is no callback, so it is observed.
  useEffect(() => {
    if (config.kind !== "ADSENSE") return;
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
  }, [config.kind]);

  // Collapse rather than leave a hole; the caller renders its fallback instead.
  if (failed) return null;

  if (config.kind === "ADSENSE") {
    return (
      <div ref={hostRef} className={cn("mx-auto w-full", className)}>
        <ins
          className="adsbygoogle"
          style={{
            display: "block",
            width: "100%",
            // The space's ceiling applies to Google's creative exactly as it
            // does to our own — a network unit must not be able to take over
            // the page either.
            maxHeight: maxHeightPx,
          }}
          data-ad-client={config.client}
          data-ad-slot={config.slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
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
          maxWidth: "100%",
          margin: "0 auto",
        }}
      />
    </div>
  );
}
