import type { NextConfig } from "next";
// Relative, not `@/`: the config loader does not resolve the tsconfig alias.
// The registry is import-free on purpose so it can be read here.
import { allRegistryOrigins } from "./src/lib/ad-networks/registry";

/**
 * Security response headers (docs/SECURITY-RUNBOOK.md).
 *
 * Set here rather than in middleware so they also apply under `next dev` and
 * to every route, including the ones middleware skips. Every one of them has
 * an env switch, read at build/start time:
 *
 *   SECURITY_HEADERS=off      drop ALL of the headers below (kill switch)
 *   SECURITY_FRAME_GUARD=off  drop X-Frame-Options (clickjacking guard)
 *   SECURITY_HSTS=off         drop Strict-Transport-Security
 *   CSP_REPORT=off            drop the report-only Content-Security-Policy
 *   CSP_ENFORCE=on            send the same policy as an ENFORCED
 *                             Content-Security-Policy instead — default OFF;
 *                             only after the reports have been clean for a while.
 *
 * Framing: app pages may only be framed by our own origin (the admin landing
 * live preview frames "/"). `/embed/*` (the article-task script that runs on
 * publishers' sites) and `/api/*` are left out, so nothing that another site
 * loads is affected. Ad creatives run in `<iframe srcDoc>`, which has no
 * response and is not subject to X-Frame-Options.
 *
 * Permissions-Policy only switches off features nothing here uses. Camera,
 * microphone, display-capture, fullscreen, autoplay and the motion sensors are
 * deliberately NOT listed: live classes delegate camera/mic to the class
 * provider's iframe, and YouTube/Vimeo embeds use the sensors — listing them
 * would silently break those. `browsing-topics` is left alone for AdSense.
 */
const flagOff = (name: string) => (process.env[name] ?? "").toLowerCase() === "off";
const flagOn = (name: string) => (process.env[name] ?? "").toLowerCase() === "on";

const CSP_REPORT_PATH = "/api/security/csp-report";

/**
 * Ad-network script hosts, from the registry (src/lib/ad-networks/registry.ts).
 *
 * Which networks are ENABLED lives in the database and cannot be known when
 * this file is evaluated, so every registry network's hosts are allowed — the
 * list is the set of networks the admin is able to switch on, which is exactly
 * what must keep working the day `CSP_ENFORCE=on` is set. Networks flagged
 * `dynamicDomains` (popunder / push networks that rotate hosts) cannot be
 * listed in advance: add their current hosts with `CSP_AD_SCRIPT_HOSTS`
 * (space- or comma-separated), or keep the policy report-only while they run.
 * In-slot HTML ads are unaffected either way — they run in a frame with its
 * own policy (/api/ads/frame/[id]) or in an opaque srcDoc frame.
 */
