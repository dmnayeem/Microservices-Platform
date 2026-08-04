"use client";

import { useEffect, useState } from "react";
import { Link2, X } from "lucide-react";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { trackLinkClick } from "@/lib/track-link-click";
import type { LinkPreviewData } from "./social-feed-view.types";

/** Render a stored OpenGraph preview as a bordered card. When `onRemove` is
 *  given (composer), a × button lets the author drop the card before posting. */
function Card({
  preview,
  postId,
  onRemove,
}: {
  preview: LinkPreviewData;
  postId?: string;
  onRemove?: () => void;
}) {
  return (
    <div className="relative mt-3">
      <a
        href={preview.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={() => trackLinkClick(postId)}
        className="block overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60 hover:border-gray-700 transition-colors"
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
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove link preview"
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-red-500/80 text-white backdrop-blur-sm"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
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
  postId,
  onRemove,
}: {
  preview?: LinkPreviewData | null;
  /** First URL in the post content — used only for the lazy fallback. */
  contentUrl?: string | null;
  /** Post id — enables link-click tracking (omit in the composer). */
  postId?: string;
  /** When provided, shows a × to drop the card (composer use). */
  onRemove?: () => void;
}) {
  const [lazy, setLazy] = useState<LinkPreviewData | null>(null);
  // Starts true when a lazy fetch will run, so we show a skeleton immediately
  // without a synchronous setState inside the effect.
  const [loading, setLoading] = useState(() => !preview && !!contentUrl);

  useEffect(() => {
    if (preview || !contentUrl) return;
    let cancel = false;
    // Defer the fetch past StrictMode's throwaway mount→cleanup→remount: the
    // first (cancelled) run's timer is cleared before it ever fetches, so the
    // real mount fetches exactly once and always resolves `loading` — no stuck
    // skeleton. All setState lives in `run` (not the effect body) to satisfy
    // react-hooks/set-state-in-effect.
    const run = async () => {
      setLoading(true);
      setLazy(null);
      try {
        const r = await fetch(
          `/api/link-preview?url=${encodeURIComponent(contentUrl)}`
        );
        const d = r.ok ? await r.json() : null;
        if (!cancel) setLazy((d?.preview as LinkPreviewData) ?? null);
      } catch {
        /* leave lazy null → card collapses */
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    const t = setTimeout(run, 0);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [preview, contentUrl]);

  if (preview) return <Card preview={preview} postId={postId} onRemove={onRemove} />;
  if (lazy) return <Card preview={lazy} postId={postId} onRemove={onRemove} />;
  if (loading) {
    // Compact skeleton (no big image box) so a link that resolves to nothing
    // doesn't flash a large empty card before collapsing.
    return (
      <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/60 p-3 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded bg-gray-800 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 rounded bg-gray-800" />
            <div className="h-2.5 w-1/2 rounded bg-gray-800" />
          </div>
        </div>
      </div>
    );
  }
  return null;
}
