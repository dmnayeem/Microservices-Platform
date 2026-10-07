"use client";

import { useEffect } from "react";
import { detectPwaPlatform, type PwaDisplayMode } from "@/lib/pwa-shared";

/**
 * Tells the server this user is running the INSTALLED app (src/lib/pwa-install.ts).
 *
 *  - In the installed app: one POST per local day (localStorage-marked only
 *    after the server accepted it, so a failed send retries next load).
 *  - In a browser tab: the `appinstalled` event, once, when they install.
 *  - In a browser tab: "install offered" — Chrome/Edge fire
 *    `beforeinstallprompt` only when the app is NOT installed, so for a user
 *    who had installed it the server records an uninstall. Once per session.
 *
 * Renders nothing, never blocks, swallows every error. The server — not this
 * file — decides what counts: distinct UTC days, once-only reward.
 */
const DAY_KEY = "pwa_seen_day";
const OFFER_KEY = "pwa_offer_sent";

function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function displayMode(): PwaDisplayMode | null {
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return "standalone";
    if ((navigator as unknown as { standalone?: boolean }).standalone === true) return "ios-standalone";
    if (document.referrer.startsWith("android-app://")) return "twa";
  } catch {
    /* ignore */
  }
  return null;
}

function platform() {
  const n = navigator as Navigator & { userAgentData?: { platform?: string } };
  return detectPwaPlatform(n.userAgent, {
    uaDataPlatform: n.userAgentData?.platform ?? null,
    maxTouchPoints: n.maxTouchPoints ?? 0,
  });
}

function send(body: Record<string, unknown>): Promise<boolean> {
  return fetch("/api/pwa/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, platform: platform(), host: location.host }),
    keepalive: true,
  })
    .then((r) => r.ok)
    .catch(() => false);
}

export function PwaSeenBeacon() {
  useEffect(() => {
    const mode = displayMode();
    if (mode) {
      let already = false;
      try {
        already = localStorage.getItem(DAY_KEY) === localDay();
      } catch {
        /* storage blocked — send; the server dedupes the day */
      }
      if (!already) {
        void send({ displayMode: mode }).then((ok) => {
          if (!ok) return;
          try {
            localStorage.setItem(DAY_KEY, localDay());
          } catch {
            /* ignore */
          }
        });
      }
    }

    const onInstalled = () => {
      void send({ event: "installed" });
    };
    window.addEventListener("appinstalled", onInstalled);

    // Browser only: the install offer means "not installed here". The root
    // layout's inline script keeps the early event on window.__egBip and
    // re-announces it as "eg-bip".
    const onOffer = () => {
      try {
        if (sessionStorage.getItem(OFFER_KEY)) return;
        sessionStorage.setItem(OFFER_KEY, "1");
      } catch {
        return; // no storage → can't keep it to once a session; skip
      }
      void send({ event: "install-offered" });
    };
    if (!mode) {
      if ((window as unknown as { __egBip?: unknown }).__egBip) onOffer();
      window.addEventListener("eg-bip", onOffer);
      window.addEventListener("beforeinstallprompt", onOffer);
    }
    return () => {
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("eg-bip", onOffer);
      window.removeEventListener("beforeinstallprompt", onOffer);
    };
  }, []);

  return null;
}
