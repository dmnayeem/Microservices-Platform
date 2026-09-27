import "dotenv/config";
import fs from "fs";
import path from "path";

/**
 * The service worker's fetch handling.
 *
 * The bug this pins: on a cache MISS while the network was down,
 * `staleWhileRevalidate` resolved to `undefined`, and `event.respondWith(undefined)`
 * throws "Failed to convert value to 'Response'". The request then died inside
 * the worker instead of failing like an ordinary network error — in exactly the
 * offline case the worker exists to handle.
 *
 * sw.js is a plain script, not a module, so it is evaluated here against fake
 * `self` / `caches` / `fetch` globals and the internals are read back out. That
 * is the only way to exercise this logic without a browser, and the logic is
 * worth exercising: it only runs when things have already gone wrong.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-service-worker.ts
 */

const root = process.cwd();
const swSource = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
  }
}

/* ── A minimal Cache Storage / fetch environment ── */

interface FakeCache {
  match(req: unknown): Promise<unknown>;
  put(req: unknown, res: unknown): Promise<void>;
  keys(): Promise<unknown[]>;
  delete(req: unknown): Promise<boolean>;
  add(req: unknown): Promise<void>;
}

function loadSw(opts: {
  hostname: string;
  cached?: unknown;
  fetchImpl: (req: unknown) => Promise<unknown>;
  putThrows?: boolean;
}) {
  const store: Array<[unknown, unknown]> = [];
  const cache: FakeCache = {
    match: async () => opts.cached,
    put: async (req, res) => {
      if (opts.putThrows) throw new Error("QuotaExceeded");
      store.push([req, res]);
    },
    keys: async () => store.map(([k]) => k),
    delete: async () => true,
    add: async () => {},
  };
  const listeners: Record<string, unknown> = {};
  const self = {
    location: { hostname: opts.hostname, origin: `https://${opts.hostname}` },
    addEventListener: (name: string, fn: unknown) => {
      listeners[name] = fn;
    },
    registration: { showNotification: async () => {} },
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
  };
  const caches = {
    open: async () => cache,
    keys: async () => [],
    delete: async () => true,
    match: async () => opts.cached,
  };

  // Evaluate the worker, then hand back the internals under test.
  const factory = new Function(
    "self",
    "caches",
    "fetch",
    "Response",
    "clients",
    `${swSource}\n;return { staleWhileRevalidate, isRuntimeAsset, IS_DEV_HOST };`
  );
  return factory(self, caches, opts.fetchImpl, Response, self.clients) as {
    staleWhileRevalidate: (req: unknown) => Promise<unknown>;
    isRuntimeAsset: (url: URL, req: { headers: Headers }) => boolean;
    IS_DEV_HOST: boolean;
  };
}

const netFails = () => Promise.reject(new Error("offline"));
const netOk = () =>
  Promise.resolve(new Response("fresh", { status: 200 }));

console.log("\n=== Service worker ===\n");

/* ────────────────────────────────────────────────── */
console.log("1. Every path resolves to a real Response");

