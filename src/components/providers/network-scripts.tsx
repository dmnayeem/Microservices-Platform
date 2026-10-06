import { getNetworkGlobals, safeToken } from "@/lib/ad-network";
import { getSetting } from "@/lib/system-settings";
import { getUiToggles } from "@/lib/ui-toggles-server";
import { getNetworkSettings } from "@/lib/ad-networks/settings";
import { AD_NETWORKS } from "@/lib/ad-networks/registry";
import { NetworkScriptTags } from "./network-script-tags";
import { AdNavGuard } from "./ad-nav-guard";
import { AdPreconnect } from "./ad-preconnect";
import { PageScriptAds } from "./page-script-ads";

/**
 * The page-level ad tags — loaded once per page, and only when configured.
 *
 * Every AdSense/GAM creative used to carry its own copy of these scripts inside a
 * sandboxed iframe. One tag per slot under-fills badly, and it makes the anchor
 * and vignette formats impossible, because those attach to the page rather than
 * to a unit. This is the arrangement Google documents and expects.
 *
 * **Nothing Google-related is emitted while the settings are empty.** It comes
 * to life the moment a publisher id is saved in Monetization.
 *
 * Also mounts, from the same one place in the root layout:
 *  - `AdNavGuard` — hard-reloads a client navigation into a paid page once a
 *    page-level ad script has run (always mounted; renders nothing).
 *  - `AdPreconnect` — preconnect hints for Google + enabled networks.
 *  - `PageScriptAds` — the PAGE_SCRIPT space (popunder, social bar, in-page
 *    push), only when some enabled network offers page scripts.
 *
 * This half reads the configuration (server-only); the client halves decide
 * whether the current route may carry any of it — see the note in
 * `NetworkScriptTags` on why that decision has to be made client-side.
 */
export async function NetworkScripts() {
  const [{ adsenseClient, gamNetworkCode }, cmpEnabled, netSettings, ui] =
    await Promise.all([
      getNetworkGlobals(),
      // Google's own certified CMP (Privacy & messaging / Funding Choices).
      // Required for EEA/UK/Swiss traffic — Google stops serving there without a
      // certified TCF v2.2 platform, and a hand-rolled banner can never be one.
      // Configured in the AdSense console; this only loads it.
      getSetting<boolean>("ads.google_cmp_enabled", false),
      getNetworkSettings().catch(() => null),
      getUiToggles().catch(() => null),
    ]);
  const client = safeToken(adsenseClient);
  const gam = safeToken(gamNetworkCode);
  const googleActive = !!(client || gam);

  const origins: string[] = [];
  if (client) {
    origins.push("https://pagead2.googlesyndication.com", "https://googleads.g.doubleclick.net");
  }
  if (gam) origins.push("https://securepubads.g.doubleclick.net");
  let pageScripts = false;
  if (netSettings) {
    for (const n of AD_NETWORKS) {
      if (n.google || !netSettings.networks[n.id]?.enabled) continue;
      if (n.kinds.includes("PAGE_SCRIPT")) pageScripts = true;
      if (n.domains[0] && !n.dynamicDomains) origins.push(`https://${n.domains[0]}`);
    }
  }
  // A handful at most: every preconnect is a socket the browser holds open.
  const preconnect = [...new Set(origins)].slice(0, 6);

  return (
    <>
      <AdNavGuard />
      {preconnect.length > 0 && <AdPreconnect origins={preconnect} />}
      {googleActive && (
        <NetworkScriptTags client={client} gam={gam} cmpEnabled={!!cmpEnabled} />
      )}
      {pageScripts && (
        <PageScriptAds
          // Same rule the root layout uses for SiteTracking: our banner owns
          // consent unless Google's certified CMP does.
          requireConsent={!!ui?.cookiesPopup && !cmpEnabled}
          googleActive={googleActive}
        />
      )}
    </>
  );
}
