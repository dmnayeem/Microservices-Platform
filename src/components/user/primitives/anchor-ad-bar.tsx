"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { anchorAllowedOnPath } from "@/lib/ad-placements";

/**
 * The sticky anchor ad — one mount in the app shell, every authenticated page.
 *
 * Before this, 27 of the route trees under `(main)` carried no ad at all,
 * including two of the three bottom-nav tabs. One mount here covers all of them,
 * and on mobile an anchor is the highest-yielding format there is.
 *
 * Three things this has to get right, and each of them is a real constraint
 * rather than a preference:
 *
 * **1. It must not cover the bottom nav.** `BottomTabBar` is `fixed bottom-0
 * z-40 lg:hidden` with its own `env(safe-area-inset-bottom)` padding, and its
 * centre Home tab overhangs 16px above the bar (`-mt-4`). So this sits at
 * `z-30` — under the nav, never fighting it — offset above the nav's height on
 * mobile and flush to the bottom on desktop where the nav does not exist.
 *
 * **2. It must not cover page content.** A fixed element cannot push anything,
 * and `<main>`'s `pb-24` is sized exactly for the nav. So the bar reports its
 * real height into a `--anchor-ad-h` CSS variable that `<main>` adds to its
 * bottom padding. It reports `0px` whenever it is dismissed or has no ad —
 * `AdRenderer` collapses to nothing in that case, and a static padding bump
 * would otherwise waste a strip of every page for every viewer with no
 * inventory.
 *
 * **3. It must be dismissible.** Google's own anchor format requires a close
 * control, and more to the point a bar with no escape is what makes people
 * install the ad blocker this platform already spends effort fighting. The
 * dismissal is per session, not permanent — `sessionStorage`, the same store
 * `AdRenderer` uses for its rotation memory.
 *
 * It also suppresses itself on incentivised routes (`anchorAllowedOnPath`),
 * because this is the one mount in the codebase that could otherwise drop a
 * Google ad onto a screen where the user is being paid to be.
 */

const DISMISS_KEY = "anchor-ad-dismissed";
const CSS_VAR = "--anchor-ad-h";

export function AnchorAdBar() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(true); // assume hidden until read
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Read the session dismissal once on mount. Starts `true` so the bar never
  // flashes in for a user who already closed it.
  useEffect(() => {
    let closed = false;
    try {
      closed = sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* private mode — treat as not dismissed */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(closed);
  }, []);

  const allowed = anchorAllowedOnPath(pathname ?? "");
  const visible = !dismissed && allowed;

  // Publish the real height so <main> can reserve exactly that much and no more.
  // ResizeObserver rather than a constant: the slot collapses to zero height
  // when there is no ad to show, and that must give the padding back.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.setProperty(CSS_VAR, "0px");
      return;
    }
    const el = hostRef.current;
    if (!el) return;
    const sync = () => {
      root.style.setProperty(CSS_VAR, `${Math.round(el.offsetHeight)}px`);
    };
    sync();
    const obs = new ResizeObserver(sync);
    obs.observe(el);
    return () => {
      obs.disconnect();
      root.style.setProperty(CSS_VAR, "0px");
    };
  }, [visible]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={hostRef}
      // z-30 keeps this UNDER the bottom nav (z-40). Offset by the nav's height
      // plus the notch inset on mobile; flush to the bottom on lg, where the nav
      // is `lg:hidden`.
      className="fixed inset-x-0 z-30 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] lg:bottom-0 lg:pl-72"
    >
      <div className="relative mx-auto max-w-3xl px-2 pb-1">
        <AdRenderer placement="ANCHOR_BOTTOM" />
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide ad"
          className="absolute -top-2 right-1 rounded-full bg-gray-950/90 border border-gray-700 p-1 text-gray-400 hover:text-white"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
