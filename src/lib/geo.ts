import "server-only";
import { createRequire } from "node:module";

type GeoIp = { lookup(ip: string): { country?: string } | null };
let geoip: GeoIp | null | undefined;

/**
 * Loaded on first use, never at import. The package reads its data files
 * (`data/*.dat`, from a path built at runtime) the moment it is required; if a
 * deploy leaves them out, a top-level import throws while the module loads —
 * and every route that imports this file (sign-up and login included) fails.
 * Loaded here, a missing file only means "country unknown". On Vercel the
 * request's own `x-vercel-ip-country` header covers live traffic anyway;
 * next.config.ts also ships the data files with every function.
 */
function loadGeo(): GeoIp | null {
  if (geoip !== undefined) return geoip;
  try {
    geoip = createRequire(import.meta.url)("geoip-country") as GeoIp;
  } catch (e) {
    console.warn("[geo] geoip-country unavailable — countries from IP disabled:", (e as Error)?.message);
    geoip = null;
  }
  return geoip;
}

/**
 * IP → ISO country code, offline.
 *
 * Uses the geoip-country database (MaxMind GeoLite2 data, bundled with the
 * package): no lookup ever leaves the server, so users' IPs are not sent to a
 * third-party service, and it works for old IPs and outside Vercel. On Vercel
 * the request's own `x-vercel-ip-country` is preferred when it is there.
 *
 * "This product includes GeoLite2 data created by MaxMind, available from
 * https://www.maxmind.com."
 */
const PRIVATE = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd|fe80)/i;

export function countryOfIp(ip: string | null | undefined): string | null {
  if (!ip || ip === "unknown" || PRIVATE.test(ip)) return null;
  try {
    const hit = loadGeo()?.lookup(ip.replace(/^::ffff:/, ""));
    return hit?.country ? hit.country.toUpperCase() : null;
  } catch {
    return null;
  }
}
