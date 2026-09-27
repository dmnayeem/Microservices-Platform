"use client";

import { useEffect } from "react";
import { APP_REFRESH_EVENT } from "@/hooks/use-app-refresh";

/**
 * Registers the service worker (/sw.js) and drives a GENTLE update flow so new
 * deploys reach installed PWAs without a surprise mid-use reload:
 *  - periodically checks for a new SW (focus + ~20 min timer),
 *  - when a new version is waiting, applies it only at a safe moment — while
 *    the app is still opening (first 15s), on pull-to-refresh (`app:refresh`)
 *    or on reopen-from-background (hidden > 60s) —
 *  - reloads exactly once, and only for an update (never on first install).
 * Also enables web-push. Renders nothing.
 */
export function ServiceWorkerRegister() {
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
                      .filter((k) => k.startsWith("earngpt-"))
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
    let hiddenAt = 0;
    let cleanup = () => {};

    const onControllerChange = () => {
      if (reloading || !hadController) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        const check = () => {
          reg.update().catch(() => {});
        };
        const applyPending = () => {
          if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
        };
        const onFocus = () => check();
        const onAppRefresh = () => applyPending();
        const onVis = () => {
          if (document.visibilityState === "hidden") {
            hiddenAt = Date.now();
            return;
          }
          check();
          // Reopened after being backgrounded a while → apply a pending update.
          if (hiddenAt && Date.now() - hiddenAt > 60_000) applyPending();
        };

        if (reg.waiting && justOpened()) applyPending();
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          next?.addEventListener("statechange", () => {
            if (next.state === "installed" && navigator.serviceWorker.controller && justOpened()) {
              applyPending();
            }
          });
        });
        check();

        const interval = window.setInterval(check, 20 * 60 * 1000);
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
      cleanup();
    };
  }, []);

  return null;
}
