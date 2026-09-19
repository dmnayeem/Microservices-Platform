"use client";

import { useEffect } from "react";

/**
 * Hide the top and bottom chrome while the reader scrolls down, bring it back
 * the moment they scroll up — the behaviour every social app has, because a
 * phone screen spent on a header and a tab bar is screen not spent on the post.
 *
 * Driven by a data attribute on `<html>` rather than React state on purpose.
 * Scroll fires continuously, and re-rendering the feed's component tree on
 * every frame to move two bars would cost far more than the bars are worth.
 * The attribute flips at most twice per gesture and CSS does the moving, so
 * the work per scroll event is one comparison.
 *
 * The thresholds are what keep it from feeling broken:
 *
 *   TOLERANCE  a gesture has to actually be a direction. Without it, the
 *              one-pixel jitter of a finger resting on the glass, and the
 *              rubber-band at the end of a list, flap the bars continuously.
 *   REVEAL_AT  near the top the chrome is always shown. Scrolling up into the
 *              first screen and finding no header is disorienting, and it is
 *              also where the composer and filters live.
 *
 * Returns nothing: mount it on a page that wants the behaviour. It cleans the
 * attribute up on unmount, so navigating away from the feed can never strand
 * another page with its header hidden.
 */

export const TOLERANCE = 6;
export const REVEAL_AT = 80;

/**
 * The whole decision, as a function of where the page is and where it was.
 *
 * Pulled out of the effect so the rules can be tested without a browser —
 * they are the entire feel of the feature, and a later edit that drops the
 * tolerance produces bars that flicker on a resting finger, which nobody
 * would catch by reading the diff.
 *
 * `hidden` is returned unchanged for a movement too small to count, so the
 * caller can compare and skip the write.
 */
export function nextChromeState(opts: {
  y: number;
  lastY: number;
  hidden: boolean;
}): { hidden: boolean; commit: boolean } {
  const { y, lastY, hidden } = opts;
  // The top of the page always shows the chrome, whatever the gesture.
  if (y <= REVEAL_AT) return { hidden: false, commit: true };
  const delta = y - lastY;
  if (Math.abs(delta) < TOLERANCE) return { hidden, commit: false };
  return { hidden: delta > 0, commit: true };
}

export function useChromeAutoHide(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;

    let lastY = window.scrollY;
    let hidden = false;
    let frame = 0;

    const apply = (next: boolean) => {
      if (next === hidden) return;
      hidden = next;
      if (next) root.dataset.chromeHidden = "1";
      else delete root.dataset.chromeHidden;
    };

    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const next = nextChromeState({ y, lastY, hidden });
      // `lastY` only advances on a movement that counted. Advancing it on
      // every frame would let a slow drag accumulate below the tolerance and
      // never register as a direction at all.
      if (!next.commit) return;
      lastY = y;
      apply(next.hidden);
    };

    const onScroll = () => {
      // Coalesce to one measurement per frame; scroll can fire far more often
      // than the screen refreshes, and reading scrollY forces layout.
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    // A focused control inside hidden chrome cannot be reached, so anything
    // taking focus brings the bars back — this is how the search field and the
    // tab bar's links stay usable from a keyboard.
    const onFocusIn = () => apply(false);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("focusin", onFocusIn);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.chromeHidden;
    };
  }, [enabled]);
}
