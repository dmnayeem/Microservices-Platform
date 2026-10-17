"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { APP_REFRESH_EVENT } from "@/hooks/use-app-refresh";

/**
 * Registers the service worker (/sw.js) and gets every deploy onto installed
 * home-screen apps — including ones installed long ago (owner, 2026-10-17):
 *  - checks for a new build on open, focus, return to the app and every
 *    10 min; a new build takes over by itself (sw.js skipWaiting);
 *  - this page then reloads onto it at a moment that costs nothing: while the
 *    app is still opening (first 15 s), when the member leaves the app, when
 *    they come back after > 60 s, or on pull-to-refresh;
 *  - if they stay in the app, an "Update available" card in the middle of the
 *    screen offers Update now / Later (asks again after 30 min);
 *  - never on first install, and the manifest id is unchanged, so it stays
 *    the same installed app — never a second icon.
 */
export function ServiceWorkerRegister() {
  // "Update available" card — shown when a new build took over while the
  // member is in the middle of using the app.
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // In development, tear the worker down instead of installing it.
    //
    // Turbopack rehashes its chunk URLs on every rebuild and the dev server is
    // restarted constantly, so a cached chunk routinely names a module that no
    // longer exists — which surfaces as "Failed to load chunk …" and a wall of
    // FetchEvent errors that look like application bugs and are not. There is
    // no offline story for a dev server, so nothing is lost.
    //
    // It UNREGISTERS rather than merely skipping registration: a worker
    // installed by an earlier session keeps controlling the page and would go
    // on serving stale chunks forever, since a waiting worker deliberately does
    // not take over on its own. Push still works in dev — `push-client.ts`
    // registers on demand when the user actually enables notifications.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() =>
          typeof caches !== "undefined"
            ? caches
                .keys()
                .then((keys) =>
                  Promise.all(
                    keys
                      .filter((k) => k.startsWith("revtype-") || k.startsWith("earngpt-"))
                      .map((k) => caches.delete(k))
                  )
                )
            : undefined
        )
        .catch(() => {});
      return;
    }

    // Only reload for an UPDATE (a controller already existed at load); this
    // avoids the first-install `clients.claim()` controllerchange reload.
    const hadController = !!navigator.serviceWorker.controller;
    // An update found while the app is still opening is applied straight
    // away: nothing has been typed or scrolled yet, so the one reload costs
    // nothing — and an installed app opens on the new version, not the old.
    const loadedAt = Date.now();
    const justOpened = () => Date.now() - loadedAt < 15_000;
    let reloading = false;
    let updateReady = false;
    let hiddenAt = 0;
    let askTimer = 0;
    let cleanup = () => {};

    const reloadNow = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    // A new build now takes over by itself (sw.js skipWaiting). This page still
    // runs the old code until it reloads, so reload at a moment that costs the
    // member nothing — and if they stay in the app, ask in the middle of the
    // screen (owner, 2026-10-17).
    const onUpdateReady = () => {
      if (updateReady) return;
      updateReady = true;
      if (justOpened() || document.visibilityState === "hidden") {
        reloadNow();
        return;
      }
      // Give them a few seconds, then show the "Update available" card.
      askTimer = window.setTimeout(() => setAsk(true), 4_000);
    };

    const onControllerChange = () => {
      if (!hadController) return;
      onUpdateReady();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        const check = () => {
          reg.update().catch(() => {});
        };
        // A worker from an older build may still be waiting (it predates
        // skipWaiting) — tell it to take over.
        const applyPending = () => {
          if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
        };
        const onFocus = () => check();
        const onAppRefresh = () => {
          if (updateReady) reloadNow();
          else applyPending();
        };
        const onVis = () => {
          if (document.visibilityState === "hidden") {
            hiddenAt = Date.now();
            // Leaving the app with an update ready: reload now, unseen.
            if (updateReady) reloadNow();
            return;
          }
          check();
          // Reopened after being backgrounded a while → apply a pending update.
          if (hiddenAt && Date.now() - hiddenAt > 60_000) {
            if (updateReady) reloadNow();
            else applyPending();
          }
        };

        applyPending();
        check();

        // Often enough that a member who keeps the app open all day still
        // gets the update the same day.
        const interval = window.setInterval(check, 10 * 60 * 1000);
        window.addEventListener("focus", onFocus);
        window.addEventListener(APP_REFRESH_EVENT, onAppRefresh);
        document.addEventListener("visibilitychange", onVis);

        cleanup = () => {
          window.clearInterval(interval);
          window.removeEventListener("focus", onFocus);
          window.removeEventListener(APP_REFRESH_EVENT, onAppRefresh);
          document.removeEventListener("visibilitychange", onVis);
        };
      })
      .catch(() => {
        // ignore registration failures (unsupported / offline)
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.clearTimeout(askTimer);
      cleanup();
    };
  }, []);

  if (!ask) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#11131a] p-5 text-center shadow-2xl">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/15">
          <RefreshCw className="h-6 w-6 text-emerald-400" />
        </div>
        <h2 id="app-update-title" className="text-lg font-bold text-white">
          Update available
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
          A new version of RevType is ready, with the latest features and fixes. It takes a second.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setAsk(false);
              // Ask again in a while if they keep going.
              window.setTimeout(() => setAsk(true), 30 * 60 * 1000);
            }}
            className="flex-1 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
          >
            Update now
          </button>
        </div>
      </div>
    </div>
  );
}
