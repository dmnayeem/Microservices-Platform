"use client";

import { useEffect } from "react";

/**
 * Gives this browser a stable device id and a coarse fingerprint, for the
 * multi-account rules in src/lib/device.ts.
 *
 *   eg_did  random id, kept in BOTH a cookie and localStorage, so clearing
 *           one restores it from the other.
 *   eg_fp   hash of browser, OS, screen, timezone, languages and hardware
 *           hints — survives a full cookie + storage clear on the same browser.
 *
 * The cookies are first-party and carry no personal data; the server reads
 * them at sign-up (limit checks) and `report` sends one "seen" per UTC day
 * per tab so signed-in users' devices, IPs and countries are recorded — and
 * the day counts as a visit for /admin/users/returning.
 */
const DID = "eg_did";
const FP = "eg_fp";
const TWO_YEARS = 60 * 60 * 24 * 730;

/** Report the visit unless this tab already did today (UTC, as the server counts). */
function reportSeen() {
  const key = `eg_seen_${new Date().toISOString().slice(0, 10)}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* storage blocked — report anyway; the server dedupes the day */
  }
  void fetch("/api/device/seen", { method: "POST", keepalive: true }).catch(() => {});
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeCookie(name: string, value: string) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${TWO_YEARS}; Path=/; SameSite=Lax${secure}`;
}

async function fingerprint(): Promise<string> {
  const n = navigator as Navigator & { deviceMemory?: number };
  const parts = [
    n.userAgent,
    n.platform,
    (n.languages ?? []).join(","),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(window.devicePixelRatio),
    String(n.hardwareConcurrency ?? ""),
    String(n.deviceMemory ?? ""),
    String(n.maxTouchPoints ?? ""),
  ].join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
  return Array.from(new Uint8Array(buf))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function DeviceBeacon({ report = false }: { report?: boolean }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let id: string | null = null;
        try {
          id = localStorage.getItem(DID);
        } catch {
          /* storage blocked */
        }
        id = id || readCookie(DID) || crypto.randomUUID().replace(/-/g, "");
        try {
          localStorage.setItem(DID, id);
        } catch {
          /* storage blocked — the cookie still carries it */
        }
        writeCookie(DID, id);
        writeCookie(FP, await fingerprint());

        if (!report || cancelled) return;
        reportSeen();
      } catch {
        /* never let this affect the page */
      }
    })();
    // A tab left open past midnight and brought back is a visit on the new day.
    const onVisible = () => {
      if (report && document.visibilityState === "visible") reportSeen();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [report]);
  return null;
}
