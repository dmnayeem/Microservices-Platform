"use client";

import { useEffect } from "react";
import { detectPwaPlatform, type PwaDisplayMode } from "@/lib/pwa-shared";

/**
 * Tells the server this user is running the INSTALLED app (src/lib/pwa-install.ts).
 *
 *  - In the installed app: one POST per local day (localStorage-marked only
 *    after the server accepted it, so a failed send retries next load).
 *  - In a browser tab: the `appinstalled` event, once, when they install.
 *
 * Renders nothing, never blocks, swallows every error. The server — not this
 * file — decides what counts: distinct UTC days, once-only reward.
 */
const DAY_KEY = "pwa_seen_day";

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
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  return null;
}
