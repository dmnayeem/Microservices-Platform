/**
 * Rewrite our own S3/CloudFront media URLs to the same-origin `/api/media`
 * proxy. The bucket is private (CloudFront has no read access), so the public
 * `https://<cloudfront>/media/…` URLs 403 and images render blank. The proxy
 * reads the object with server IAM creds and streams it back.
 *
 * Client-safe (no server imports) — used from `SmartImage`. Only rewrites:
 *  - our storage hosts (`*.cloudfront.net`, `*.s3.<region>.amazonaws.com`)
 *  - plain URLs (NOT presigned — presigned have a query string and belong to
 *    gated/private flows we must not reroute)
 *  - the PUBLIC `media/` key prefix
 * Everything else (Google avatars, pasted URLs, relative/data/blob) is returned
 * unchanged.
 */
/**
 * If `src` is one of OUR storage URLs (CloudFront / S3) pointing at the public
 * `media/` prefix, return the bare S3 object key (e.g. `media/images/…`).
 * Otherwise null. Used to read the object via server IAM creds (the public URL
 * 403s). Ignores presigned URLs (they carry a query string) so gated flows are
 * left alone.
 */
export function ownMediaKey(src?: string | null): string | null {
  if (!src) return null;
  try {
    const u = new URL(src);
    const host = u.hostname.toLowerCase();
    const ours =
      host.endsWith(".cloudfront.net") ||
      /\.s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(host);
    // Public prefixes served by the /api/media proxy: admin media + user proof
    // screenshots (both were already exposed via unguessable CloudFront URLs).
    const isPublic =
      u.pathname.startsWith("/media/") ||
      u.pathname.startsWith("/task-proofs/");
    if (ours && !u.search && isPublic) {
      return u.pathname.slice(1); // drop leading "/"
    }
  } catch {
    // relative path, data:, blob: → not ours
  }
  return null;
}

export function mediaSrc(src?: string | null): string {
  if (!src) return "";
  const key = ownMediaKey(src);
  return key ? `/api/media/${key}` : src;
}
