import "server-only";
import geoip from "geoip-country";

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
    const hit = geoip.lookup(ip.replace(/^::ffff:/, ""));
    return hit?.country ? hit.country.toUpperCase() : null;
  } catch {
    return null;
  }
}
