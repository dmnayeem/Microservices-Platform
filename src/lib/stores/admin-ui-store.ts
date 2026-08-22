"use client";

import { create } from "zustand";

/**
 * Admin sidebar collapse state.
 *
 * This used to be `zustand/persist` backed by localStorage, which caused a
 * hydration mismatch on every load: the server has no localStorage so it always
 * rendered the sidebar expanded, while the client rehydrated the persisted value
 * synchronously and rendered it collapsed. Two different trees, so React threw
 * out the server HTML and re-rendered.
 *
 * Now the preference lives in a **cookie**, which the server CAN read — see
 * `SIDEBAR_COOKIE` below and `src/app/admin/layout.tsx`. The layout passes the
 * value down as `initialCollapsed`, so the first render agrees on both sides and
 * there's no flash of the wrong width either.
 *
 * This store only holds the value once the user toggles it *during this page
 * session*. `null` means "not touched yet — use the server's value".
 */

export const SIDEBAR_COOKIE = "admin_sidebar";

interface AdminUIState {
  /** null = untouched this session; fall back to the server-provided value. */
  sidebarCollapsed: boolean | null;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: (currentlyCollapsed: boolean) => void;
}

function writeCookie(collapsed: boolean): void {
  if (typeof document === "undefined") return;
  // A year, site-wide, lax — it's a display preference, not a credential.
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? "1" : "0"}; path=/; max-age=${
    60 * 60 * 24 * 365
  }; samesite=lax`;
}

export const useAdminUI = create<AdminUIState>()((set) => ({
  sidebarCollapsed: null,
  setSidebarCollapsed: (collapsed) => {
    writeCookie(collapsed);
    set({ sidebarCollapsed: collapsed });
  },
  // The caller passes the currently-effective value, because the store itself
  // doesn't know the server default until a component resolves it.
  toggleSidebar: (currentlyCollapsed) => {
    const next = !currentlyCollapsed;
    writeCookie(next);
    set({ sidebarCollapsed: next });
  },
}));

/**
 * The value to render with: the user's in-session choice if they've made one,
 * otherwise whatever the server read from the cookie.
 */
export function useSidebarCollapsed(initialCollapsed: boolean): boolean {
  const stored = useAdminUI((s) => s.sidebarCollapsed);
  return stored ?? initialCollapsed;
}
