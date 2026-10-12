"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * "Opened from the home screen, but in a browser tab" — the app was added as a
 * plain SHORTCUT, not installed. That is the address bar members see in "the
 * app": Chrome makes a shortcut instead of a real app when it may not install
 * one (Xiaomi / Redmi / POCO without the "Home screen shortcuts" permission,
 * Chrome under an app lock, other browsers). Detected by the home-screen start
 * URL (`?source=pwa`, see app/manifest.ts) arriving in a non-standalone window;
 * offers the real install, and tells MIUI users which switch to turn on.
 */

const DISMISS_KEY = "rt:shortcut-banner-dismissed-at";
const SNOOZE_MS = 3 * 24 * 3_600_000;

type Bip = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function ShortcutInstallBanner() {
  const [show, setShow] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [xiaomi, setXiaomi] = useState(false);

  useEffect(() => {
    try {
      const fromHome = new URLSearchParams(window.location.search).get("source") === "pwa";
      if (!fromHome || isStandalone()) return;
      const at = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
      if (at && Date.now() - at < SNOOZE_MS) return;
    } catch {
      return;
    }
    const ua = navigator.userAgent || "";
    const sync = () => setCanInstall(!!(window as Window & { __egBip?: Bip | null }).__egBip);
    // Deferred so the state updates are not synchronous in the effect body.
    const t = window.setTimeout(() => {
      setXiaomi(/xiaomi|redmi|poco|miui|\bmi \d/i.test(ua));
      sync();
      setShow(true);
    }, 0);
    window.addEventListener("eg-bip", sync);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("eg-bip", sync);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* private mode — just hide */
    }
    setShow(false);
  };

  const install = async () => {
    const e = (window as Window & { __egBip?: Bip | null }).__egBip;
    if (!e) return;
    await e.prompt().catch(() => {});
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Install the full app"
      className="fixed inset-x-3 z-[95] rounded-2xl border border-emerald-500/40 bg-[#0d1512] p-4 text-white shadow-2xl"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)" }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close"
        className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full text-white/60 hover:bg-white/10"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="pr-8 text-[15px] font-bold">Get the full RevType app — no address bar</p>
      <p className="mt-1 text-[13px] leading-snug text-white/75">
        Your home-screen icon opens RevType in a browser tab. Install the app once and it opens full screen, like any
        other app. Then remove the old icon.
      </p>
      {xiaomi && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12.5px] leading-snug text-amber-200">
          Xiaomi / Redmi / POCO: open <b>Settings → Apps → Chrome → Other permissions</b> and allow{" "}
          <b>Home screen shortcuts</b>, then install again.
        </p>
      )}
      {canInstall ? (
        <button
          type="button"
          onClick={install}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-black text-black"
        >
          <Download className="h-4 w-4" /> Install the app
        </button>
      ) : (
        <p className="mt-3 text-[13px] text-white/80">
          In Chrome tap <b>⋮</b> (top right) → <b>Install app</b>.
        </p>
      )}
    </div>
  );
}
