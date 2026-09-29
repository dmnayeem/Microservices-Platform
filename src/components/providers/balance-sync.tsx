"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { announceBalanceChange, BALANCE_EVENT, ENGAGED_EVENT } from "@/lib/header-data";

/**
 * Keeps every balance on screen current without a manual refresh.
 *
 * A reward, a claim or a conversion is a POST to /api/…; the header used to
 * learn about it only on its 60-second poll, so the number sat still until the
 * user pulled to refresh. This watches the app's own fetches: after a
 * successful write to an endpoint that can move a balance (BALANCE_WRITES) it
 * announces a balance change (debounced), the header and tab bar re-read
 * /api/header, and the server-rendered balance pages re-render.
 */

// Writes that can move the viewer's balance. An ALLOW-list: this used to fire
// on every successful POST outside a short ignore list — ad impressions and
// clicks, beacons, notification reads, chat — and each one re-read /api/header
// and re-rendered the whole balance page on the server (several database
// round trips) for a write that could not have changed a number.
//
// Adding an endpoint that credits or debits the viewer? Add it here, or call
// announceBalanceChange() after it. Missing one only means the number waits
// for the header's own poll; nothing is credited or lost either way.
const BALANCE_WRITES: RegExp[] = [
  // Claims and rewards
  /^\/api\/(achievements|milestones|missions|events)\/[^/]+\/claim$/,
  /^\/api\/tasks\/boards\/[^/]+\/claim$/,
  /^\/api\/(daily-mission|solo-reward|browse-earn)\/claim$/,
  /^\/api\/referrals\/daily-claim$/,
  /^\/api\/daily-reward$/,
  /^\/api\/ads\/[^/]+\/reward$/,
  // Tasks, quizzes, offers
  /^\/api\/tasks\/[^/]+\/submit$/,
  /^\/api\/tasks\/quiz$/,
  /^\/api\/quizzes\/[^/]+\/attempt$/,
  /^\/api\/(offerwall|cpa)\/offers\/[^/]+\/submit$/,
  /^\/api\/games\/[^/]+\/(ad|session\/end)$/,
  // Wallet
  /^\/api\/wallet\//,
  /^\/api\/withdrawals(\/|$)/,
  /^\/api\/deposits$/,
  /^\/api\/lottery$/,
  // Spending: plans, credits, buyer tasks, advertising, promotion
  /^\/api\/packages\/(purchase|subscription)$/,
  /^\/api\/task-credit\/purchase$/,
  /^\/api\/tasks\/(create|mine)(\/|$)/,
  /^\/api\/advertiser\/(credits|campaigns)(\/|$)/,
  // Marketplace and courses
  /^\/api\/marketplace\/[^/]+\/checkout$/,
  /^\/api\/marketplace\/(orders|deals)(\/|$)/,
  /^\/api\/marketplace\/listings\/[^/]+\/(promote|bids|offers|close-auction)(\/|$)/,
  /^\/api\/cart\/checkout$/,
  /^\/api\/courses\/[^/]+\/(enroll|refund|promote)$/,
  // Feed: social earning (posts, likes, comments, shares, votes), donate, boost
  /^\/api\/feed$/,
  /^\/api\/feed\/[^/]+\/(like|comments|share|vote|donate|boost)$/,
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
          if (url.origin === window.location.origin) {
            if (BALANCE_WRITES.some((r) => r.test(url.pathname))) {
              if (timer) clearTimeout(timer);
              timer = setTimeout(() => announceBalanceChange(), 400);
            }
            // Starting a task is the moment to ask for notifications / install
            // (push-permission-prompt.tsx, pwa-install-prompt.tsx listen).
            if (/^\/api\/(tasks|article-tasks)\/[^/]+\/start$/.test(url.pathname)) {
              window.dispatchEvent(new Event(ENGAGED_EVENT));
            }
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
