"use client";

import { useEffect } from "react";
import { lsGet, lsRemove, lsSet } from "@/lib/safe-storage";
import {
  FIRST_TOUCH_KEY,
  FIRST_TOUCH_SENT_KEY,
  FIRST_TOUCH_TTL_MS,
  isEmptyTouch,
  type FirstTouch,
} from "@/lib/signup-source-shared";

const NOT_A_SOURCE =
  /(^|\.)(accounts\.google\.[a-z.]+|accounts\.youtube\.com|appleid\.apple\.com|bkash\.com|pay\.bka\.sh|sslcommerz\.com|stripe\.com|paypal\.com|checkout\.[a-z.]+)$/i;

/**
 * Remembers where this visitor first came from — the referrer and any
 * utm_/click-id on the landing URL — so the account they create later can say
 * "came from Facebook" (Admin → Sign-up sources). Mounted on every page,
 * visitors included. A plain visit (no referrer) never replaces a real source.
 * Stays on the device; nothing is sent until an account exists (FirstTouchReport).
 */
export function FirstTouchCapture() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const p = url.searchParams;
      let referrer: string | null = null;
      if (document.referrer) {
        try {
          const r = new URL(document.referrer);
          // Our own pages are not a source; app intents (android-app://…) are.
          // Neither is coming back from signing in with Google or from paying
          // — that is the middle of a visit, not where it started.
          if (r.host !== window.location.host && !NOT_A_SOURCE.test(r.host)) {
            referrer = document.referrer.slice(0, 300);
          }
        } catch {
          /* unparsable referrer */
        }
      }
      const touch: FirstTouch = {
        referrer,
        utmSource: p.get("utm_source")?.slice(0, 80) ?? null,
        utmMedium: p.get("utm_medium")?.slice(0, 80) ?? null,
        utmCampaign: p.get("utm_campaign")?.slice(0, 120) ?? null,
        gclid: p.has("gclid") || p.has("gbraid") || p.has("wbraid"),
        fbclid: p.has("fbclid"),
        refLink: p.has("ref"),
        landing: url.pathname.slice(0, 200),
        at: Date.now(),
      };
      let existing: FirstTouch | null = null;
      try {
        existing = JSON.parse(lsGet(FIRST_TOUCH_KEY) || "null") as FirstTouch | null;
      } catch {
        existing = null;
      }
      const stale = !existing || Date.now() - (existing.at ?? 0) > FIRST_TOUCH_TTL_MS;
      // First touch wins — except that a real source replaces an empty one.
      if (stale || (isEmptyTouch(existing!) && !isEmptyTouch(touch))) {
        lsSet(FIRST_TOUCH_KEY, JSON.stringify(touch));
      }
    } catch {
      /* never break a page over this */
    }
  }, []);
  return null;
}

/**
 * Signed-in app: sends the saved touch once. The server keeps it only for a
 * new account whose source is still empty and only if the touch was captured
 * before the account was created, so an old account is never mislabelled.
 */
export function FirstTouchReport() {
  useEffect(() => {
    try {
      if (lsGet(FIRST_TOUCH_SENT_KEY)) return;
      const raw = lsGet(FIRST_TOUCH_KEY);
      if (!raw) return;
      // A visitor in the consent region who turned analytics off is not recorded.
      try {
        const c = JSON.parse(lsGet("cookie_consent_v1") || "null") as { analytics?: boolean } | null;
        if (c && c.analytics === false) {
          lsRemove(FIRST_TOUCH_KEY);
          return;
        }
      } catch {
        /* no choice recorded */
      }
      void fetch("/api/me/signup-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: raw,
      })
        .then((r) => {
          if (r.ok) lsSet(FIRST_TOUCH_SENT_KEY, "1");
        })
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
