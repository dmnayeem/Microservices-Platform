"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Hash } from "lucide-react";
import { Avatar } from "@/components/user/primitives/avatar";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { profileHref } from "@/lib/user-href";
import { RenderedContent } from "./feed-content";
import { LinkPreviewCard } from "./link-preview-card";
import {
  InlineVideoEmbed,
  isEmbeddableVideoUrl,
} from "@/components/user/primitives/inline-video-embed";
import type { LinkPreviewData } from "./social-feed-view.types";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";

// First http(s) URL in text (client-safe).
function firstUrlInText(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<]+/i);
  return m ? m[0].replace(/[.,;:!?)\]}'"]+$/, "") : null;
}

interface HashtagPost {
  id: string;
  content: string;
  images: string[];
  linkPreview?: LinkPreviewData | null;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  user?: {
    id: string;
    name: string | null;
    username: string | null;
    avatar: string | null;
  };
}

/**
 * Read-only feed of posts containing a hashtag. Interactions (like/comment)
 * live on the main /social feed, so each post links there; this page is just a
 * discovery surface for #tag → matching posts.
 */
export function HashtagFeedClient({ tag }: { tag: string }) {
  const [items, setItems] = useState<HashtagPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);

  const load = useCallback(
    async (nextPage: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (nextPage === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const r = await fetch(
          `/api/feed?tag=${encodeURIComponent(tag)}&page=${nextPage}&limit=20`
        );
        const d = await r.json();
        const posts: HashtagPost[] = d.posts ?? [];
        setItems((prev) => (nextPage === 1 ? posts : [...prev, ...posts]));
        setHasMore(posts.length === 20);
        setPage(nextPage);
      } catch {
        if (nextPage === 1) setItems([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        loadingRef.current = false;
      }
    },
    [tag]
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading posts…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center">
        <Hash className="w-10 h-10 text-gray-700 mx-auto mb-2" />
        <p className="text-sm text-gray-400 font-semibold">
          No posts with #{tag} yet
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Be the first to post with this hashtag.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* The hashtag feed shows the same posts as /social but carried no ad of
          any kind — not IN_FEED, not FEED_POST_BELOW. */}
      <AdRenderer placement="IN_FEED" />

      {items.map((p) => (
        <article key={p.id} className="glass p-4">
          <div className="flex items-center gap-2.5">
            <Link href={profileHref({ id: p.user?.id ?? "", username: p.user?.username })}>
              <Avatar
                src={p.user?.avatar}
                size={40}
                name={p.user?.name || p.user?.username || "U"}
                className="shrink-0"
              />
            </Link>
            <div className="min-w-0">
              <Link
                href={profileHref({ id: p.user?.id ?? "", username: p.user?.username })}
                className="text-sm font-semibold text-white truncate hover:underline block"
              >
                {p.user?.name || p.user?.username || "User"}
              </Link>
              <p className="text-[11px] text-gray-500">
                {formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
          {p.content && (
            <p className="mt-2 text-sm text-gray-200 whitespace-pre-wrap wrap-break-word">
              <RenderedContent content={p.content} />
            </p>
          )}
          {p.images?.[0] ? (
            <SmartImage
              src={p.images[0]}
              alt=""
              width={800}
              height={600}
              className="mt-2 w-full h-auto rounded-lg border border-gray-800 bg-gray-950"
            />
          ) : (
            (() => {
              const url = firstUrlInText(p.content);
              if (url && isEmbeddableVideoUrl(url)) {
                return (
                  <div className="mt-2">
                    <InlineVideoEmbed url={url} />
                  </div>
                );
              }
              if (p.linkPreview || url) {
                return <LinkPreviewCard preview={p.linkPreview} contentUrl={url} />;
              }
              return null;
            })()
          )}
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 border-t border-gray-800 pt-2.5">
            <span>👁 {p.viewsCount}</span>
            <span>❤ {p.likesCount}</span>
            <span>💬 {p.commentsCount}</span>
            <Link
              href="/social"
              className="ml-auto text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              Open in feed →
            </Link>
          </div>
        </article>
      ))}

      {hasMore && (
        <button
          onClick={() => void load(page + 1)}
          disabled={loadingMore}
          className="w-full py-2.5 text-sm font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
