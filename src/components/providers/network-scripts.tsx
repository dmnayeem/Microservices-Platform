import { getNetworkGlobals, safeToken } from "@/lib/ad-network";
import { getSetting } from "@/lib/system-settings";
import { NetworkScriptTags } from "./network-script-tags";

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
 *
 * This half reads the configuration (server-only); `NetworkScriptTags` decides
 * whether the current route may carry Google's scripts at all — see the note
 * there on why that decision has to be made client-side.
 */
export async function NetworkScripts() {
  const [{ adsenseClient, gamNetworkCode }, cmpEnabled] = await Promise.all([
    getNetworkGlobals(),
    // Google's own certified CMP (Privacy & messaging / Funding Choices).
    // Required for EEA/UK/Swiss traffic — Google stops serving there without a
    // certified TCF v2.2 platform, and a hand-rolled banner can never be one.
    // Configured in the AdSense console; this only loads it.
    getSetting<boolean>("ads.google_cmp_enabled", false),
  ]);
  const client = safeToken(adsenseClient);
  const gam = safeToken(gamNetworkCode);

  if (!client && !gam) return null;

  return (
    <NetworkScriptTags client={client} gam={gam} cmpEnabled={!!cmpEnabled} />
  );
}
