/**
 * Whether the visitor has agreed to personalised advertising.
 *
 * The cookie banner has always written a `marketing` preference to
 * `localStorage` — and **nothing in the codebase read it**. "Reject All" changed
 * precisely nothing. Wiring Google's tag in while that was still true would have
 * been worse than having no banner at all: it would look like a choice and not be
 * one.
 *
 * This is the single reader. Both network slots consult it before their first
 * request, and ask Google for non-personalised ads when consent is absent.
 *
 * IMPORTANT, and not something code can fix: this is **not** a Google-certified
 * CMP. For visitors in the EEA, UK and Switzerland, Google requires a certified
 * consent platform (TCF v2.2) and will stop serving ads there without one. The
 * free certified option is Google's own Privacy & messaging (Funding Choices),
 * which is configured in the AdSense console and loaded by `network-scripts.tsx`
 * when its publisher id is set. This file makes the existing banner honest
 * everywhere; it does not replace that.
 *
 * Client-safe: no imports, no prisma.
 */

const STORAGE_KEY = "cookie_consent_v1";

interface StoredPrefs {
  essential?: boolean;
  analytics?: boolean;
  marketing?: boolean;
  functional?: boolean;
}

/**
 * True only when the visitor has actively allowed marketing cookies.
 *
 * Defaults to FALSE — including when nothing has been stored yet, when the value
 * is malformed, and during server rendering. Serving a non-personalised ad to
 * someone who would have consented costs a little revenue; serving a
 * personalised one to someone who did not costs a great deal more.
 */
export function hasMarketingConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const prefs = JSON.parse(raw) as StoredPrefs;
    return prefs?.marketing === true;
  } catch {
    return false;
  }
}

/** The key the banner writes, exported so the two can never drift apart. */
export const CONSENT_STORAGE_KEY = STORAGE_KEY;
