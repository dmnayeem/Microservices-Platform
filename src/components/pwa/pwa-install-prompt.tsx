"use client";

import { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";

const SNOOZE_KEY = "pwa_install_snooze";
const SNOOZE_MS = 24 * 60 * 60 * 1000; // re-prompt non-installers after ~1 day

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
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

/**
 * Recurring, cross-platform "Install app" prompt.
 * - Android/desktop: uses the captured `beforeinstallprompt` to trigger the
 *   native install.
 * - iOS Safari: shows "Add to Home Screen" instructions (no programmatic API).
 * Never shown once installed (standalone display-mode / navigator.standalone),
 * suppressed on /admin, and snoozed ~1 day after a dismissal.
 */
export function PwaInstallPrompt({ enabled = true }: { enabled?: boolean }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (isStandalone()) return; // already installed
    if ((window.location.pathname || "").startsWith("/admin")) return;

    const snoozed = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    if (Date.now() - snoozed < SNOOZE_MS) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt — show instructions after a delay.
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) {
      setIos(true);
      iosTimer = setTimeout(() => setShow(true), 8000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
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
      await deferred.userChoice;
    } catch {
      /* ignore */
    } finally {
      setDeferred(null);
      snoozeAndClose();
    }
  };

  if (!enabled || !show) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-1.5rem)]">
      <div className="rounded-2xl border border-(--app-accent-edge)/40 bg-linear-to-br from-(--app-rail-a)/15 via-(--app-rail-b)/10 to-gray-900 backdrop-blur-xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt="EarnGPT"
            className="w-11 h-11 rounded-xl shrink-0 border border-white/10"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Install EarnGPT</p>
            <p className="text-xs text-(--app-ink-2) mt-0.5">
              Add the app to your home screen for a faster, full-screen
              experience.
            </p>
          </div>
          <button
            onClick={snoozeAndClose}
            className="p-1.5 rounded-lg text-(--app-ink-3) hover:text-white hover:bg-white/10 shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {ios && !deferred ? (
          // iOS: manual Add-to-Home-Screen instructions
          <div className="mt-3 rounded-xl bg-(--app-page)/70 border border-(--app-line) px-3 py-2.5 text-xs text-(--app-ink-2)">
            <p className="inline-flex items-center gap-1.5 flex-wrap">
              Tap
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-(--app-surface-2) text-(--app-ink) font-semibold">
                <Share className="w-3.5 h-3.5 text-sky-400" /> Share
              </span>
              then
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-(--app-surface-2) text-(--app-ink) font-semibold">
                <Plus className="w-3.5 h-3.5 text-emerald-400" /> Add to Home Screen
              </span>
            </p>
          </div>
        ) : (
          <div className="flex gap-2 mt-3">
            <button
              onClick={snoozeAndClose}
              className="flex-1 py-2 rounded-lg bg-(--app-surface-2) text-(--app-ink) text-xs font-semibold hover:bg-(--app-surface-2)"
            >
              Not now
            </button>
            <button
              onClick={install}
              disabled={!deferred}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-linear-to-r from-(--app-grad-a) to-(--app-grad-b) text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Install
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
