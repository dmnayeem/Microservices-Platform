"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { FeedPostCard } from "./feed-post-card";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import type { FeedPost } from "./social-feed-view.types";

/**
 * The viewer's saved posts.
 *
 * Renders the real `FeedPostCard`, so a saved post behaves exactly like a feed
 * post — react to it, comment, open the photos. The API hands back the same
 * shape via the shared formatter, which is what makes that free.
 *
 * Unsaving removes the card immediately: leaving a post in a list called "Saved"
 * after you unsaved it is worse than the row disappearing.
 */
export function SavedPostsView({
  currentUserId,
  currentUserRole,
}: {
  currentUserId: string;
  currentUserRole: string | null;
}) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/feed/saved");
      const d = r.ok ? await r.json() : { posts: [] };
      setPosts(d.posts ?? []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onUpdatePost = useCallback((id: string, patch: Partial<FeedPost>) => {
    // `isSaved: false` means they just unsaved it from inside this list.
    if (patch.isSaved === false) {
      setPosts((prev) => prev.filter((p) => p.id !== id));
      return;
    }
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const onDeletePost = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white inline-flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-amber-400" />
          Saved
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Posts you kept for later. Only you can see this.
        </p>
      </div>

      {loading && <ListSkeleton rows={3} />}

      {!loading && posts.length === 0 && (
        <EmptyState
          icon={Bookmark}
          title="Nothing saved yet"
          description="Tap the bookmark on any post to keep it here."
        />
      )}

      {!loading &&
        posts.map((p) => (
          <FeedPostCard
            key={p.id}
            post={p}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            onUpdatePost={onUpdatePost}
            onDeletePost={onDeletePost}
          />
        ))}
    </div>
  );
}
