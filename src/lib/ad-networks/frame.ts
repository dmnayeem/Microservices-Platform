/**
 * The separate origin third-party HTML ads run on.
 *
 * Many networks' in-slot code needs cookies / localStorage (frequency capping,
 * fraud checks, their own loaders). An `<iframe srcDoc sandbox>` without
 * `allow-same-origin` has an OPAQUE origin, where all of that throws — so those
 * networks under-fill or render nothing. Adding `allow-same-origin` to a srcDoc
 * frame is not an option: the frame would then BE revtype.com, and the ad's
 * script could call our APIs with the viewer's session.
 *
 * The fix is a real origin that is not ours: `AD_FRAME_ORIGIN`
 * (e.g. https://ads.revtype.com, a DNS name pointing at this same app). The ad
 * is served from `/api/ads/frame/[id]` on THAT host and framed with
 * `allow-same-origin`, which now grants the ad its own origin and nothing of
 * the app's. When the env is unset, the renderer keeps the opaque srcDoc frame.
 *
 * Server-only (reads process.env at request time).
 */
export function adFrameOrigin(): string | null {
  const raw = (process.env.AD_FRAME_ORIGIN ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && process.env.NODE_ENV === "production") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Host part of AD_FRAME_ORIGIN (for the frame route's Host check). */
export function adFrameHost(): string | null {
  const o = adFrameOrigin();
  if (!o) return null;
  try {
    return new URL(o).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Absolute URL of an ad's frame document, or undefined when no frame origin is set. */
export function adFrameUrl(
  adId: string,
  variant: "d" | "m",
  version: Date | string | number | null | undefined
): string | undefined {
  const origin = adFrameOrigin();
  if (!origin) return undefined;
  const v =
    version instanceof Date ? version.getTime() : version != null ? String(version) : "0";
  return `${origin}/api/ads/frame/${encodeURIComponent(adId)}?s=${variant}&v=${encodeURIComponent(String(v))}`;
}
