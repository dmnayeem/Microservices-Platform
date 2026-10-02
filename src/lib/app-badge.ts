/**
 * The number on the installed app's home-screen icon (Badging API) — the
 * Messenger-style "you have N waiting". Supported by installed apps on
 * Android/Chrome, desktop Chrome/Edge, and iOS 16.4+ home-screen apps once
 * notifications are allowed; a silent no-op everywhere else.
 */
type BadgeNavigator = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

let last: number | null = null;

export function syncAppBadge(count: number): void {
  if (typeof navigator === "undefined") return;
  const n = Math.max(0, Math.floor(count || 0));
  if (n === last) return;
  last = n;
  const nav = navigator as BadgeNavigator;
  try {
    if (n > 0) void nav.setAppBadge?.(n)?.catch(() => {});
    else void nav.clearAppBadge?.()?.catch(() => {});
  } catch {
    /* unsupported — nothing to do */
  }
}
