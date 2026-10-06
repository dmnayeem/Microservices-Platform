"use client";

import { preconnect } from "react-dom";
import { usePathname } from "next/navigation";
import { isIncentivisedPath } from "@/lib/ad-placements";

/**
 * `<link rel="preconnect">` for the ad hosts this page will actually talk to —
 * Google's (when a publisher id is configured) and the primary host of every
 * enabled network. Saves the DNS + TLS round-trips on the first ad request.
 *
 * Not on incentivised paths: no Google script loads there, and a preconnect to
 * Google from a paid page is exactly the kind of signal not worth sending.
 * React hoists these into <head> and de-duplicates them.
 */
export function AdPreconnect({ origins }: { origins: string[] }) {
  const pathname = usePathname() ?? "";
  if (isIncentivisedPath(pathname)) return null;
  for (const o of origins) preconnect(o, { crossOrigin: "anonymous" });
  return null;
}
