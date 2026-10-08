"use client";

import { lsGet, lsRemove, lsSet } from "@/lib/safe-storage";
import { REGION_STORAGE_KEY, REGION_TTL_MS } from "@/lib/consent-region";
import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";
import { cn } from "@/lib/utils";

import { CONSENT_STORAGE_KEY } from "@/lib/ad-consent";

/**
 * Shared with `src/lib/ad-consent.ts`, which is the only reader.
 *
 * Until that module existed this banner wrote a preference nothing consulted —
 * "Reject All" changed nothing at all. The `marketing` value now decides whether
 * Google's slots request personalised or non-personalised ads.
 *
 * A change made here only takes effect on the next ad request, so the page is
 * reloaded after saving; a slot that has already been pushed cannot be re-asked.
 */
const STORAGE_KEY = CONSENT_STORAGE_KEY;

interface Prefs {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
}

const DEFAULT_PREFS: Prefs = {
  essential: true,
  analytics: true,
  marketing: false,
  functional: true,
};

/**
 * Does this visitor need the banner? Only in the EU/EEA, UK and Switzerland
 * (src/lib/consent-region.ts). Asked once and cached for a week; if the
 * question can't be answered, a Europe/* time zone decides — when unsure,
 * asking is the safe side.
 */
async function needsBanner(): Promise<boolean> {
  try {
    const cached = JSON.parse(lsGet(REGION_STORAGE_KEY) || "null") as { consent?: boolean; at?: number } | null;
    if (cached && typeof cached.consent === "boolean" && Date.now() - (cached.at ?? 0) < REGION_TTL_MS) {
      return cached.consent;
    }
  } catch {
    /* unreadable — ask again */
  }
  let consent: boolean;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch("/api/geo/region", { signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    const d = (await r.json()) as { consent?: boolean };
    if (typeof d.consent !== "boolean") throw new Error("bad answer");
    consent = d.consent;
  } catch {
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      /* no Intl */
    }
    consent = tz.startsWith("Europe/") || tz === "Atlantic/Reykjavik" || tz === "Atlantic/Canary";
  }
  lsSet(REGION_STORAGE_KEY, JSON.stringify({ consent, at: Date.now() }));
  return consent;
}

/** Everything on — the automatic consent outside the banner region. */
const AUTO_ALL_ON = { essential: true, analytics: true, marketing: true, functional: true, auto: true } as const;

export function CookieConsent({ enabled = true }: { enabled?: boolean }) {
  const [show, setShow] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  // Outside the EU/EEA, UK and Switzerland there is no banner: analytics,
  // pixels and personalised ads are on, recorded as an automatic consent that
  // every reader (SiteTracking, ad-consent) already understands. A choice the
  // visitor made themselves is never overwritten. Inside the region the banner
  // asks as before — and an automatic consent from elsewhere doesn't count there.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    void needsBanner().then((ask) => {
      if (cancelled) return;
      const raw = lsGet(STORAGE_KEY);
      let auto = false;
      try {
        auto = !!raw && (JSON.parse(raw) as { auto?: boolean }).auto === true;
      } catch {
        /* unreadable — treat as no choice */
      }
      if (!ask) {
        if (!raw) {
          lsSet(STORAGE_KEY, JSON.stringify(AUTO_ALL_ON));
          window.dispatchEvent(new Event("eg-consent"));
        }
        return;
      }
      if (auto) {
        lsRemove(STORAGE_KEY);
        window.dispatchEvent(new Event("eg-consent"));
      }
      if (enabled && (!raw || auto)) setShow(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const persist = (p: Prefs) => {
    const previous = lsGet(STORAGE_KEY);
    lsSet(STORAGE_KEY, JSON.stringify(p));
    // Tracking tags (SiteTracking) wait for this to load without a reload.
    window.dispatchEvent(new Event("eg-consent"));
    setShow(false);
    setShowModal(false);
    // Ad slots read the marketing preference once, before their first request.
    // Changing it after ads have loaded only matters from the next page view, so
    // a *change* (not the first choice) reloads to make it take effect now.
    if (previous) {
      try {
        const before = JSON.parse(previous) as Partial<Prefs>;
        if (before?.marketing !== p.marketing) window.location.reload();
      } catch {
        /* unreadable previous value — nothing to compare */
      }
    }
  };

  const acceptAll = () =>
    persist({ essential: true, analytics: true, marketing: true, functional: true });
  const rejectAll = () =>
    persist({ essential: true, analytics: false, marketing: false, functional: false });

  if (!show) return null;

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-lg w-[calc(100%-2rem)]">
        <div className="rounded-2xl border border-(--app-line) bg-(--app-surface)/95 backdrop-blur-xl p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="text-2xl shrink-0">🍪</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white mb-1">
                We use cookies
              </p>
              <p className="text-xs text-(--app-ink-3)">
                We use cookies to improve your experience, analyze traffic, and
                personalize content. You can customize your preferences anytime.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              onClick={acceptAll}
              className="flex-1 py-2 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-xs font-bold"
            >
              Accept All
            </button>
            <button
              onClick={rejectAll}
              className="flex-1 py-2 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) text-xs font-semibold"
            >
              Reject All
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="w-full sm:w-auto py-2 px-3 rounded-lg text-(--app-accent-ink) hover:text-(--app-accent-ink) text-xs font-semibold"
            >
              Customize →
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl bg-(--app-surface) border border-(--app-line) p-5 max-w-md w-full"
          >
            <div className="flex items-center gap-2 mb-4">
              <Cookie className="w-5 h-5 text-amber-400" />
              <p className="text-base font-bold text-white flex-1">
                Cookie Preferences
              </p>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-(--app-ink-3) hover:text-(--app-ink)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {(
                [
                  {
                    key: "essential",
                    label: "Essential",
                    desc: "Required for the site to function. Cannot be disabled.",
                    disabled: true,
                  },
                  {
                    key: "analytics",
                    label: "Analytics",
                    desc: "Help us understand how you use the site.",
                    disabled: false,
                  },
                  {
                    key: "marketing",
                    label: "Marketing",
                    desc: "Personalized ads and promotions.",
                    disabled: false,
                  },
                  {
                    key: "functional",
                    label: "Functional",
                    desc: "Remember preferences like theme and language.",
                    disabled: false,
                  },
                ] as const
              ).map((row) => (
                <label
                  key={row.key}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border border-(--app-line) bg-(--app-page) cursor-pointer",
                    row.disabled && "opacity-70 cursor-not-allowed"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={prefs[row.key]}
                    disabled={row.disabled}
                    onChange={(e) =>
                      setPrefs({ ...prefs, [row.key]: e.target.checked })
                    }
                    className="mt-0.5 accent-(--app-cta)"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">{row.label}</p>
                    <p className="text-xs text-(--app-ink-3) mt-0.5">{row.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => persist(prefs)}
                className="flex-1 py-2.5 rounded-lg bg-(--app-surface-2) text-(--app-ink) text-sm font-semibold"
              >
                Save Preferences
              </button>
              <button
                onClick={acceptAll}
                className="flex-1 py-2.5 rounded-lg bg-(--app-cta) text-(--app-on-cta) text-sm font-bold"
              >
                Accept All
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
