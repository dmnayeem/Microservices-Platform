// RevType service worker - web-push notifications + minimal offline shell +
// runtime asset caching for offline depth.
//
// BUILD is stamped by deploy.sh (it replaces __BUILD_ID__ in the copy Caddy
// serves). Every deploy is therefore a new service worker, and activate()
// below deletes the previous build's caches - nothing stale outlives a deploy.
// In dev the placeholder stays, which simply means one fixed cache name.
const BUILD = "__BUILD_ID__";
const CACHE = "revtype-shell-" + BUILD;
// Separate cache for hashed static assets / images / fonts served
// stale-while-revalidate. Kept apart from the shell so a shell bump doesn't
// throw away already-fetched bundles.
const RUNTIME = "revtype-runtime-" + BUILD;
// Soft cap so the runtime cache can't grow unbounded on a long session.
const RUNTIME_MAX_ENTRIES = 160;
// When a page can't be reached we used to show the cached LANDING page for
// every URL, so a member on a mobile network whose DNS can't find revtype.com
// (DNS_PROBE_FINISHED_NXDOMAIN) saw the landing page, tapped Log in, and got
// the landing page again — "it just reloads" (owner, 2026-10-15). Now they get
// this page, built here so it needs no network at all, saying what is wrong
// and how to fix it on their phone.
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RevType</title>
<style>
body{margin:0;background:#0b1210;color:#e8f2ee;font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:440px;margin:0 auto;padding:18vh 20px 40px;text-align:center}
.spin{width:38px;height:38px;margin:0 auto 18px;border:3px solid #1f302a;border-top-color:#3ee6a4;border-radius:50%;animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
h1{font-size:19px;margin:0 0 6px}p{margin:6px 0;color:#9fb3ab}
#help{display:none;text-align:left;margin-top:26px}
.card{background:#111c18;border:1px solid #1f302a;border-radius:14px;padding:12px 14px;margin-top:10px}
.card b{color:#fff}code{background:#14211c;border:1px solid #23362e;border-radius:6px;padding:1px 6px;color:#3ee6a4}
button{margin-top:18px;width:100%;min-height:46px;border:0;border-radius:12px;background:#3ee6a4;color:#04140d;font-weight:800;font-size:15px}
</style></head><body><main>
<div class="spin"></div>
<h1>Reconnecting to RevType…</h1>
<p id="msg">Your connection dropped for a moment. This page opens by itself as soon as you're back online.</p>
<div id="help">
<p>Still not loading? Your mobile network may be having trouble. Wi-Fi works, or switch your phone to a public DNS once:</p>
<div class="card"><b>Android:</b> Settings → Private DNS → <code>dns.google</code> → Save</div>
<div class="card"><b>Chrome:</b> Settings → Privacy and security → Use secure DNS → Google</div>
<div class="card"><b>iPhone:</b> the free <b>1.1.1.1</b> app → switch it on</div>
<button onclick="location.reload()">Try again</button>
</div>
<script>
// Keep trying quietly; open the page the moment RevType answers again.
var tries=0;
function check(){
  fetch("/api/health",{cache:"no-store"}).then(function(r){ if(r.ok){ location.reload(); } else { next(); } }).catch(next);
}
function next(){
  tries++;
  if(tries===3){ document.getElementById("help").style.display="block"; }
  setTimeout(check, tries<3?3000:6000);
}
setTimeout(check, 2500);
window.addEventListener("online", check);
</script>
</main></body></html>`;

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// A new build takes over AT ONCE (owner, 2026-10-17: "the app never
// updates"). It used to wait for a "safe moment" the page had to announce —
// and a home-screen app opened long ago runs that OLD page code, which may
// never announce anything, so new builds sat in "waiting" forever: members
// kept an old app (no notifications, no red counts) unless they uninstalled.
// Taking over is safe here: page loads are network-first and assets are
// fingerprinted, so the new worker serves the new site. The PAGE decides when
// to reload (service-worker-register.tsx: while hidden, on reopen, or via the
// "Update available" card) — no surprise reload in the middle of typing.
self.addEventListener("install", (event) => {
  // The offline page is built in this file (OFFLINE_HTML) — nothing to fetch.
  event.waitUntil(caches.open(CACHE).catch(() => {}).then(() => self.skipWaiting()));
});

// The page tells a waiting SW to take over (after pull-to-refresh / reopen). The
// resulting `controllerchange` triggers a single guarded reload on the client.
// The app-icon number is notifications + tasks waiting. A push only knows the
// notifications, so the open app tells the SW how many tasks are waiting and
// the SW adds them when a push arrives with the app closed.
const BADGE_CACHE = "eg-badge-v1";
function readTaskBadge() {
  return caches
    .open(BADGE_CACHE)
    .then((c) => c.match("/__badge"))
    .then((r) => (r ? r.json() : { tasks: 0 }))
    .then((d) => Math.max(0, Number(d.tasks) || 0))
    .catch(() => 0);
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data === "SKIP_WAITING" || (data && data.type === "SKIP_WAITING")) {
    self.skipWaiting();
  }
  if (data && data.type === "BADGE_BASE") {
    const tasks = Math.max(0, Math.floor(Number(data.tasks) || 0));
    event.waitUntil(
      caches
        .open(BADGE_CACHE)
        .then((c) => c.put("/__badge", new Response(JSON.stringify({ tasks }))))
        .catch(() => {})
    );
  }
});

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE, RUNTIME, BADGE_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        // Keep the PREVIOUS build's runtime cache one more round: a page still
        // running the old build (member pressed "Later" on the update card)
        // keeps the chunks it already fetched. Older ones go.
        const olderRuntimes = keys.filter((k) => k.startsWith("revtype-runtime-") && k !== RUNTIME);
        const previous = olderRuntimes[olderRuntimes.length - 1];
        if (previous) keep.add(previous);
        return Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      })
      .then(() => self.clients.claim())
  );
});

// Should this GET be served stale-while-revalidate from the runtime cache?
// Only same-origin, cache-friendly assets: Next's hashed build output, fonts,
// PWA icons and images. Everything else (API, HTML docs, range media) is left
// to the network so we never serve stale data or break streaming.
const IS_DEV_HOST =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname === "[::1]";

function isRuntimeAsset(url, req) {
  if (url.origin !== self.location.origin) return false;
  if (req.headers.has("range")) return false;
  // Dev builds rehash their chunk URLs on every rebuild and the dev server is
  // restarted constantly, so a cached chunk routinely outlives the module it
  // names — producing "Failed to load chunk" for a file that no longer exists.
  // There is no offline story for a dev server, so there is nothing to trade.
  if (IS_DEV_HOST) return false;
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
//
// EVERY path here must resolve to a real Response. `respondWith()` takes what
// this returns, and handing it `undefined` throws
// "Failed to convert value to 'Response'" — which is what happened on a cache
// MISS while the network was down: `cached` was undefined, the catch returned
// that same undefined, and the whole request died inside the service worker
// instead of failing like a normal network error. That is precisely the offline
// case this function exists to handle, so it was broken exactly when it
// mattered. `Response.error()` is the honest answer: it surfaces to the page as
// an ordinary network failure that the app's own error handling can see.
// A JS / CSS chunk that fails once is retried before the page is told it
// failed. On Bangladeshi mobile data the first try often dies in transit (a
// carrier that breaks HTTP/3-over-UDP, a dropped radio link); Chrome then falls
// back to TCP, so a retry a moment later succeeds. One failed chunk used to be
// "ChunkLoadError — Something went wrong" for the whole app.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchWithRetry(req, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(req, i === 0 ? undefined : { cache: "reload" });
      // A server error is worth another go; anything else is the answer.
      if (res.status < 500 || i === tries - 1) return res;
      last = res;
    } catch (e) {
      last = e;
      if (i === tries - 1) throw e;
    }
    await sleep(i === 0 ? 400 : 1200);
  }
  if (last instanceof Response) return last;
  throw last;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(req);
  const network = fetchWithRetry(req)
    .then((res) => {
      if (res && res.ok && res.type === "basic") {
        // No unhandled rejection: a full quota makes cache.put throw, and an
        // unhandled rejection inside a SW is a console error on every asset.
        cache.put(req, res.clone()).then(trimRuntime).catch(() => {});
      }
      return res;
    })
    .catch(() => cached || Response.error());
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
      // A failed load is often a blip on mobile data — try twice more before
      // showing anything; the page then keeps retrying by itself.
      fetch(req)
        .catch(() => new Promise((r) => setTimeout(r, 700)).then(() => fetch(req)))
        .catch(() => new Promise((r) => setTimeout(r, 1500)).then(() => fetch(req)))
        .catch(() => offlineResponse())
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
    // Belt and braces: even if the helper is later changed to resolve to
    // something falsy, the page gets a Response rather than a SW TypeError.
    event.respondWith(
      staleWhileRevalidate(req).then((res) => res || Response.error())
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "RevType", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "RevType";
  const options = {
    body: data.body || "",
    // The admin's current home-screen icon. /icon-192.png is the old stock
    // artwork (a purple sparkle), which every push was still showing.
    icon: "/app-icon/192",
    // White-on-transparent mark for the status bar. A full-colour square here
    // is drawn by Android as a plain white square.
    badge: "/app-icon/badge",
    timestamp: Date.now(),
    data: { url: data.url || "/" },
  };
  if (data.image) options.image = data.image;
  // Mark the app icon even while the app is closed: the exact count when the
  // server sent one, otherwise a plain "something new" dot. The app replaces
  // it with the real unread number the next time it opens.
  // Unread notifications (sent by the server) + tasks waiting (last told by
  // the app). Without a server count: tasks + this one notification.
  const badge =
    self.navigator && self.navigator.setAppBadge
      ? readTaskBadge()
          .then((tasks) =>
            typeof data.badgeCount === "number"
              ? self.navigator.setAppBadge(data.badgeCount + tasks)
              : self.navigator.setAppBadge(tasks + 1)
          )
          .catch(() => {})
      : Promise.resolve();
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), badge]));
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
