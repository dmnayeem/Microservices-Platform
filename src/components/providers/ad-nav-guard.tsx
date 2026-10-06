"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isIncentivisedPath } from "@/lib/ad-placements";

/**
 * Once a page-level ad script has run in this document, a CLIENT navigation
 * into a paid page must become a HARD navigation.
 *
 * `NetworkScriptTags` keeps `adsbygoogle.js` / `gpt.js` off incentivised routes,
 * and `PageScriptAds` keeps network page scripts off them — but only for the
 * document they render into. Next.js navigates client-side: the script that
 * loaded on /wallet is still running when the user taps through to /tasks, and
 * Auto ads (or a popunder's click handler) carry on there. An Auto ad on a
 * screen that pays the user is the specific AdSense ban this platform has been
 * guarding against; the client-side route change was the hole in it.
 *
 * So: on a route change into an incentivised path, if any such script is live,
 * reload the same URL once. The fresh document is server-rendered without the
 * scripts, exactly like a direct visit.
 *
 * Loop guard: never on the first mount (a fresh document is already clean as
 * far as our tags go), and never twice for the same URL within a few seconds —
 * a tag injected by something else (e.g. owner custom code) must not turn this
 * into a reload loop.
 */

let tainted = false;

/** Called by anything that injects a page-level third-party ad script. */
export function markAdPageTainted(): void {
  tainted = true;
}

function googleScriptsLive(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector(
    'script[src*="/pagead/js/adsbygoogle.js"],script[src*="securepubads.g.doubleclick.net/tag/js/gpt.js"]'
  );
}

const GUARD_KEY = "ad-nav-guard";
const GUARD_MS = 8000;

export function AdNavGuard() {
  const pathname = usePathname() ?? "";
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    if (!isIncentivisedPath(pathname)) return;
    if (!tainted && !googleScriptsLive()) return;

    const href = window.location.href;
    try {
      const prev = JSON.parse(sessionStorage.getItem(GUARD_KEY) ?? "null") as
        | { href: string; at: number }
        | null;
      if (prev && prev.href === href && Date.now() - prev.at < GUARD_MS) return;
      sessionStorage.setItem(GUARD_KEY, JSON.stringify({ href, at: Date.now() }));
    } catch {
      /* storage blocked — reload anyway; the first-mount rule still stops a loop */
    }
    window.location.replace(href);
  }, [pathname]);

  return null;
}
