import { getSetting } from "@/lib/system-settings";

/**
 * Third-party ad-network (Google AdSense / Google Ad Manager) support. The
 * self-contained creative document is composed on the server from structured
 * per-ad config + the publisher-level globals, and rendered in the same
 * script-executing sandboxed iframe used for raw HTML ads (src/components/user/
 * primitives/sandboxed-ad-frame.tsx). Network ads are inherently third-party
 * (blockable) and report in the network's own console — see docs/ad-networks.md.
 */

export interface NetworkGlobals {
  /** AdSense publisher id, e.g. "ca-pub-1234567890". */
  adsenseClient: string;
  /** Google Ad Manager network code, e.g. "22106938064". */
  gamNetworkCode: string;
}

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Publisher-level network config (SystemSettings). */
export async function getNetworkGlobals(): Promise<NetworkGlobals> {
  const [adsenseClient, gamNetworkCode] = await Promise.all([
    getSetting<string>("ads.adsense_client", ""),
    getSetting<string>("ads.gam_network_code", ""),
  ]);
  return { adsenseClient: s(adsenseClient), gamNetworkCode: s(gamNetworkCode) };
}

/** Allowlist token chars for any value interpolated into the composed markup. */
function safe(v: string | null | undefined): string {
  return String(v ?? "").replace(/[^A-Za-z0-9_./-]/g, "");
}

export interface NetworkAdInput {
  type: string;
  adSlot?: string | null;
  adUnitPath?: string | null;
  adClient?: string | null;
  width?: number | null;
  height?: number | null;
}

/**
 * Compose a self-contained srcDoc document for an AdSense/GAM ad, or `null` when
 * the required config is incomplete (falls back to any raw htmlContent).
 */
export function composeNetworkAdHtml(ad: NetworkAdInput, g: NetworkGlobals): string | null {
  if (ad.type === "ADSENSE") {
    const client = safe(ad.adClient || g.adsenseClient);
    const slot = safe(ad.adSlot);
    if (!client || !slot) return null;
    return (
      `<!doctype html><html><head><meta charset="utf-8">` +
      `<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style></head><body>` +
      `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>` +
      `<ins class="adsbygoogle" style="display:block;width:100%;height:100%" data-ad-client="${client}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>` +
      `<script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>` +
      `</body></html>`
    );
  }
  if (ad.type === "GAM") {
    let unit = safe(ad.adUnitPath);
    if (!unit) return null;
    if (!unit.startsWith("/")) {
      const net = safe(g.gamNetworkCode);
      if (!net) return null;
      unit = `/${net}/${unit}`;
    }
    const w = Math.max(1, Math.round(Number(ad.width) || 300));
    const h = Math.max(1, Math.round(Number(ad.height) || 250));
    return (
      `<!doctype html><html><head><meta charset="utf-8">` +
      `<style>html,body{margin:0;padding:0;overflow:hidden;text-align:center;background:transparent}</style>` +
      `<script async src="https://securepubads.g.doubleclick.net/tag/js/gpt.js" crossorigin="anonymous"></script>` +
      `<script>window.googletag=window.googletag||{cmd:[]};</script></head><body>` +
      `<div id="gpt-slot" style="width:${w}px;height:${h}px;margin:0 auto"></div>` +
      `<script>googletag.cmd.push(function(){var sl=googletag.defineSlot('${unit}',[${w},${h}],'gpt-slot');if(sl){sl.addService(googletag.pubads());googletag.enableServices();googletag.display('gpt-slot');}});</script>` +
      `</body></html>`
    );
  }
  return null;
}
