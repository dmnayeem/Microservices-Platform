"use client";

import { ENGAGED_EVENT } from "@/lib/header-data";
import { useEffect, useState } from "react";
import { Download, Share, Plus, X, MoreVertical } from "lucide-react";

const SNOOZE_KEY = "pwa_install_snooze";
const SNOOZE_MS = 24 * 60 * 60 * 1000; // re-prompt non-installers after ~1 day

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    /** Caught by the inline script in app/layout.tsx, before hydration. */
    __egBip?: BeforeInstallPromptEvent | null;
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports as Mac; detect touch Macs too.
  const iPadOS =
    navigator.platform === "MacIntel" &&
    (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1;
  return iOSDevice || iPadOS;
}

const isAndroid = () => typeof navigator !== "undefined" && /android/i.test(navigator.userAgent || "");

/**
 * Recurring, cross-platform "Install app" prompt.
 * - Android / desktop Chrome & Edge: one tap on Install opens the browser's
 *   own install dialog. The `beforeinstallprompt` event is caught by an inline
 *   script before hydration (layout.tsx) — listening only from here missed it,
 *   which is why Install never worked.
 * - Android without that event (Samsung Internet, Firefox, or Chrome after a
 *   dismissal): the browser menu steps.
 * - iOS: Apple gives websites no install API at all, so it is the Share →
 *   Add to Home Screen steps.
 * Never shown once installed, suppressed on /admin, snoozed ~1 day after a
 * dismissal.
 */
export function PwaInstallPrompt({
  enabled = true,
  rewardPoints = 0,
}: {
  enabled?: boolean;
  /** App-install bonus on offer to this user (0 = none) — see lib/pwa-install.ts. */
  rewardPoints?: number;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (isStandalone()) return; // already installed
    if ((window.location.pathname || "").startsWith("/admin")) return;

    const snoozed = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    if (Date.now() - snoozed < SNOOZE_MS) return;

    const take = () => {
      if (!window.__egBip) return;
      setDeferred(window.__egBip);
      setShow(true);
    };
    const onBIP = (e: Event) => {
      e.preventDefault();
      window.__egBip = e as BeforeInstallPromptEvent;
      take();
    };
    const onInstalled = () => {
      window.__egBip = null;
      setShow(false);
      setDeferred(null);
    };

    // The event may already have fired before this mounted.
    take();
    window.addEventListener("eg-bip", take);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    // No install event on iOS ever, and on some Android browsers — show the
    // manual steps after a short delay instead.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const p = isIos() ? "ios" : isAndroid() ? "android" : "other";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(p);
    if (p !== "other") {
      timer = setTimeout(() => setShow(true), p === "ios" ? 8000 : 12000);
    }

    return () => {
      window.removeEventListener("eg-bip", take);
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  // Starting a task: offer the app too, a little after the notification ask
  // so the two never open on top of each other.
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onEngaged = () => {
      if (isStandalone()) return;
      const snoozed = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
      if (Date.now() - snoozed < SNOOZE_MS) return;
      if (window.__egBip) setDeferred(window.__egBip);
      if (t) clearTimeout(t);
      t = setTimeout(() => setShow(true), 15000);
    };
    window.addEventListener(ENGAGED_EVENT, onEngaged);
    return () => {
      window.removeEventListener(ENGAGED_EVENT, onEngaged);
      if (t) clearTimeout(t);
    };
  }, [enabled]);

  const snoozeAndClose = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") {
        window.__egBip = null;
        setShow(false);
        return;
      }
    } catch {
      /* ignore */
    }
    // The event can be used once; after a "no" only the steps remain.
    window.__egBip = null;
    setDeferred(null);
    snoozeAndClose();
  };

  if (!enabled || !show) return null;

  const step = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-(--app-surface-2) text-(--app-ink) font-semibold";

  return (
    <div className="fixed bottom-[calc(var(--bottom-nav-h,0px)+1rem)] md:bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-1.5rem)]">
      <div className="rounded-2xl border border-(--app-accent-edge)/40 bg-(--app-surface) p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/app-icon/192"
            alt="RevType"
            className="w-11 h-11 rounded-xl shrink-0 border border-white/10"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Install RevType</p>
            <p className="text-xs text-(--app-ink-2) mt-0.5">
              Open it from your home screen like an app — full screen, signed
              in, always up to date.
            </p>
            {rewardPoints > 0 && (
              <p className="text-xs font-semibold text-emerald-400 mt-1">
                Install the app and get {rewardPoints.toLocaleString()} points.
              </p>
            )}
          </div>
          <button
            onClick={snoozeAndClose}
            className="p-1.5 rounded-lg text-(--app-ink-3) hover:text-(--app-ink) hover:bg-white/10 shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {deferred ? (
          <div className="flex gap-2 mt-3">
            <button
              onClick={snoozeAndClose}
              className="flex-1 py-2 rounded-lg bg-(--app-surface-2) text-(--app-ink) text-xs font-semibold hover:bg-(--app-surface-hover)"
            >
              Not now
            </button>
            <button
              onClick={install}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) text-white text-xs font-bold hover:opacity-90"
            >
              <Download className="w-4 h-4" />
              Install
            </button>
          </div>
        ) : platform === "ios" ? (
          // Apple offers websites no install button — these are the only steps.
          <ol className="mt-3 space-y-2 rounded-xl bg-(--app-page)/70 border border-(--app-line) px-3 py-2.5 text-xs text-(--app-ink-2)">
            <li className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-(--app-ink)">1.</span> Tap
              <span className={step}>
                <Share className="w-3.5 h-3.5 text-sky-400" /> Share
              </span>
              in the browser bar
            </li>
            <li className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-(--app-ink)">2.</span> Scroll and tap
              <span className={step}>
                <Plus className="w-3.5 h-3.5 text-emerald-400" /> Add to Home Screen
              </span>
            </li>
            <li className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-(--app-ink)">3.</span> Tap
              <span className={step}>Add</span>— RevType appears on your home screen
            </li>
          </ol>
        ) : (
          // Android browsers that do not offer the one-tap install.
          <ol className="mt-3 space-y-2 rounded-xl bg-(--app-page)/70 border border-(--app-line) px-3 py-2.5 text-xs text-(--app-ink-2)">
            <li className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-(--app-ink)">1.</span> Tap the browser menu
              <span className={step}>
                <MoreVertical className="w-3.5 h-3.5" />
              </span>
            </li>
            <li className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-(--app-ink)">2.</span> Tap
              <span className={step}>
                <Download className="w-3.5 h-3.5 text-emerald-400" /> Install app
              </span>
              or
              <span className={step}>Add to Home screen</span>
            </li>
          </ol>
        )}
      </div>
    </div>
  );
}
