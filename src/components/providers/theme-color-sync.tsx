"use client";

import { useEffect } from "react";

/** Must match --app-page per theme in globals.css (and the root viewport). */
const BAR_COLOR = { dark: "#08120d", light: "#edf2ef" } as const;

/**
 * Paints the phone's status bar / installed-app title bar in the APP's theme.
 *
 * The root viewport's theme-color follows the OS colour scheme, but the app
 * picks its own theme (dark by default) — so a dark app on a phone set to
 * light mode showed a pale status bar above a dark screen. The first
 * theme-color meta in the document wins, so this one is prepended to <head>
 * and kept in step with `html[data-theme]`. Removed on unmount, so pages
 * outside the app shell fall back to the root tags.
 */
export function ThemeColorSync() {
  useEffect(() => {
    const root = document.documentElement;
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    const sync = () => {
      meta.content =
        root.getAttribute("data-theme") === "light" ? BAR_COLOR.light : BAR_COLOR.dark;
    };
    sync();
    document.head.prepend(meta);
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      obs.disconnect();
      meta.remove();
    };
  }, []);
  return null;
}
