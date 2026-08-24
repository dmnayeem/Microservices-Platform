import { getSetting } from "@/lib/system-settings";
import { resolveAdSize } from "@/lib/ad-sizes";
import { placementSizeKey } from "@/lib/ad-placements";

/**
 * Google AdSense / Google Ad Manager support.
 *
 * **These no longer render inside an iframe.** Every network creative used to be
 * composed into a self-contained `srcDoc` document and dropped into the same
 * sandboxed frame used for raw HTML ads. That meant every slot on a page loaded
 * its own copy of `adsbygoogle.js` or `gpt.js`, which under-fills badly, and it
 * made anchor and vignette formats impossible — they need a page-level tag.
 * More to the point, Google expects its tag on the page, not re-hosted inside a
 * sandbox, and an implementation like that is the kind that gets a publisher
 * account actioned.
 *
 * So this module now resolves *configuration* — publisher id, slot id, unit path,
 * pixel size — and the client renders a real in-page `<ins>` / GPT slot from it
 * (see `network-ad-slot.tsx`). The scripts load once, from the root layout, and
 * only when a network is actually configured.
 *
 * Network ads are inherently third-party (so blockable) and report revenue in
 * Google's own console, never in this database — see docs/ad-networks.md.
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

/**
 * Allowlist token chars for any value that reaches the page.
 *
 * Publisher ids, slot ids and ad-unit paths are all `[A-Za-z0-9_./-]` by Google's
 * own format. Anything else is somebody trying something.
 */
export function safeToken(v: string | null | undefined): string {
  return String(v ?? "").replace(/[^A-Za-z0-9_./-]/g, "");
}

export interface NetworkAdInput {
  type: string;
  adSlot?: string | null;
  adUnitPath?: string | null;
  adClient?: string | null;
  size?: string | null;
  width?: number | null;
  height?: number | null;
}

/** What the browser needs to render a real network slot. */
export interface NetworkSlotConfig {
  kind: "ADSENSE" | "GAM";
  /** AdSense: publisher id. */
  client?: string;
  /** AdSense: ad unit id. */
  slot?: string;
  /** GAM: fully-qualified `/networkCode/unitName`. */
  unitPath?: string;
  /** Pixel size for a GAM `defineSlot`. AdSense responsive units don't use it. */
  width?: number;
  height?: number;
}

/**
 * Resolve the slot config for a network ad, or `null` when the setup is
 * incomplete — which is the normal state until the owner has an account. A null
 * result means "don't serve this", so nothing Google-related reaches the page.
 *
 * `placementName` supplies the fallback size. It matters: `Ad.width`/`height` are
 * only populated for `size === "custom"`, so this previously fell back to a
 * hardcoded 300x250 and a GAM ad set to `leaderboard` defined a 300x250 slot
 * inside a 90px-tall box, which the frame's `overflow:hidden` then clipped.
 */
export function resolveNetworkSlot(
  ad: NetworkAdInput,
  g: NetworkGlobals,
  placementName?: string
): NetworkSlotConfig | null {
  if (ad.type === "ADSENSE") {
    const client = safeToken(ad.adClient || g.adsenseClient);
    const slot = safeToken(ad.adSlot);
    if (!client || !slot) return null;
    return { kind: "ADSENSE", client, slot };
  }

  if (ad.type === "GAM") {
    let unit = safeToken(ad.adUnitPath);
    if (!unit) return null;
    if (!unit.startsWith("/")) {
      const net = safeToken(g.gamNetworkCode);
      if (!net) return null;
      unit = `/${net}/${unit}`;
    }
    // The ad's own preset first, then the space's default, then a last-resort
    // rectangle. Never a bare hardcoded size.
    const dim =
      resolveAdSize(ad.size, ad.width, ad.height) ??
      (placementName ? resolveAdSize(placementSizeKey(placementName)) : null);
    return {
      kind: "GAM",
      unitPath: unit,
      width: Math.max(1, Math.round(dim?.w ?? 300)),
      height: Math.max(1, Math.round(dim?.h ?? 250)),
    };
  }

  return null;
}

/**
 * A human description of a network slot, for the admin previews.
 *
 * The admin panel used to render network ads in a live iframe, which meant every
 * time an admin looked at a space the panel fetched a real Google ad — repeated
 * ad requests with no viewer behind them, which is exactly the invalid-traffic
 * pattern accounts get banned for. Previews describe the slot instead.
 */
export function describeNetworkSlot(cfg: NetworkSlotConfig): string {
  if (cfg.kind === "ADSENSE") {
    return `AdSense · ${cfg.client} · slot ${cfg.slot}`;
  }
  return `Ad Manager · ${cfg.unitPath} · ${cfg.width}×${cfg.height}`;
}
