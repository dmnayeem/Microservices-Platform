"use client";

import { useEffect, useRef } from "react";

/** Global "refresh now" signal — fired by the app-wide pull-to-refresh. */
export const APP_REFRESH_EVENT = "app:refresh";

/** Programmatically fire the global app-refresh signal. */
export function triggerAppRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(APP_REFRESH_EVENT));
  }
}

/**
 * Subscribe a callback to the global app-refresh signal so a client surface
 * re-pulls its own data when the user pulls-to-refresh anywhere in the app.
 * The latest `cb` is always used (no need to memoize it).
 */
export function useAppRefresh(cb: () => void) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(APP_REFRESH_EVENT, handler);
    return () => window.removeEventListener(APP_REFRESH_EVENT, handler);
  }, []);
}
