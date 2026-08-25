"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { isIncentivisedPath } from "@/lib/ad-placements";

/**
 * The Google tags, gated on the route.
 *
 * **Incentivised pages get no Google script at all.** `networkAllowed: false`
 * on a placement stops a Google creative being booked into a slot *we* render;
 * it cannot stop **Auto ads**, which this page-level script injects wherever it
 * likes. An Auto ad on a screen that pays the user to be there is an
 * account-level AdSense ban, so the only reliable control is the script not
 * being on the page.
 *
 * Why a client component when the parent is a server component: the pathname.
 * The parent sits in the ROOT layout, where `params`/`pathname` are unavailable,
 * and the `x-pathname` header the admin layout reads is **not actually
 * delivered** — NextAuth's `authorized` callback builds a pass-through response
 * carrying it, but NextAuth discards that response and returns its own
 * `NextResponse.next()`. Measured, not assumed: a probe here read the header as
 * `""` on every route, before and after a clean restart.
 *
 * `usePathname()` is resolved during SSR too, so the tag is absent from the
 * server-rendered HTML on these routes as well — not merely unmounted after
 * hydration. That matters, because the HTML is what Google's own reviewer
 * fetches.
 */
export function NetworkScriptTags({
  client,
  gam,
  cmpEnabled,
}: {
  client: string;
  gam: string;
  cmpEnabled: boolean;
}) {
  const pathname = usePathname() ?? "";
  if (isIncentivisedPath(pathname)) return null;

  return (
    <>
      {client && (
        <Script
          id="adsbygoogle-init"
          async
          strategy="afterInteractive"
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
        />
      )}

      {client && cmpEnabled && (
        <Script
          id="google-cmp"
          async
          strategy="afterInteractive"
          src={`https://fundingchoicesmessages.google.com/i/${client}?ers=1`}
        />
      )}

      {/* No inline `googletag.cmd` bootstrap here: every slot creates the queue
          itself before pushing to it, so a slot that mounts before gpt.js has
          finished loading still queues correctly. One less inline script. */}
      {gam && (
        <Script
          id="gpt-init"
          async
          strategy="afterInteractive"
          crossOrigin="anonymous"
          src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"
        />
      )}
    </>
  );
}
