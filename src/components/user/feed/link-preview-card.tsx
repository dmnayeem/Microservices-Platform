"use client";

import { useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { SmartImage } from "@/components/user/primitives/smart-image";
import type { LinkPreviewData } from "./social-feed-view.types";

/** Render a stored OpenGraph preview as a bordered card. */
function Card({ preview }: { preview: LinkPreviewData }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="mt-3 block overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60 hover:border-gray-700 transition-colors"
    >
      {preview.image && (
        <div className="relative w-full aspect-[1.91/1] bg-gray-950">
          <SmartImage
            src={preview.image}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 560px"
            className="object-cover"
          />
        </div>
      )}
      <div className="p-3">
        {preview.siteName && (
          <p className="text-[11px] uppercase tracking-wide text-gray-500 truncate flex items-center gap-1">
            <Link2 className="w-3 h-3 shrink-0" />
            {preview.siteName}
          </p>
        )}
        {preview.title && (
          <p className="mt-0.5 text-sm font-semibold text-gray-100 line-clamp-2">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="mt-1 text-xs text-gray-400 line-clamp-2">
            {preview.description}
          </p>
        )}
      </div>
    </a>
  );
}

/**
 * Link-preview card for a feed post. If the post already has a stored
 * `linkPreview`, renders it. Otherwise, when the content contains a URL and no
 * preview was captured (older posts / failed capture), lazily fetches one from
 * /api/link-preview and renders it if available.
 */
export function LinkPreviewCard({
  preview,
  contentUrl,
}: {
  preview?: LinkPreviewData | null;
  /** First URL in the post content — used only for the lazy fallback. */
  contentUrl?: string | null;
}) {
  const [lazy, setLazy] = useState<LinkPreviewData | null>(null);
  // Starts true when a lazy fetch will run, so we show a skeleton immediately
  // without a synchronous setState inside the effect.
  const [loading, setLoading] = useState(() => !preview && !!contentUrl);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (preview || !contentUrl || fetchedRef.current) return;
    fetchedRef.current = true;
    let cancel = false;
    fetch(`/api/link-preview?url=${encodeURIComponent(contentUrl)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancel && d?.preview) setLazy(d.preview as LinkPreviewData);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [preview, contentUrl]);

  if (preview) return <Card preview={preview} />;
  if (lazy) return <Card preview={lazy} />;
  if (loading) {
    return (
      <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden animate-pulse">
        <div className="w-full aspect-[1.91/1] bg-gray-800/60" />
        <div className="p-3 space-y-2">
          <div className="h-2.5 w-24 rounded bg-gray-800" />
          <div className="h-3 w-3/4 rounded bg-gray-800" />
          <div className="h-2.5 w-1/2 rounded bg-gray-800" />
        </div>
      </div>
    );
  }
  return null;
}
