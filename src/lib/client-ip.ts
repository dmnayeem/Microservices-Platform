/**
 * The visitor's REAL IP address and country — one place, used everywhere.
 *
 * The site sits behind Cloudflare in front of Vercel. Every request then
 * reaches Vercel from a Cloudflare server, so Vercel's own headers
 * (`x-vercel-forwarded-for`, `x-vercel-ip-country`) describe CLOUDFLARE —
 * a 172.68.x.x address and the country of the Cloudflare data centre — not the
 * member. The admin panel showed Cloudflare IPs, "one account per IP" counted
 * thousands of members as one, VPN checks and country targeting were wrong.
 *
 * Cloudflare passes the real values in `CF-Connecting-IP` / `CF-IPCountry`.
 * Those headers are trusted ONLY when the request really came from a
 * Cloudflare address: anyone can send a `CF-Connecting-IP` header, so without
 * that check a script could pick its own IP and slip every IP limit.
 *
 * Edge-safe (no Node APIs) — usable from middleware, route handlers and pages.
 */

type HeaderGetter = { get(name: string): string | null };

/** Cloudflare's published ranges (cloudflare.com/ips). */
const CF_V4: [number, number][] = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
].map((cidr) => {
  const [ip, bits] = cidr.split("/");
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return [(v4ToInt(ip!)! & mask) >>> 0, mask];
});

const CF_V6_PREFIXES = ["2400:cb00:", "2606:4700:", "2803:f800:", "2405:b500:", "2405:8100:", "2c0f:f248:", "2a06:98c"];

function v4ToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const part of p) {
    const x = Number(part);
    if (!Number.isInteger(x) || x < 0 || x > 255) return null;
    n = n * 256 + x;
  }
  return n >>> 0;
}

export function isCloudflareIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const v = ip.trim().toLowerCase();
  if (v.includes(":")) return CF_V6_PREFIXES.some((p) => v.startsWith(p));
  const n = v4ToInt(v);
  if (n === null) return false;
  return CF_V4.some(([net, mask]) => ((n & mask) >>> 0) === net);
}

const looksLikeIp = (s: string) => /^[0-9a-f:.]+$/i.test(s) && (s.includes(".") || s.includes(":"));

/** The address the hosting edge saw (Vercel's own header first; XFF rightmost hop). */
function edgeIp(h: HeaderGetter): string | null {
  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim() || null;
  const real = h.get("x-real-ip");
  if (real) return real.trim() || null;
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!;
  }
  return null;
}

/** Did this request come through Cloudflare (from a Cloudflare address)? */
export function viaCloudflare(h: HeaderGetter): boolean {
  return isCloudflareIp(edgeIp(h));
}

/** The visitor's real IP, or null. */
export function realIp(h: HeaderGetter): string | null {
  const edge = edgeIp(h);
  if (edge && isCloudflareIp(edge)) {
    const cf = h.get("cf-connecting-ip")?.trim();
    if (cf && looksLikeIp(cf)) return cf;
  }
  return edge;
}

/** Same, with the "unknown" placeholder older callers expect. */
export function realIpOrUnknown(h: HeaderGetter): string {
  return realIp(h) ?? "unknown";
}

/**
 * The visitor's real country (2-letter, upper case), or null. Through
 * Cloudflare that is `CF-IPCountry` — Vercel's header would be the Cloudflare
 * data centre's country. Directly on Vercel it is `x-vercel-ip-country`.
 */
export function realCountry(h: HeaderGetter): string | null {
  const pick = (v: string | null | undefined) => {
    const c = (v ?? "").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : null;
  };
  if (viaCloudflare(h)) return pick(h.get("cf-ipcountry"));
  return pick(h.get("x-vercel-ip-country")) ?? pick(h.get("x-geo-country"));
}
