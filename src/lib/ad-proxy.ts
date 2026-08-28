/**
 * First-party creative proxying for ad-blocker resistance.
 *
 * Ad creatives are normally served straight from their stored URL (an S3/
 * CloudFront or advertiser host). Ad-blockers can block those hosts, and a raw
 * `<img src="https://some-cdn/...ad...">` is an easy target. Instead we hand the
 * browser a same-origin, innocuously-named URL and stream the bytes back through
 * our own domain — the blocker sees an ordinary first-party request.
 *
 * The path deliberately contains no `ad`/`advert`/`sponsor`/`banner` token.
 */

export type AdMediaField = "img" | "video" | "logo";

/** Map a proxy field to the `Ad` column it streams. */
export const AD_MEDIA_COLUMN: Record<
  AdMediaField,
  "contentUrl" | "videoUrl" | "brandLogo"
> = {
  img: "contentUrl",
  video: "videoUrl",
  logo: "brandLogo",
};

/**
 * Same-origin URL that streams an ad's creative through the first-party proxy
 * route. Relative on purpose so it stays same-origin in both client and SSR.
 */
export function firstPartyMediaUrl(adId: string, field: AdMediaField): string {
  return `/api/spaces/media/${adId}?f=${field}`;
}

/** Ad types whose creative WE host (and can therefore first-party). Network types
 *  (ADSENSE/GAM/SDK/META) load the network's own script/creative from Google/Meta
 *  and can't be proxied. */
export function isFirstPartyAdType(type: string | null | undefined): boolean {
  return (
    type !== "SDK" && type !== "META" && type !== "ADSENSE" && type !== "GAM"
  );
}

/**
 * A creative stored inline rather than at a URL — `data:` (and `blob:`, which a
 * preview can produce).
 *
 * These must NOT be routed through the proxy. The proxy resolves a private-S3
 * key or fetches an http(s) URL; a `data:` URI is neither, so `assertPublicUrl`
 * rejects it and the route answers 404 — which the browser renders as a broken
 * image. Every seeded demo creative is an inline SVG, so all of them showed up
 * broken wherever they were served.
 *
 * Nothing is lost by skipping the proxy here: the bytes are already inline and
 * same-origin, so there is no third-party host to disguise and no URL for a
 * blocker to match on.
 */
export function isInlineCreative(url: string | null | undefined): boolean {
  if (!url) return false;
  const s = url.trimStart().toLowerCase();
  return s.startsWith("data:") || s.startsWith("blob:");
}

/**
 * The URL a client should load for one creative field.
 *
 * The single place that decides between the first-party proxy and the stored
 * URL, so the inline-creative rule above cannot be forgotten at one of the call
 * sites — which is exactly how it broke.
 */
export function creativeUrl(
  adId: string,
  field: AdMediaField,
  stored: string | null | undefined,
  proxy: boolean
): string | undefined {
  if (!stored) return undefined;
  if (!proxy || isInlineCreative(stored)) return stored;
  return firstPartyMediaUrl(adId, field);
}
