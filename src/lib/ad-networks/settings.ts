import { getSetting, saveSetting } from "@/lib/system-settings";
import {
  AD_NETWORKS,
  normalizeNetworkSettings,
  type NetworkSettings,
} from "@/lib/ad-networks/registry";

/**
 * Server-side access to the per-network settings the owner edits at
 * /admin/ads/networks. Stored as ONE SystemSetting (`ads.networks`) through the
 * existing settings mechanism, so it shares its cache and its prime-on-write.
 *
 * The Google publisher ids are NOT duplicated here: AdSense's client and Ad
 * Manager's network code stay in `ads.adsense_client` / `ads.gam_network_code`,
 * which everything else already reads. The network screen edits those keys
 * directly for the two Google rows.
 */
export const NETWORK_SETTINGS_KEY = "ads.networks";

export async function getNetworkSettings(): Promise<NetworkSettings> {
  const raw = await getSetting<unknown>(NETWORK_SETTINGS_KEY, null);
  return normalizeNetworkSettings(raw);
}

export async function saveNetworkSettings(next: NetworkSettings): Promise<void> {
  await saveSetting(NETWORK_SETTINGS_KEY, normalizeNetworkSettings(next), "ads");
}

/** Registry entries the owner has enabled (Google rows: enabled when configured). */
export async function enabledNetworkIds(): Promise<Set<string>> {
  const s = await getNetworkSettings();
  return new Set(AD_NETWORKS.filter((n) => s.networks[n.id]?.enabled).map((n) => n.id));
}
