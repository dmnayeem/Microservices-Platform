"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { announceBalanceChange, BALANCE_EVENT } from "@/lib/header-data";

/**
 * Keeps every balance on screen current without a manual refresh.
 *
 * A reward, a claim or a conversion is a POST to /api/…; the header used to
 * learn about it only on its 60-second poll, so the number sat still until the
 * user pulled to refresh. This watches the app's own fetches: after a
 * successful write it announces a balance change (debounced), the header and
 * tab bar re-read /api/header, and the server-rendered balance pages re-render.
 */

// Writes that can never move a balance and fire constantly.
const IGNORE = [
  /^\/api\/header/,
  /^\/api\/analytics\//,
  /^\/api\/feed\/views/,
  /^\/api\/feed\/pulse/,
  /^\/api\/popups\//,
  /^\/api\/blog\//,
  /^\/api\/device\//,
  /^\/api\/push\//,
  /\/heartbeat$/,
  /\/progress$/,
  /^\/api\/notifications\/popups/,
];

// Pages whose balance is rendered on the server and needs a re-render.
const BALANCE_PAGES = /^\/(dashboard|wallet|earn|lottery|daily-mission|missions|events)(\/|$)/;

let installed = false;

export function BalanceSync() {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (installed || typeof window === "undefined") return;
    installed = true;
    const original = window.fetch.bind(window);
    let timer: ReturnType<typeof setTimeout> | null = null;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await original(input, init);
      try {
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (method !== "GET" && method !== "HEAD" && res.ok) {
          const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          const url = new URL(raw, window.location.origin);
          if (url.origin === window.location.origin && url.pathname.startsWith("/api/") && !IGNORE.some((r) => r.test(url.pathname))) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => announceBalanceChange(), 400);
          }
        }
      } catch {
        /* never let the watcher break a request */
      }
      return res;
    };
  }, []);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (!BALANCE_PAGES.test(pathRef.current || "")) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => router.refresh(), 300);
    };
    window.addEventListener(BALANCE_EVENT, onChange);
    return () => window.removeEventListener(BALANCE_EVENT, onChange);
  }, [router]);

  return null;
}
