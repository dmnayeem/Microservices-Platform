// EarnGPT service worker — web-push notifications + minimal offline shell +
// runtime asset caching for offline depth.
const CACHE = "earngpt-shell-v3";
// Separate cache for hashed static assets / images / fonts served
// stale-while-revalidate. Kept apart from the shell so a shell bump doesn't
// throw away already-fetched bundles.
const RUNTIME = "earngpt-runtime-v3";
// Soft cap so the runtime cache can't grow unbounded on a long session.
const RUNTIME_MAX_ENTRIES = 160;
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
  const keep = new Set([CACHE, RUNTIME]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Should this GET be served stale-while-revalidate from the runtime cache?
// Only same-origin, cache-friendly assets: Next's hashed build output, fonts,
// PWA icons and images. Everything else (API, HTML docs, range media) is left
// to the network so we never serve stale data or break streaming.
function isRuntimeAsset(url, req) {
  if (url.origin !== self.location.origin) return false;
  if (req.headers.has("range")) return false;
  const p = url.pathname;
  if (p.startsWith("/api/")) return false;
  return (
    p.startsWith("/_next/static/") ||
    p.startsWith("/icon-") ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico)$/i.test(p)
  );
}

// Trim the runtime cache to a soft cap (oldest-first — insertion order).
async function trimRuntime() {
  const cache = await caches.open(RUNTIME);
  const keys = await cache.keys();
  if (keys.length <= RUNTIME_MAX_ENTRIES) return;
  for (const k of keys.slice(0, keys.length - RUNTIME_MAX_ENTRIES)) {
    await cache.delete(k);
  }
}

// Stale-while-revalidate: serve the cached copy immediately (if any) and
// refresh it in the background; fall back to the network on a cache miss.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok && res.type === "basic") {
        cache.put(req, res.clone()).then(trimRuntime);
      }
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

// A fetch handler is REQUIRED for Chrome to fire beforeinstallprompt.
// - Top-level navigations: network-first with an offline shell fallback.
// - Hashed static assets / images / fonts: stale-while-revalidate for offline
//   depth (safe because Next fingerprints these URLs, so "stale" never means wrong).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then((res) => res || Response.error())
      )
    );
    return;
  }

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (isRuntimeAsset(url, req)) {
    event.respondWith(staleWhileRevalidate(req));
  }
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
