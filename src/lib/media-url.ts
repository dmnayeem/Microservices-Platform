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
export function mediaSrc(src?: string | null): string {
  if (!src) return "";
  try {
    const u = new URL(src);
    const host = u.hostname.toLowerCase();
    const ours =
      host.endsWith(".cloudfront.net") ||
      /\.s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(host);
    if (ours && !u.search && u.pathname.startsWith("/media/")) {
      return `/api/media${u.pathname}`;
    }
  } catch {
    // relative path, data:, blob: → leave as-is
  }
  return src;
}
