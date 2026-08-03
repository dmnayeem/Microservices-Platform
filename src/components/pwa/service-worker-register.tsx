"use client";

import { useEffect } from "react";
import { APP_REFRESH_EVENT } from "@/hooks/use-app-refresh";

/**
 * Registers the service worker (/sw.js) and drives a GENTLE update flow so new
 * deploys reach installed PWAs without a surprise mid-use reload:
 *  - periodically checks for a new SW (focus + ~20 min timer),
 *  - when a new version is waiting, applies it only at a safe moment — on
 *    pull-to-refresh (`app:refresh`) or on reopen-from-background (hidden > 60s) —
 *  - reloads exactly once, and only for an update (never on first install).
 * Also enables web-push. Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Only reload for an UPDATE (a controller already existed at load); this
    // avoids the first-install `clients.claim()` controllerchange reload.
    const hadController = !!navigator.serviceWorker.controller;
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
