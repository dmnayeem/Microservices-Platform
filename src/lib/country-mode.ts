import "server-only";
import { getSetting } from "@/lib/system-settings";
import { setCountryIpOnly } from "@/lib/effective-country";

/** The admin switch for country targeting (see effective-country.ts). */
export const COUNTRY_IP_ONLY_KEY = "targeting.country_ip_only";

/**
 * Load the switch before matching. `getSetting` is memoised, so this costs
 * nothing after the first call; a failed read keeps the default (off).
 */
export async function syncCountryMode(): Promise<void> {
  const v = await getSetting<unknown>(COUNTRY_IP_ONLY_KEY, false).catch(() => false);
  setCountryIpOnly(v === true || v === "true");
}
