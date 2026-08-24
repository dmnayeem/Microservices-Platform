import Script from "next/script";
import { getNetworkGlobals, safeToken } from "@/lib/ad-network";
import { getSetting } from "@/lib/system-settings";

/**
 * AdSense **Auto ads** — mounted on the marketing pages only, never inside `(main)`.
 *
 * Auto ads let Google decide where to place units, including full-screen
 * vignettes. On the marketing pages that is free money. Inside `(main)` it is a
 * hazard: those screens are incentivised ("watch this to claim your points"),
 * and AdSense prohibits Google ads on incentivised surfaces. A vignette landing
 * on a claim screen is the kind of thing an account gets actioned for.
 *
 * ## The limitation, stated plainly
 *
 * This component turning auto ads ON is real. This component being **absent**
 * from `(main)` is **not** a guarantee that auto ads stay off there. Modern auto
 * ads run wherever `adsbygoogle.js` is loaded, and that script must load in
 * `(main)` for the ad units there to fill at all. The only real enforcement is a
 * **URL exclusion configured in the AdSense console**, which no code here can
 * set or verify.
 *
 * So the admin toggle says so in as many words. Overclaiming this in the UI —
 * letting the owner believe a switch protects him — is exactly how the account
 * gets banned.
 *
 * Renders nothing until both a publisher id is saved and the toggle is on.
 */
export async function AutoAds() {
  const [{ adsenseClient }, enabled] = await Promise.all([
    getNetworkGlobals(),
    getSetting<boolean>("ads.auto_ads_enabled", false),
  ]);
  const client = safeToken(adsenseClient);
  if (!client || !enabled) return null;

  return (
    <Script id="adsense-auto-ads" strategy="afterInteractive">
      {`(window.adsbygoogle = window.adsbygoogle || []).push({ google_ad_client: ${JSON.stringify(
        client
      )}, enable_page_level_ads: true });`}
    </Script>
  );
}
