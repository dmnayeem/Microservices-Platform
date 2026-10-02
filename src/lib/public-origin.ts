/**
 * The site's public address for a request — what a browser, an email client
 * or a third-party page must be sent to.
 *
 * Not `req.nextUrl.origin`: behind the VPS proxy the app sees its own
 * container address, so that came out as "https://localhost:3000". The article
 * embed then made every reader's browser call localhost (nothing loaded), and
 * redirects built from `request.url` sent people there too (email verification,
 * /go/cpa).
 *
 * Order: the proxy's X-Forwarded-Host, then a real Host header, then — in
 * production — the configured site URL; local development keeps localhost.
 */

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i;

type HeaderSource = { headers: { get(name: string): string | null }; url: string };

function first(v: string | null): string {
  return (v ?? "").split(",")[0].trim();
}

function configuredOrigin(): string | null {
  for (const v of [process.env.NEXT_PUBLIC_APP_URL, process.env.AUTH_URL, process.env.NEXTAUTH_URL]) {
    const s = (v ?? "").trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      if ((u.protocol === "https:" || u.protocol === "http:") && !LOCAL.test(u.host)) return u.origin;
    } catch {
      /* not a URL — try the next one */
    }
  }
  return null;
}

/** Public origin, e.g. "https://revtype.com". Never a container address in production. */
export function publicOrigin(req: HeaderSource): string {
  const own = new URL(req.url);
  const proto = first(req.headers.get("x-forwarded-proto")) || own.protocol.replace(":", "");
  const forwarded = first(req.headers.get("x-forwarded-host"));
  if (forwarded && !LOCAL.test(forwarded)) return `${proto}://${forwarded}`;
  const host = first(req.headers.get("host"));
  if (host && !LOCAL.test(host)) return `${proto}://${host}`;
  if (process.env.NODE_ENV === "production") {
    return configuredOrigin() ?? "https://revtype.com";
  }
  return own.origin;
}

/** The host the visitor actually typed (for www→apex), proxy-aware. */
export function publicHost(req: { headers: { get(name: string): string | null } }): string {
  return (first(req.headers.get("x-forwarded-host")) || first(req.headers.get("host"))).toLowerCase();
}
