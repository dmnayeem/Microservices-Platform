"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  ExternalLink,
  Heart,
  MessageCircle,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPostBackground } from "@/lib/post-backgrounds";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { Avatar } from "@/components/user/primitives/avatar";

/** Stable pseudo-count per ad (so the native engagement numbers don't jump). */
function seededCount(adId: string, salt: number, min: number, max: number) {
  let h = salt >>> 0;
  for (let i = 0; i < adId.length; i++) h = (h * 31 + adId.charCodeAt(i)) >>> 0;
  return min + (h % (max - min + 1));
}

/** Compact number (1200 → 1.2k). */
function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** A native feed ad, shaped by GET /api/ads/feed. Renders like a real post. */
export interface FeedAd {
  adId: string;
  kind: "post" | "brand";
  author: {
    name: string;
    username: string | null;
    avatar: string | null;
    isBlueVerified: boolean;
    verifiedBadgeStyle: string | null;
  };
  content: string;
  images: string[];
  videoUrl?: string | null;
  backgroundStyle: string | null;
  ctaLabel: string;
  targetUrl: string | null;
}

export function FeedAdCard({ ad }: { ad: FeedAd }) {
  const ref = useRef<HTMLElement | null>(null);
  const firedRef = useRef(false);
  const [liked, setLiked] = useState(false);

  // Native-post-style engagement counts (stable per ad).
  const baseLikes = seededCount(ad.adId, 3, 40, 3200);
  const comments = seededCount(ad.adId, 2, 5, 240);
  const views = seededCount(ad.adId, 1, 800, 25000);
  const likes = baseLikes + (liked ? 1 : 0);

  // Count one impression when the ad first scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !firedRef.current) {
            firedRef.current = true;
            fetch(`/api/spaces/${ad.adId}/event`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: "view" }),
            }).catch(() => {});
            io.disconnect();
          }
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ad.adId]);

  const trackClick = () => {
    fetch(`/api/spaces/${ad.adId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "open" }),
    }).catch(() => {});
  };

  const initial = (ad.author.name || "A").charAt(0).toUpperCase();
  const postBg =
    ad.images.length === 0 ? getPostBackground(ad.backgroundStyle) : null;

  return (
    <article
      ref={ref}
      className="relative rounded-xl border border-gray-800 bg-gray-900 overflow-hidden"
    >
      <div className="p-4">
        {/* Header — avatar + name + "Sponsored" (mimics a real post) */}
        <div className="flex items-start gap-3">
          <Avatar
            src={ad.author.avatar}
            size={40}
            name={ad.author.name}
            fallbackText={initial}
            className="shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5">
              <span className="text-sm font-semibold text-white">
                {ad.author.name}
              </span>
              {ad.author.isBlueVerified && (
                <CheckCircle
                  className="w-3.5 h-3.5 text-blue-400 fill-blue-500/30"
                  aria-label="Verified"
                />
              )}
            </div>
            <p className="text-[11px] text-gray-500">Sponsored</p>
          </div>
        </div>

        {/* Content */}
        {ad.content &&
          (postBg ? (
            <div
              className={cn(
                "mt-3 rounded-xl px-4 py-10 min-h-40 flex items-center justify-center text-center",
                postBg.className
              )}
            >
              <p
                className={cn(
                  "text-xl font-bold leading-snug whitespace-pre-wrap wrap-break-word",
                  postBg.textClass
                )}
              >
                {ad.content}
              </p>
            </div>
          ) : (
            <p className="text-[15px] text-gray-200 leading-relaxed whitespace-pre-wrap mt-3">
              {ad.content}
            </p>
          ))}
      </div>

      {/* Video creative (takes priority over images) */}
      {ad.videoUrl ? (
        <a
          href={ad.targetUrl ?? "#"}
          target="_blank"
          rel="noopener sponsored noreferrer"
          onClick={trackClick}
          className="block bg-black"
        >
          <video
            src={ad.videoUrl}
            autoPlay
            muted
            loop
            playsInline
            className="w-full max-h-[70vh] object-contain bg-black"
          />
        </a>
      ) : (
        ad.images.length > 0 && (
        <a
          href={ad.targetUrl ?? "#"}
          target="_blank"
          rel="noopener sponsored noreferrer"
          onClick={trackClick}
          className={cn(
            "grid gap-px bg-gray-800",
            ad.images.length === 1 && "grid-cols-1",
            ad.images.length === 2 && "grid-cols-2",
            ad.images.length >= 3 && "grid-cols-3"
          )}
        >
          {ad.images.slice(0, 6).map((url, i) =>
            ad.images.length === 1 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                className="w-full bg-gray-950 max-h-[70vh] object-contain"
              />
            ) : (
              <div key={i} className="relative aspect-square overflow-hidden">
                <SmartImage
                  src={url}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                  className="object-cover bg-gray-950"
                />
              </div>
            )
          )}
        </a>
        )
      )}

      {/* Engagement bar — native post look (like / comment / views) */}
      <div className="flex items-center border-t border-gray-800 mt-3 text-sm">
        <button
          type="button"
          onClick={() => setLiked((v) => !v)}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 font-semibold transition-colors hover:bg-gray-800/40",
            liked ? "text-rose-400" : "text-gray-400"
          )}
        >
          <Heart className={cn("w-4 h-4", liked && "fill-rose-500 text-rose-500")} />
          {fmt(likes)}
        </button>
        <a
          href={ad.targetUrl ?? "#"}
          target="_blank"
          rel="noopener sponsored noreferrer"
          onClick={trackClick}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 font-semibold text-gray-400 hover:bg-gray-800/40 transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          {fmt(comments)}
        </a>
        <span className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 font-semibold text-gray-400">
          <Eye className="w-4 h-4" />
          {fmt(views)}
        </span>
      </div>

      {/* CTA row */}
      <a
        href={ad.targetUrl ?? "#"}
        target="_blank"
        rel="noopener sponsored noreferrer"
        onClick={trackClick}
        className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-gray-800 hover:bg-gray-800/40 transition-colors group"
      >
        <span className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">
          Sponsored
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-400 group-hover:text-indigo-300">
          {ad.ctaLabel}
          <ExternalLink className="w-3.5 h-3.5" />
        </span>
      </a>
    </article>
  );
}
