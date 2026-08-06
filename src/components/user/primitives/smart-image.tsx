"use client";

import Image from "next/image";
import type { ReactEventHandler } from "react";

/**
 * `next/image` wrapper that never throws on an un-whitelisted host.
 *
 * The Next image optimizer (`/_next/image`) only accepts hosts listed in
 * `next.config.ts` `images.remotePatterns`. We deliberately whitelist ONLY our
 * own storage (CloudFront/S3) + Google avatars there — a global `hostname:"**"`
 * would make the optimizer an open fetch proxy. But many images are arbitrary
 * user/admin-typed URLs (ad creatives, marketplace/course/game thumbnails,
 * pasted avatars). For those we set `unoptimized`, so the browser loads them
 * directly (no optimizer, no "hostname not configured" throw) while STILL getting
 * lazy-loading + width/height CLS reservation from `next/image`.
 *
 * Keep OPTIMIZABLE_HOSTS in sync with `images.remotePatterns` in next.config.ts.
 */
const OPTIMIZABLE_HOSTS = [
  ".amazonaws.com",
  ".cloudfront.net",
  ".googleusercontent.com",
];

function isOptimizable(src: string): boolean {
  if (!src) return false;
  // Data/blob URIs and app-relative paths never need a remote pattern.
  if (src.startsWith("data:") || src.startsWith("blob:")) return false;
  if (src.startsWith("/")) {
    // Dynamic API-served media (often with a ?variant query, e.g.
    // /api/spaces/media/[id]?f=logo) is already optimized/sized by our own route.
    // Skip the Next optimizer — routing a local image WITH a query string through
    // it requires an images.localPatterns allowlist entry (Next 16) and would
    // throw. Plain static assets (/logo.png) still get optimized.
    if (src.startsWith("/api/") || src.includes("?")) return false;
    return true; // local static asset
  }
  try {
    const host = new URL(src).hostname.toLowerCase();
    return OPTIMIZABLE_HOSTS.some((s) => host === s.slice(1) || host.endsWith(s));
  } catch {
    return false; // malformed → let the browser handle it, unoptimized
  }
}

type BaseProps = {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  onError?: ReactEventHandler<HTMLImageElement>;
};

type SmartImageProps = BaseProps &
  (
    | { fill: true; width?: never; height?: never }
    | { fill?: false; width: number; height: number }
  );

export function SmartImage(props: SmartImageProps) {
  const { src, alt, className, sizes, priority, onError, ...rest } = props;
  const unoptimized = !isOptimizable(src);

  if (rest.fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        onError={onError}
        unoptimized={unoptimized}
        className={className}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={rest.width}
      height={rest.height}
      sizes={sizes}
      priority={priority}
      onError={onError}
      unoptimized={unoptimized}
      className={className}
    />
  );
}
