import { getSetting } from "@/lib/system-settings";

/** Admin-configurable feed ad density (SystemSettings, category "ads"). */
export interface AdDensity {
  /** Native in-feed ad after every N posts. */
  feedAdInterval: number;
  /** Admin-promoted post interleaved every N feed entries. */
  feedPromoInterval: number;
  /** Show a banner under posts in the feed. */
  underPostBanner: boolean;
  /** …under every N posts (when enabled). */
  underPostInterval: number;
}

const clampInt = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const asBool = (v: unknown) => v === true || v === "true";

export async function getAdDensity(): Promise<AdDensity> {
  const [fa, fp, ub, ui] = await Promise.all([
    getSetting<number>("ads.feed_ad_interval", 2),
    getSetting<number>("ads.feed_promo_interval", 4),
    getSetting<boolean>("ads.under_post_banner", false),
    getSetting<number>("ads.under_post_interval", 3),
  ]);
  return {
    feedAdInterval: clampInt(fa, 2, 1, 20),
    feedPromoInterval: clampInt(fp, 4, 1, 20),
    underPostBanner: asBool(ub),
    underPostInterval: clampInt(ui, 3, 1, 20),
  };
}
