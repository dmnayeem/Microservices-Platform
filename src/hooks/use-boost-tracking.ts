"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Counts a sponsored (boosted) post in the feed — the browser half of
 * POST /api/boost/event.
 *
 *  - IMPRESSION when the card is rendered;
 *  - VIEW when ≥50% of it is on screen for ≥1 continuous second while the tab
 *    is visible — the same IAB rule the ad measurement uses
 *    (src/lib/ad-measure-client.ts);
 *  - CLICK when the member opens the post or its link (call `trackClick`).
 *
 * Usage on the post card (pass the post's `boostCampaignId`, null when the
 * post is not sponsored — the hook then does nothing):
 *
 *   const boost = useBoostTracking(post.sponsored ? post.boostCampaignId : null);
 *   <article ref={boost.ref}> … </article>
 *   …and `boost.trackClick()` in the handlers that open the post (permalink,
 *   "see more", image viewer) or follow its link / link-preview card — not on
 *   like / comment / share, which their API routes charge themselves.
 *
 * The server dedupes and decides the price; this only reports. Each event is
 * sent once per page load per campaign, so a re-render or a remount while
 * scrolling does not resend it.
 */

type Kind = "IMPRESSION" | "VIEW" | "CLICK";

const sent = new Set<string>();

function send(campaignId: string, kind: Kind) {
  const key = `${campaignId}:${kind}`;
  if (sent.has(key)) return;
  sent.add(key);
  const body = JSON.stringify({ campaignId, kind });
  try {
    // sendBeacon survives the navigation a CLICK usually starts.
    if (navigator.sendBeacon?.("/api/boost/event", new Blob([body], { type: "text/plain;charset=UTF-8" }))) return;
  } catch {
    /* fall through */
  }
  try {
    void fetch("/api/boost/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    /* tracking must never break the feed */
  }
}

const VIEW_RATIO = 0.5;
const VIEW_MS = 1000;

export function useBoostTracking(campaignId: string | null | undefined) {
  // A callback ref kept in state, so the observer attaches whenever the card's
  // element appears (it may render after a loading state).
  const [el, setEl] = useState<HTMLElement | null>(null);
  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);

  useEffect(() => {
    if (campaignId) send(campaignId, "IMPRESSION");
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId || !el || typeof IntersectionObserver === "undefined") return;
    if (sent.has(`${campaignId}:VIEW`)) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inView = false;
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const arm = () => {
      if (timer || !inView || document.visibilityState !== "visible") return;
      timer = setTimeout(() => {
        timer = null;
        if (inView && document.visibilityState === "visible") {
          send(campaignId, "VIEW");
          io.disconnect();
          document.removeEventListener("visibilitychange", onVis);
        }
      }, VIEW_MS);
    };
    const onVis = () => (document.visibilityState === "visible" ? arm() : stop());
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // A post taller than the screen can never be 50% visible; for those,
          // filling half the viewport counts (the ad rule's large-unit idea).
          inView =
            e.isIntersecting &&
            (e.intersectionRatio >= VIEW_RATIO || e.intersectionRect.height >= window.innerHeight * VIEW_RATIO);
          if (inView) arm();
          else stop();
        }
      },
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1] }
    );
    io.observe(el);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [campaignId, el]);

  const trackClick = useCallback(() => {
    if (campaignId) send(campaignId, "CLICK");
  }, [campaignId]);

  return { ref, trackClick };
}
