"use client";

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

export function CookieConsent({ enabled = true }: { enabled?: boolean }) {
  const [show, setShow] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!saved) setShow(true);
  }, [enabled]);

  const persist = (p: Prefs) => {
    const previous = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
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
        <div className="rounded-2xl border border-gray-700 bg-gray-900/95 backdrop-blur-xl p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="text-2xl shrink-0">🍪</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white mb-1">
                We use cookies
              </p>
              <p className="text-xs text-gray-400">
                We use cookies to improve your experience, analyze traffic, and
                personalize content. You can customize your preferences anytime.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              onClick={acceptAll}
              className="flex-1 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold"
            >
              Accept All
            </button>
            <button
              onClick={rejectAll}
              className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold"
            >
              Reject All
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="w-full sm:w-auto py-2 px-3 rounded-lg text-indigo-400 hover:text-indigo-300 text-xs font-semibold"
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
            className="rounded-2xl bg-gray-900 border border-gray-800 p-5 max-w-md w-full"
          >
            <div className="flex items-center gap-2 mb-4">
              <Cookie className="w-5 h-5 text-amber-400" />
              <p className="text-base font-bold text-white flex-1">
                Cookie Preferences
              </p>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-500 hover:text-white"
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
                    "flex items-start gap-3 p-3 rounded-lg border border-gray-800 bg-gray-950 cursor-pointer",
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
                    className="mt-0.5 accent-indigo-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">{row.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{row.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => persist(prefs)}
                className="flex-1 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-semibold"
              >
                Save Preferences
              </button>
              <button
                onClick={acceptAll}
                className="flex-1 py-2.5 rounded-lg bg-indigo-500 text-white text-sm font-bold"
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
