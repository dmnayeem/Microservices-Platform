import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a verification build run to a separate folder (NEXT_DIST_DIR=.next-verify)
  // so it never clobbers a running `next dev` server's `.next`. Unset → default.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
  // Always revalidate the service worker + manifest so a new deploy propagates to
  // installed PWAs instead of a CDN/browser pinning a stale worker.
  async headers() {
    return [
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
