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
