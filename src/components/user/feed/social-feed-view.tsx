"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FeedAdCard, type FeedAd } from "@/components/user/feed/feed-ad-card";
import {
  MessageCircle,
  Flame,
  Clock,
  Users,
  Compass,
} from "lucide-react";
import { PullToRefresh } from "@/components/user/primitives/pull-to-refresh";
import { cn } from "@/lib/utils";
import {
  BannerSlider,
} from "@/components/user/primitives/banner-slider";
import {
  WithdrawalTicker,
  type WithdrawalTickerItem,
} from "@/components/user/primitives/withdrawal-ticker";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { MobileEarnBlock } from "@/components/user/feed/mobile-earn-block";
import { FeedRightRail } from "@/components/user/feed/feed-right-rail";
import { CreatePostComposer } from "./create-post-composer";
import { FeedPostCard } from "./feed-post-card";
import { GroupsTab } from "./groups-tab";
import type {
  SessionUser,
  FeedPost,
  TickerConfig,
  Props,
  ViewTab,
  Sort,
} from "./social-feed-view.types";

export function SocialFeedView({
  user,
  initialBanners,
  initialTicker,
  tickerConfig,
  bestEarners,
  whoToFollow,
  trendingHashtags,
  promo,
  widgetConfig,
  quickEarn,
  customWidgets,
  canBoost,
}: Props) {
  const [tab, setTab] = useState<ViewTab>("feed");
  const [sort, setSort] = useState<Sort>("recent");

  return (
    <div className="mx-auto w-full max-w-5xl flex justify-center gap-6">
      {/* Center feed column (FB/Twitter-width) */}
      <div className="w-full max-w-xl min-w-0 space-y-4">
        {/* Banner — above the tabs, visible on both Feed and Groups */}
        {initialBanners.length > 0 && <BannerSlider slides={initialBanners} />}

        {/* Mobile/tablet earn strip — Daily Bonus + Quick Earn (desktop uses the rail) */}
        <MobileEarnBlock quickEarn={quickEarn} className="lg:hidden" />

        {/* Top tabs */}
        <nav className="flex gap-1 border-b border-gray-800 overflow-x-auto scrollbar-none">
          {(
            [
              { key: "feed", label: "Feed", icon: Compass },
              { key: "groups", label: "Groups", icon: Users },
            ] as const
          ).map((t) => {
            const isActive = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors",
                  isActive
                    ? "text-white border-indigo-500"
                    : "text-gray-500 border-transparent hover:text-white"
                )}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {tab === "feed" && (
          <FeedTab
            user={user}
            initialTicker={initialTicker}
            tickerConfig={tickerConfig}
            sort={sort}
            onSortChange={setSort}
            canBoost={canBoost}
          />
        )}

        {tab === "groups" && <GroupsTab />}
      </div>

      {/* Right sidebar — desktop/laptop (lg+). Mobile/tablet unchanged. */}
      <aside className="hidden lg:block w-80 shrink-0">
        <div className="sticky top-20 space-y-4">
          <FeedRightRail
            bestEarners={bestEarners}
            whoToFollow={whoToFollow}
            trendingHashtags={trendingHashtags}
            promo={promo}
            widgetConfig={widgetConfig}
            quickEarn={quickEarn}
            customWidgets={customWidgets}
          />
        </div>
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feed tab
// ─────────────────────────────────────────────────────────────────────────────

function FeedTab({
  user,
  initialTicker,
  tickerConfig,
  sort,
  onSortChange,
  canBoost,
}: {
  user: SessionUser;
  initialTicker: WithdrawalTickerItem[];
  tickerConfig?: TickerConfig;
  sort: Sort;
  onSortChange: (s: Sort) => void;
  canBoost?: boolean;
}) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Native in-feed ad pool — each ad is consumed once, in order, spaced through
  // the feed (no repeats while scrolling). We fetch more (excluding already-seen
  // ids) as the pool is consumed; de-dupe on append so a server fallback repeat
  // is never re-added.
  const [feedAds, setFeedAds] = useState<FeedAd[]>([]);
  const feedAdIdsRef = useRef<Set<string>>(new Set());
  const loadingAdsRef = useRef(false);

  const PAGE_SIZE = 20;

  const fetchFeedAds = async () => {
    if (loadingAdsRef.current) return;
    loadingAdsRef.current = true;
    try {
      const exclude = Array.from(feedAdIdsRef.current).join(",");
      const res = await fetch(
        `/api/ads/feed?count=10${exclude ? `&exclude=${encodeURIComponent(exclude)}` : ""}`
      );
      const data = await res.json();
      if (Array.isArray(data.ads) && data.ads.length > 0) {
        const fresh = (data.ads as FeedAd[]).filter(
          (a) => !feedAdIdsRef.current.has(a.adId)
        );
        if (fresh.length > 0) {
          fresh.forEach((a) => feedAdIdsRef.current.add(a.adId));
          setFeedAds((prev) => [...prev, ...fresh]);
        }
      }
    } catch {
      /* no ads — feed just shows posts */
    } finally {
      loadingAdsRef.current = false;
    }
  };

  const load = async () => {
    try {
      const res = await fetch(`/api/feed?page=1&limit=${PAGE_SIZE}`);
      const data = await res.json();
      const items: FeedPost[] = data.posts ?? [];
      setPosts(items);
      setPage(1);
      setHasMore(items.length >= PAGE_SIZE);
    } catch {
      setPosts([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
    void fetchFeedAds();
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = page + 1;
    try {
      const res = await fetch(`/api/feed?page=${next}&limit=${PAGE_SIZE}`);
      const data = await res.json();
      const items: FeedPost[] = data.posts ?? [];
      // De-dupe against posts already shown (announcements/promoted can repeat).
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...items.filter((p) => !seen.has(p.id))];
      });
      setPage(next);
      setHasMore(items.length >= PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
    void fetchFeedAds(); // grow the ad pool as the feed grows
  };

  // Infinite scroll: load the next page when the bottom sentinel comes into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, hasMore, loadingMore]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedPosts = useMemo(() => {
    if (sort === "trending") {
      return [...posts].sort(
        (a, b) =>
          b.likesCount + b.commentsCount * 2 + b.sharesCount * 3 -
          (a.likesCount + a.commentsCount * 2 + a.sharesCount * 3)
      );
    }
    return posts;
  }, [posts, sort]);

  const handlePostCreated = (post: FeedPost) => {
    setPosts((prev) => [post, ...prev]);
  };

  // Stable identities so the memoized FeedPostCard only re-renders the one post
  // whose object actually changed (below they replace just the matching post).
  const handlePostUpdated = useCallback((id: string, patch: Partial<FeedPost>) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const handlePostDeleted = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return (
    <PullToRefresh onRefresh={load}>
    <div className="space-y-4">
      {initialTicker.length > 0 && (
        <WithdrawalTicker
          items={initialTicker}
          showAmount={tickerConfig?.showAmount}
          showMethod={tickerConfig?.showMethod}
          showCountry={tickerConfig?.showCountry}
          speedSec={tickerConfig?.speedSec}
        />
      )}

      <CreatePostComposer user={user} onCreated={handlePostCreated} />

      {/* Sort toggle */}
      <div className="flex items-center justify-end">
        <div className="inline-flex rounded-lg border border-gray-800 overflow-hidden text-xs">
          {(["recent", "trending"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onSortChange(s)}
              className={cn(
                "px-3 py-1.5 inline-flex items-center gap-1 capitalize",
                sort === s
                  ? "bg-indigo-500 text-white"
                  : "bg-gray-900 text-gray-400 hover:text-white"
              )}
            >
              {s === "recent" ? (
                <Clock className="w-3 h-3" />
              ) : (
                <Flame className="w-3 h-3" />
              )}
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading && <ListSkeleton rows={3} />}

      {!loading && sortedPosts.length === 0 && (
        <EmptyState
          icon={MessageCircle}
          title="No posts yet"
          description="Be the first to share something with the community."
        />
      )}

      {!loading && sortedPosts.length > 0 && (
        <div className="space-y-3">
          {sortedPosts.map((post, i) => {
            // One native ad after every 2 posts. Each ad is consumed once (no
            // modulo wrap) so nothing repeats while scrolling; empty slots (pool
            // not yet grown) simply show no ad.
            const slot = Math.floor(i / 2);
            const ad = (i + 1) % 2 === 0 && slot < feedAds.length
              ? feedAds[slot]
              : null;
            return (
              <Fragment key={post.id}>
                <FeedPostCard
                  post={post}
                  currentUserId={user.id}
                  currentUserRole={user.role ?? null}
                  canBoost={canBoost}
                  onUpdatePost={handlePostUpdated}
                  onDeletePost={handlePostDeleted}
                />
                {ad && <FeedAdCard key={`ad-${i}-${ad.adId}`} ad={ad} />}
              </Fragment>
            );
          })}

          {/* Infinite-scroll sentinel + loading state */}
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && <ListSkeleton rows={2} />}
          {!hasMore && (
            <p className="text-center text-[11px] text-gray-600 py-4">
              You&apos;re all caught up.
            </p>
          )}
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
