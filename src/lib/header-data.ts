"use client";

/** What /api/header returns: the numbers the app chrome shows. */
export interface HeaderData {
  points?: number;
  streak?: number;
  level?: number;
  unreadCount?: number;
}

let last: { at: number; p: Promise<HeaderData | null> } | null = null;

/**
 * One /api/header request shared by everything that asks within a few
 * seconds. The header and the mobile tab bar both poll it, so every page load
 * on a phone sent the same request twice.
 */
export function fetchHeaderData(): Promise<HeaderData | null> {
  if (last && Date.now() - last.at < 3000) return last.p;
  const p = fetch("/api/header", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<HeaderData>) : null))
    .catch(() => null);
  last = { at: Date.now(), p };
  return p;
}
