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
let lastTasks: number | null = null;

/**
 * The icon number = unread notifications + tasks waiting. `tasks` is also
 * handed to the service worker, so a push that arrives while the app is closed
 * keeps the tasks in the number instead of replacing them.
 */
export function syncAppBadge(count: number, tasks = 0): void {
  if (typeof navigator === "undefined") return;
  const t = Math.max(0, Math.floor(tasks || 0));
  if (t !== lastTasks) {
    lastTasks = t;
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: "BADGE_BASE", tasks: t });
    } catch {
      /* no service worker — nothing to remember */
    }
  }
  const n = Math.max(0, Math.floor(count || 0)) + t;
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
