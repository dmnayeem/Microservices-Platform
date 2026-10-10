/**
 * Where a visitor came from — the browser-side half (client-safe). The visit's
 * first outside touch is kept on the device until they create an account, then
 * sent once and stored on the account (src/lib/signup-source.ts classifies it).
 */

export const FIRST_TOUCH_KEY = "rt_first_touch_v1";
export const FIRST_TOUCH_SENT_KEY = "rt_first_touch_sent_v1";
/** A touch older than this is forgotten: it no longer explains a sign-up. */
export const FIRST_TOUCH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface FirstTouch {
  /** Outside referrer URL (never our own pages). */
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  /** Google Ads / Facebook click ids were present (values are not kept). */
  gclid: boolean;
  fbclid: boolean;
  /** Arrived on an invite link (?ref=). */
  refLink: boolean;
  /** Path the visit landed on. */
  landing: string;
  /** When it was captured (ms). */
  at: number;
}

/** A touch that says nothing (typed address, bookmark, no referrer). */
export function isEmptyTouch(t: FirstTouch): boolean {
  return !t.referrer && !t.utmSource && !t.gclid && !t.fbclid && !t.refLink;
}