const AD_SCRIPT_HOSTS = [
  ...allRegistryOrigins(),
  ...(process.env.CSP_AD_SCRIPT_HOSTS ?? "")
    .split(/[\s,]+/)
    .map((h) => h.trim())
    .filter((h) => /^https:\/\/[A-Za-z0-9*.-]+(:\d+)?$/.test(h)),
];
// The separate ad-frame origin, when configured (src/lib/ad-networks/frame.ts).
const AD_FRAME_ORIGIN = (() => {
  try {
    return process.env.AD_FRAME_ORIGIN ? new URL(process.env.AD_FRAME_ORIGIN).origin : "";
  } catch {
    return "";
  }
})();

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Inline boot scripts in the root layout + Next's own inline payloads, plus
  // ad networks, tag managers and video players. Ad networks load further
  // hosts at run time — the reports will name them.
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://*.googlesyndication.com https://*.doubleclick.net https://*.googletagservices.com https://*.adtrafficquality.google https://www.googletagmanager.com https://www.google-analytics.com https://*.google.com https://*.gstatic.com https://www.youtube.com https://player.vimeo.com https://connect.facebook.net https://*.sentry.io https://static.cloudflareinsights.com https://va.vercel-scripts.com ${AD_SCRIPT_HOSTS.join(" ")}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: wss:",
  `frame-src 'self' https: blob: data:${AD_FRAME_ORIGIN ? ` ${AD_FRAME_ORIGIN}` : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  // Payment gateways (SSLCommerz etc.) receive a form POST.
  "form-action 'self' https:",
  `report-uri ${CSP_REPORT_PATH}`,
  "report-to csp",
].join("; ");

function securityHeaders(): { source: string; headers: { key: string; value: string }[] }[] {
  if (flagOff("SECURITY_HEADERS")) return [];

  const everywhere = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Same as the modern browser default; stated so no browser falls back to
    // leaking full URLs (which can carry tokens) to other sites.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "geolocation=(), usb=(), serial=(), hid=(), bluetooth=(), midi=()",
    },
  ];
  // Vercel already sends HSTS on production domains; a VPS does not. No
  // `includeSubDomains` / `preload`: a subdomain still on plain http would be
  // locked out for the whole max-age.
  if (process.env.NODE_ENV === "production" && !flagOff("SECURITY_HSTS")) {
    everywhere.push({ key: "Strict-Transport-Security", value: "max-age=31536000" });
  }

  const pages: { key: string; value: string }[] = [];
  if (!flagOff("SECURITY_FRAME_GUARD")) {
    pages.push({ key: "X-Frame-Options", value: "SAMEORIGIN" });
  }
  if (flagOn("CSP_ENFORCE")) {
    // frame-ancestors only works in an enforced policy (browsers ignore it,
    // with a console warning, in report-only).
    pages.push({ key: "Content-Security-Policy", value: `${CSP_DIRECTIVES}; frame-ancestors 'self'` });
  } else if (!flagOff("CSP_REPORT")) {
    pages.push({ key: "Content-Security-Policy-Report-Only", value: CSP_DIRECTIVES });
  }
  if (pages.some((h) => h.key.startsWith("Content-Security-Policy"))) {
    pages.push({ key: "Reporting-Endpoints", value: `csp="${CSP_REPORT_PATH}"` });
  }

  return [
    { source: "/:path*", headers: everywhere },
    // Every page except /embed/* and /api/* (see above).
    ...(pages.length ? [{ source: "/((?!embed/|api/).*)", headers: pages }] : []),
  ];
}

const nextConfig: NextConfig = {
  // Lets a verification build run to a separate folder (NEXT_DIST_DIR=.next-verify)
  // so it never clobbers a running `next dev` server's `.next`. Unset → default.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Link unfurlers that read only the first HTML they get: they must receive
  // the metadata in <head>, not streamed later. Next's default list plus the
  // ones it lacks (Pinterest, Telegram, Viber, Snapchat, Embedly/Iframely,
  // Mastodon). Setting this REPLACES the default, so the default is restated.
  htmlLimitedBots:
    /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|meta-externalagent|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|Pinterest|TelegramBot|Viber|Snap URL Preview|Embedly|Iframely|Mastodon/i,
  // jimp must not be bundled. `jimp/fonts` exports ABSOLUTE filesystem paths to
  // the bitmap `.fnt`/`.png` glyph files inside node_modules, and the bundler
  // rewrites them to `<distDir>/node_modules/@jimp/...`, which does not exist —
  // `loadFont` then failed with a bare "fetch failed". That silently produced
  // an empty watermarked preview for every Stock Studio asset, which in turn
  // made publishing impossible ("Watermarked preview is required"). Left
  // external, the paths stay real and Next traces the font files into the
  // serverless output.
  serverExternalPackages: ["jimp", "geoip-country"],
  // geoip-country reads its data files from a directory it builds at run
  // time, which the deploy's file tracing cannot see — so they would be left
  // out of every server function. Shipped explicitly (≈8 MB); src/lib/geo.ts
  // also survives their absence.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/geoip-country/package.json",
      "./node_modules/geoip-country/data/*.dat",
    ],
  },
  images: {
    // Only our own storage hosts are run through the Next image optimizer
    // (`/_next/image`). Uploaded media serves from CloudFront/S3; Google OAuth
    // avatars from googleusercontent. Arbitrary user/admin-typed image URLs are
    // NOT whitelisted here on purpose — a global `hostname:"**"` would turn the
    // optimizer into an open fetch proxy — so `SmartImage` renders those with
    // `unoptimized` (browser fetches them directly). Keep this list in sync with
    // OPTIMIZABLE_HOSTS in src/components/user/primitives/smart-image.tsx.
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    // Keep the client Router Cache so revisiting a page within the window is
    // instant (no server round-trip). Freshness is handled by the client
    // useAutoRefresh hooks (focus + timer) on the live surfaces.
    staleTimes: { dynamic: 60, static: 300 },
    // Tree-shake big barrel packages so each page ships only the icons/helpers
    // it actually uses — meaningful JS reduction across the whole app.
    //
    // `react-icons/*` matters most here: components/ui/brand-icon.tsx pulls 39
    // named icons from `react-icons/si` plus 3 from `react-icons/fa6`, and it is
    // imported by the marketing footer — so every one of those barrels was
    // shipping on the PUBLIC home page, the first thing a visitor downloads.
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "react-icons/si",
      "react-icons/fa6",
      "recharts",
      "framer-motion",
      "@tiptap/react",
    ],
  },
  // Ad-blocker resistance: the browser only ever requests these neutral,
  // first-party-looking paths (no `ads`/`click`/`impression` token for filter
  // lists to match). They rewrite INTERNALLY to the real ad routes — the
  // destination is invisible to the client. Legacy `/api/ads/*` stay mounted for
  // back-compat (e.g. mobile). `afterFiles` semantics: real filesystem routes
  // (e.g. /api/spaces/media/[id]) win, so these only catch the aliased paths.
  async rewrites() {
    return [
      { source: "/api/spaces/panel", destination: "/api/ads/serve" },
      { source: "/api/feed/inline", destination: "/api/ads/feed" },
      { source: "/api/earn/watch", destination: "/api/ads/rewarded" },
      { source: "/api/spaces/:id/event", destination: "/api/ads/:id/event" },
      { source: "/api/earn/:id/claim", destination: "/api/ads/:id/reward" },
    ];
  },
  // The share sheet used to hand out `/social/<postId>`, and no such route has
  // ever existed — `(main)/social` is the feed itself and takes no parameter, so
  // every shared link 404'd for the person who received it. The public post page
  // is `/post/<id>`; this keeps links already in the wild working. It is a
  // 307, not a 308: `/social/:id` is a path someone could still want for a
  // logged-in view later, and a permanent redirect is cached in browsers
  // forever.
  async redirects() {
    return [
      { source: "/social/:id", destination: "/post/:id", permanent: false },
    ];
  },
  // Always revalidate the service worker + manifest so a new deploy propagates to
  // installed PWAs instead of a CDN/browser pinning a stale worker.
  async headers() {
    return [
      ...securityHeaders(),
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
