import Script from "next/script";
import { getNetworkGlobals, safeToken } from "@/lib/ad-network";
import { getSetting } from "@/lib/system-settings";

/**
 * The page-level Google tags — loaded once per page, and only when configured.
 *
 * Every AdSense/GAM creative used to carry its own copy of these scripts inside a
 * sandboxed iframe. One tag per slot under-fills badly, and it makes the anchor
 * and vignette formats impossible, because those attach to the page rather than
 * to a unit. This is the arrangement Google documents and expects.
 *
 * **Nothing is emitted while the settings are empty.** The owner has no AdSense
 * account yet, so the default state of this component is to render nothing at
 * all — no script tag, no connection to Google, nothing to review. It comes to
 * life the moment a publisher id is saved in Monetization.
 */
export async function NetworkScripts() {
  const { adsenseClient, gamNetworkCode } = await getNetworkGlobals();
  const client = safeToken(adsenseClient);
  const gam = safeToken(gamNetworkCode);

  // Google's own certified CMP (Privacy & messaging / Funding Choices). Required
  // for EEA/UK/Swiss traffic — Google stops serving there without a certified
  // TCF v2.2 platform, and a hand-rolled banner can never be one. Configured in
  // the AdSense console; this only loads it.
  const cmpEnabled = await getSetting<boolean>("ads.google_cmp_enabled", false);

  if (!client && !gam) return null;

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
