import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    optimizePackageImports: ["lucide-react", "date-fns"],
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
};

export default nextConfig;
