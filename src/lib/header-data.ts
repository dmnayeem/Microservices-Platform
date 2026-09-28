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

/**
 * "The balance may have changed" — fired after any successful write to the
 * API (a bonus claimed, a check-in, a task submitted, points converted), so the
 * header, the tab bar and balance pages update at once instead of on the next
 * 60-second poll or a manual refresh. See components/providers/balance-sync.
 */
export const BALANCE_EVENT = "rt:balance-changed";

export function announceBalanceChange(): void {
  last = null; // the next fetchHeaderData() goes to the server
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BALANCE_EVENT));
}
