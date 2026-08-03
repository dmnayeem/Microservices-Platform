// EarnGPT service worker — web-push notifications + minimal offline shell.
const CACHE = "earngpt-shell-v2";
const OFFLINE_URL = "/";

// Precache the app shell for an offline navigation fallback. We intentionally do
// NOT call skipWaiting() here: on first install there is no controller so this SW
// activates immediately anyway, but for an UPDATE it stays "waiting" until the
// client applies it at a safe moment (pull-to-refresh / reopen) — see the
// SKIP_WAITING message below. This prevents surprise mid-use reloads.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => {})
  );
});

// The page tells a waiting SW to take over (after pull-to-refresh / reopen). The
// resulting `controllerchange` triggers a single guarded reload on the client.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data === "SKIP_WAITING" || (data && data.type === "SKIP_WAITING")) {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// A fetch handler is REQUIRED for Chrome to fire beforeinstallprompt.
// We only handle top-level navigations: network-first with an offline fallback.
// Hashed static assets are left to the browser to avoid serving stale bundles.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(() =>
      caches.match(OFFLINE_URL).then((res) => res || Response.error())
    )
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "EarnGPT", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "EarnGPT";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
