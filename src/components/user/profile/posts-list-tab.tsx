"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Image as ImageIcon,
  Eye as EyeIcon,
  ThumbsUp,
  MessageSquare,
  Share2,
} from "lucide-react";
import type { ApiPost } from "./profile-view.types";
import { RenderedContent } from "../feed/feed-content";

export function PostsListTab({ userId }: { userId: string }) {
  const [items, setItems] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/users/${userId}/posts?limit=20`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancel) setItems(d.posts ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm inline-flex items-center justify-center gap-2 w-full">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading posts…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center">
        <ImageIcon className="w-10 h-10 text-gray-700 mx-auto mb-2" />
        <p className="text-sm text-gray-400 font-semibold">No posts yet</p>
        <p className="text-xs text-gray-600 mt-1">
          Your published posts will appear here.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((p) => (
        <div
          key={p.id}
          className="glass glass-hover p-4"
        >
          {p.isPinned && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2">
              📌 Pinned
            </span>
          )}
          {p.content && (
            <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
              <RenderedContent content={p.content} />
            </p>
          )}
          {p.images.length > 0 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.images[0]}
              alt=""
              className="mt-3 w-full max-h-96 rounded-lg object-cover bg-gray-950"
            />
          )}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <EyeIcon className="w-3.5 h-3.5" />
              <span className="tabular-nums">{p.viewsCount.toLocaleString()}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <ThumbsUp className="w-3.5 h-3.5" />
              <span className="tabular-nums">{p.likesCount.toLocaleString()}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="tabular-nums">{p.commentsCount.toLocaleString()}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Share2 className="w-3.5 h-3.5" />
              <span className="tabular-nums">{p.sharesCount.toLocaleString()}</span>
            </span>
            <span className="ml-auto">
              {new Date(p.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
