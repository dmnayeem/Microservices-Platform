"use client";

import { useEffect, useState } from "react";
import { notifyAdScriptLoaded } from "@/lib/ad-measure-client";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { isIncentivisedPath } from "@/lib/ad-placements";
import { hasMarketingConsent } from "@/lib/ad-consent";
import type { PageScriptAd } from "@/lib/ad-serve";
import { markAdPageTainted } from "@/components/providers/ad-nav-guard";
import { AdSlotShell } from "@/components/user/primitives/ad-slot-shell";

/**
 * Site-wide network page scripts — popunder, social bar, in-page push,
 * vignette — the `PAGE_SCRIPT` space.
 *
 * These need the TOP page (they attach to clicks, overlay the viewport or
 * register their own UI), so unlike slot ads they cannot live in a frame. Every
 * rule that keeps them from costing more than they earn is enforced here:
 *
 *  - **Never on an incentivised path.** Same list Google's tags obey. A client
 *    navigation INTO a paid page after one ran is turned into a hard reload by
 *    `AdNavGuard` (this marks the page tainted when it injects).
 *  - **Consent.** Where the cookie banner is in charge, nothing loads without
 *    marketing consent.
 *  - **Google conflict.** A popunder-style network is skipped on a page that
 *    also loads AdSense / Ad Manager, unless the owner allowed it.
 *  - **Frequency cap**, per ad, in this browser: max per day and a minimum gap.
 *    Claimed BEFORE injecting, so a fast double navigation cannot double-fire.
 *    If storage is unavailable a capped ad is not shown at all — an
 *    unenforceable cap is treated as reached.
 *
 * Fetched once per document, after the browser is idle, so it never competes
 * with the page's own first paint.
 */

interface CapState {
  day: string;
  n: number;
  last: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function claimCap(ad: PageScriptAd): boolean {
  const capped = ad.capPerDay != null || ad.minGapMinutes != null;
  if (!capped) return true;
  const key = `ps-cap:${ad.id}`;
  const now = Date.now();
  try {
    let st: CapState = { day: today(), n: 0, last: 0 };
    const raw = localStorage.getItem(key);
    if (raw) {
      const p = JSON.parse(raw) as Partial<CapState>;
      st = {
        day: typeof p.day === "string" ? p.day : today(),
        n: Number(p.n) || 0,
        last: Number(p.last) || 0,
      };
    }
    if (st.day !== today()) st = { day: today(), n: 0, last: st.last };
    if (ad.capPerDay != null && st.n >= ad.capPerDay) return false;
    if (ad.minGapMinutes != null && st.last && now - st.last < ad.minGapMinutes * 60_000) {
      return false;
    }
    localStorage.setItem(key, JSON.stringify({ day: st.day, n: st.n + 1, last: now }));
    return true;
  } catch {
    return false;
  }
}

/** Only `data-*` and `type` survive onto the injected tag. */
function safeAttrs(attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("data-") || k === "type") out[k] = v;
  }
  return out;
}

export function PageScriptAds({
  requireConsent,
  googleActive,
}: {
  requireConsent: boolean;
  /** AdSense / Ad Manager is configured, so Google loads on this page. */
  googleActive: boolean;
}) {
  const pathname = usePathname() ?? "";
  const paid = isIncentivisedPath(pathname);
  const [items, setItems] = useState<PageScriptAd[] | null>(null);

  useEffect(() => {
    if (paid || items !== null) return;
    if (requireConsent && !hasMarketingConsent()) return;
    let cancelled = false;

    const run = () => {
      fetch("/api/spaces/panel?placement=PAGE_SCRIPT")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { scripts?: PageScriptAd[]; withGoogle?: boolean } | null) => {
          if (cancelled) return;
          const list = Array.isArray(d?.scripts) ? d!.scripts : [];
          // Re-check the route: the user may have navigated while this ran.
          if (isIncentivisedPath(window.location.pathname)) return;
          const allowed = list.filter((a) => {
            if (googleActive && a.conflictsWithGoogle && !d?.withGoogle) return false;
            return claimCap(a);
          });
          if (allowed.length > 0) markAdPageTainted();
          setItems(allowed);
        })
        .catch(() => {});
    };

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    let idle: number | null = null;
    let t: ReturnType<typeof setTimeout> | null = null;
    if (w.requestIdleCallback) idle = w.requestIdleCallback(run, { timeout: 4000 });
    else t = setTimeout(run, 1500);
    return () => {
      cancelled = true;
      if (idle !== null) w.cancelIdleCallback?.(idle);
      if (t) clearTimeout(t);
    };
  }, [paid, items, requireConsent, googleActive]);

  if (paid || !items || items.length === 0) return null;

  return (
    <>
      {items.map((a) => (
        <AdSlotShell
          key={a.id}
          className="hidden"
          info={{
            adId: a.id,
            placement: "PAGE_SCRIPT",
            slotKey: `PAGE_SCRIPT:${a.id}`,
            network: a.networkId || "custom",
            type: "PAGE_SCRIPT",
            st: a.st,
          }}
        >
          {a.scripts.map((s, i) =>
            s.src ? (
              <Script
                key={i}
                id={`ps-${a.id}-${i}`}
                src={s.src}
                strategy="afterInteractive"
                {...safeAttrs(s.attrs)}
                // "Script execution" measurement (not a viewable unit).
                onReady={() => notifyAdScriptLoaded(a.id)}
              />
            ) : (
              <Script
                key={i}
                id={`ps-${a.id}-${i}`}
                strategy="afterInteractive"
                {...safeAttrs(s.attrs)}
                onReady={() => notifyAdScriptLoaded(a.id)}
                dangerouslySetInnerHTML={{ __html: s.inline ?? "" }}
              />
            )
          )}
        </AdSlotShell>
      ))}
    </>
  );
}