(async () => {
  // THE BUG: nothing cached, network down.
  {
    const sw = loadSw({ hostname: "revtype.com", cached: undefined, fetchImpl: netFails });
    const res = await sw.staleWhileRevalidate({ url: "https://revtype.com/a.js" });
    check(
      "cache MISS + network down still returns a Response",
      res instanceof Response,
      "returning undefined here is what threw \"Failed to convert value to 'Response'\""
    );
    check(
      "…and it is a network-error Response, not a fake success",
      res instanceof Response && res.type === "error",
      "a synthesised 200 would make the app treat a failed asset as loaded"
    );
  }

  // The normal offline win: we have a copy, so serve it.
  {
    const cached = new Response("stale", { status: 200 });
    const sw = loadSw({ hostname: "revtype.com", cached, fetchImpl: netFails });
    const res = await sw.staleWhileRevalidate({ url: "https://revtype.com/a.js" });
    check(
      "cache HIT + network down serves the cached copy",
      res === cached,
      "this is the whole point of the runtime cache"
    );
  }

  // Cache miss, network fine.
  {
    const sw = loadSw({ hostname: "revtype.com", cached: undefined, fetchImpl: netOk });
    const res = await sw.staleWhileRevalidate({ url: "https://revtype.com/a.js" });
    check(
      "cache MISS + network up returns the fresh response",
      res instanceof Response && (await (res as Response).clone().text()) === "fresh"
    );
  }

  // A full quota must not become an unhandled rejection on every asset.
  {
    let unhandled: unknown = null;
    const onUnhandled = (e: unknown) => {
      unhandled = e;
    };
    process.on("unhandledRejection", onUnhandled);
    const sw = loadSw({
      hostname: "revtype.com",
      cached: undefined,
      fetchImpl: netOk,
      putThrows: true,
    });
    const res = await sw.staleWhileRevalidate({ url: "https://revtype.com/a.js" });
    await new Promise((r) => setTimeout(r, 50));
    process.off("unhandledRejection", onUnhandled);
    check(
      "a failed cache.put still returns the response",
      res instanceof Response
    );
    check(
      "…and does not raise an unhandled rejection",
      unhandled === null,
      "an unhandled rejection inside a SW is a console error on every single asset"
    );
  }

  /* ────────────────────────────────────────────────── */
  console.log("\n2. Dev builds are never cached");

  const req = { headers: new Headers() } as { headers: Headers };
  {
    const sw = loadSw({ hostname: "localhost", fetchImpl: netOk });
    check("localhost is recognised as a dev host", sw.IS_DEV_HOST);
    check(
      "a dev chunk is NOT runtime-cached",
      !sw.isRuntimeAsset(new URL("http://localhost/_next/static/chunks/x.js"), req),
      "Turbopack rehashes chunk URLs every rebuild, so a cached copy outlives the module it names"
    );
  }
  {
    const sw = loadSw({ hostname: "127.0.0.1", fetchImpl: netOk });
    check("127.0.0.1 too", sw.IS_DEV_HOST);
  }
  {
    const sw = loadSw({ hostname: "revtype.com", fetchImpl: netOk });
    check("a real host is not a dev host", !sw.IS_DEV_HOST);
    check(
      "production chunks ARE runtime-cached",
      sw.isRuntimeAsset(new URL("https://revtype.com/_next/static/chunks/x.js"), req),
      "offline depth still has to work where it matters"
    );
    check(
      "API responses are never cached",
      !sw.isRuntimeAsset(new URL("https://revtype.com/api/tasks"), req),
      "stale money/task data is worse than no data"
    );
    check(
      "range requests are left alone",
      !sw.isRuntimeAsset(new URL("https://revtype.com/a.mp4"), {
        headers: new Headers({ range: "bytes=0-" }),
      }),
      "caching a partial response breaks video seeking"
    );
  }

  /* ────────────────────────────────────────────────── */
  console.log("\n3. Wiring");

  check(
    "respondWith is guarded at the call site too",
    /staleWhileRevalidate\(req\)\.then\(\(res\) => res \|\| Response\.error\(\)\)/.test(
      swSource
    ),
    "so a later edit to the helper cannot reintroduce a SW TypeError"
  );
  check(
    "the navigation fallback is guarded as well",
    /caches\.match\(OFFLINE_URL\)\.then\(\(res\) => res \|\| Response\.error\(\)\)/.test(
      swSource
    )
  );
  check(
    "the cache version was bumped so the broken entries are dropped",
    /revtype-shell-v4/.test(swSource) && /revtype-runtime-v4/.test(swSource)
  );

  const reg = fs.readFileSync(
    path.join(root, "src/components/pwa/service-worker-register.tsx"),
    "utf8"
  );
  check(
    "dev UNREGISTERS rather than merely skipping registration",
    /getRegistrations\(\)/.test(reg) && /unregister\(\)/.test(reg),
    "a worker installed by an earlier session would otherwise keep serving stale chunks forever"
  );
  check(
    "…and clears its caches",
    /startsWith\("revtype-"\)/.test(reg) && /caches\.delete/.test(reg)
  );
  check(
    "…only outside production",
    /process\.env\.NODE_ENV !== "production"/.test(reg)
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
