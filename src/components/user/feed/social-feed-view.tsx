"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FeedAdCard, type FeedAd } from "@/components/user/feed/feed-ad-card";
import {
  MessageCircle,
  Flame,
  Sparkles,
  Users,
  Compass,
  ArrowUp,
  PanelRight,
} from "lucide-react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useAppRefresh } from "@/hooks/use-app-refresh";
import { cn } from "@/lib/utils";
import { useChromeAutoHide } from "@/lib/use-chrome-autohide";
import {
  BannerSlider,
  type BannerSlide,
} from "@/components/user/primitives/banner-slider";
import {
  WithdrawalTicker,
  type WithdrawalTickerItem,
} from "@/components/user/primitives/withdrawal-ticker";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { MobileEarnBlock } from "@/components/user/feed/mobile-earn-block";
import { ActiveEventsCard } from "@/components/user/feed/active-events-card";
import { FeedRightRail } from "@/components/user/feed/feed-right-rail";
import { BottomSheet } from "@/components/user/primitives/bottom-sheet";
import { FeedQuickLinks } from "@/components/user/feed/feed-quick-links";
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
  initialFeedAd,
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
  canShareLinks,
  canShareYouTube,
  canDonate,
  feedAdInterval = 2,
  underPostBanner = false,
  underPostInterval = 3,
  groupsEnabled = false,
  hiddenPaths,
}: Props) {
  // Scrolling down hands the screen back to the posts: the header, this
  // toolbar and the bottom tab bar slide away, and any upward scroll returns
  // them. Phones and tablets only — see globals.css, which owns the movement.
  useChromeAutoHide();

  const [tab, setTab] = useState<ViewTab>("feed");
  const [sort, setSort] = useState<Sort>("recent");
  // The rail's contents, reachable below `xl` where the rail itself does not
  // fit. Before this, Top Earners, Who to Follow, Trending Hashtags, Refer &
  // Earn, the Daily Mission and every admin custom widget simply did not render
  // on a phone or a tablet — they were desktop-only, with no way to reach them.
  const [railOpen, setRailOpen] = useState(false);

  // Groups is behind an admin switch (`ui.groups_enabled`, default off) and the
  // flag arrives from the server — see src/lib/groups-gate.ts. `activeTab`
  // rather than `tab` is what the render reads, so if the switch is turned off
  // while someone is sitting on the Groups tab they fall back to the feed
  // instead of staring at an empty column.
  const tabs = [
    { key: "feed", label: "Feed", icon: Compass },
    ...(groupsEnabled
      ? [{ key: "groups", label: "Groups", icon: Users } as const]
      : []),
  ] as const satisfies readonly { key: ViewTab; label: string; icon: typeof Compass }[];
  const activeTab: ViewTab = tabs.some((t) => t.key === tab) ? tab : "feed";

  // The rail, rendered twice from one definition: in the aside at `xl`, and
  // inside the sheet below it. Both get the same widgets in the same admin
  // order, so "it is on desktop but not on my phone" cannot come back.
  const railContent = (
    <>
      <ActiveEventsCard />
      <FeedRightRail
        bestEarners={bestEarners}
        whoToFollow={whoToFollow}
        trendingHashtags={trendingHashtags}
        promo={promo}
        widgetConfig={widgetConfig}
        quickEarn={quickEarn}
        customWidgets={customWidgets}
      />
    </>
  );

  return (
    // The right rail appears at `xl`, not `lg`, and the mobile strips below hold
    // on until the same point.
    //
    // The shell already spends 352px before this component gets any width
    // (`lg:pl-72` = 288px of nav, plus `lg:px-8` = 64px of padding). At the `lg`
    // breakpoint that leaves 672px, but two columns need at least 920px — 576
    // for the feed, 24 gap, 320 for the rail, which is `shrink-0`. So every
    // laptop in the 1024–1279px band rendered the feed at ~328px: narrower than
    // a phone, with a full-width rail beside it. 1280px is the first width where
    // both fit, which is why the rail starts at `xl`.
    //
    // The three columns, then: the app's own nav (`lg:pl-72`) is the left rail,
    // this is the centre, the aside is the right. One column on a phone, two
    // from `lg` where the nav appears, three from `xl`. Below `xl` the aside's
    // contents are one tap away in the sheet rather than absent — which is what
    // they used to be.
    //
    // The widths above `xl` are measured, not guessed. At 1920 the feed used to
    // begin 352px right of the nav with 180px of dead space on either side of
    // the pair, because the centring happens twice: `main` centres itself inside
    // `max-w-7xl`, and then this row centred a 920px block inside main's 1216px
    // again. Widening both columns pulls the block left and fills that corridor
    // instead of leaving it down the middle of the screen — the feed now starts
    // 80px further left and the side space is 84px rather than 180px.
    //
    // The rail only grows at `2xl`, and that is the constraint that decides
    // everything else. At exactly 1280 the row has 920px to work with, and
    // 672 + 24 + 416 does not fit: the feed would be squeezed to 480px, NARROWER
    // than it is today. So the rail holds at 320 through the whole xl band and
    // takes its extra width at 1536+, where `main` is capped and the room is
    // genuinely spare.
    <div className="mx-auto w-full max-w-5xl xl:max-w-6xl flex justify-center gap-6">
      {/* Center feed column (FB/Twitter-width) */}
      <div className="w-full max-w-xl xl:max-w-[42rem] min-w-0 space-y-4">
        {/* ONE toolbar for everything that steers the feed.
            It replaces a tab strip at the top of the column and a sort toggle
            floating on its own line further down — two rows, in two places, each
            holding one decision, with the composer wedged between them. Putting
            them together gives the column a single place to look for "what am I
            seeing, and in what order", and hands a whole row back to the posts.

            It sticks under the app header (h-16 plus the safe-area inset) at
            z-20 — below the header's z-30 — so the controls stay reachable while
            reading without ever covering the header's own menus. */}
        <div
          data-chrome="toolbar"
          className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 flex items-center gap-2 rounded-(--app-r-card) border border-(--app-line) bg-(--app-surface) px-2 py-2 shadow-(--app-e1)"
        >
          {/* The BAR stays when Groups is off — it carries the sort control and
              the panel handle, which are worth a row on their own. The TABS do
              not: one tab is not a choice, it is a button that reports where you
              already are, and that lone "Feed" chip is the thing the owner
              screenshotted. So the bar survives and the tab list disappears. */}
          {tabs.length > 1 && (
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none">
            {tabs.map((t) => {
              const isActive = t.key === activeTab;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "app-tap-row app-press inline-flex shrink-0 items-center gap-1.5 rounded-(--app-r-chip) px-3 text-sm font-bold",
                    isActive
                      ? "app-accent-soft"
                      : "text-gray-400 hover:text-white"
                  )}
                >
                  <t.icon className="h-4.5 w-4.5" />
                  {t.label}
                </button>
              );
            })}
          </nav>
          )}
          {/* Where the tab list used to sit. With one tab the bar was left
              carrying nothing but a sort control and a handle, which is a lot of
              always-on-screen space doing no work — so the six destinations
              people actually open live here instead. When Groups IS on, the
              tabs take this space back and the shortcuts step aside rather than
              competing with them for a phone-width row. */}
          {tabs.length <= 1 && <FeedQuickLinks hidden={hiddenPaths} />}

          {/* Sort — Feed tab only, because it sorts posts and the Groups tab has
              none. It used to render on both and do nothing on one of them. */}
          {activeTab === "feed" && (
            /* It has to LOOK switchable, and the quiet version did not.
               A raised surface for the chosen half and gray-400 for the other
               read as a heading beside a disabled word — the owner's report was
               that he could not tell "For You" was changeable at all.
               So: the chosen half takes the accent (6.46:1 with white, measured
               — the old indigo-500 pill was 4.47:1, which is why it had been
               removed), and the other half is gray-200, not gray-400. Grey that
               dim on a dark track is the universal look of "you cannot press
               this". Both halves also keep their label at every width; hiding
               the text below `sm` left two bare icons with nothing to compare. */
            // `hidden sm:inline-flex` — the owner asked for this off on a
            // phone. On a narrow toolbar it was competing for the same row as
            // the six shortcuts, and sorting a feed is a desktop-sized
            // decision; the default (For You) is the one nearly everyone keeps.
            <div
              role="group"
              aria-label="Sort posts"
              className="hidden sm:inline-flex shrink-0 overflow-hidden rounded-(--app-r-chip) border border-(--app-line) bg-(--app-surface-2) p-0.5"
            >
              {(["recent", "trending"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  aria-pressed={sort === s}
                  className={cn(
                    "app-press inline-flex h-10 items-center gap-1.5 rounded-[calc(var(--app-r-chip)-2px)] px-3 text-xs font-bold",
                    sort === s
                      ? "app-accent shadow-(--app-e1)"
                      : "text-gray-200 hover:bg-(--app-surface)"
                  )}
                >
                  {s === "recent" ? (
                    <Sparkles className="h-3.5 w-3.5" />
                  ) : (
                    <Flame className="h-3.5 w-3.5" />
                  )}
                  <span>{s === "recent" ? "For You" : "Trending"}</span>
                </button>
              ))}
            </div>
          )}

          {/* The sheet handle. `xl:hidden` because above that width the same
              content is already sitting in the aside. */}
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            aria-label="Open earnings and discovery panel"
            className="app-tap app-press inline-flex shrink-0 items-center justify-center rounded-(--app-r-chip) border border-(--app-line) bg-(--app-surface-2) text-gray-300 hover:text-white xl:hidden"
          >
            <PanelRight className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Earn strip — balance + Quick Earn. Shown until the rail appears at xl. */}
        <MobileEarnBlock quickEarn={quickEarn} className="xl:hidden" />

        {activeTab === "feed" && (
          <FeedTab
            user={user}
            initialBanners={initialBanners}
            initialFeedAd={initialFeedAd}
            initialTicker={initialTicker}
            tickerConfig={tickerConfig}
            sort={sort}
            canBoost={canBoost}
            canShareLinks={canShareLinks}
            canShareYouTube={canShareYouTube}
            canDonate={canDonate}
            feedAdInterval={feedAdInterval}
            underPostBanner={underPostBanner}
            underPostInterval={underPostInterval}
          />
        )}

        {groupsEnabled && activeTab === "groups" && (
          <>
            {initialBanners.length > 0 && <BannerSlider slides={initialBanners} />}
            <GroupsTab />
          </>
        )}
      </div>

      {/* Right rail — only where both columns actually fit (xl+). See above.
          The aside is deliberately left to stretch to the row height: `sticky`
          needs a taller ancestor to travel inside, so adding `self-start` here
          would shrink it to its content and stop the stickiness working. */}
      <aside className="hidden xl:block w-80 2xl:w-[26rem] shrink-0">
        {/* The rail scrolls on its own.
            `sticky` alone pinned this column 80px below the header and then let
            it move with the page — so once the widgets were taller than the
            viewport, the bottom ones could never be brought into view. There was
            no height bound and no overflow, so the column had no scrollbar of its
            own. It stacks Active Events, best earners, who-to-follow, trending
            hashtags, a promo, quick-earn tiles and any custom widgets, which
            clears a laptop screen easily. They are banded under collapsible
            headings now (see FeedRightRail) so the column can be shortened to
            what the viewer actually wants, but the worst case is unchanged.

            6rem = the `top-20` offset plus a little breathing room at the bottom.
            `--anchor-ad-h` is published on the document by AnchorAdBar and is 0px
            when there is no bar, so the rail only gives up height for a strip
            that is actually there — the same allowance `<main>` makes.

            The scrollbar is deliberately the DEFAULT one, not `scrollbar-thin`.
            Measured in a real browser: the rail holds 2423px of widgets in a
            666px window, and the thin variant is 4px wide — which, sitting
            inside `pr-1`'s 4px of padding, was invisible against a dark
            background. The column scrolled perfectly well; nobody could tell
            that it could. `pr-2` keeps the cards clear of the 8px track.

            `overscroll-contain` stops a flick at the end of the rail carrying on
            into the page behind it. */}
        <div className="sticky top-20 space-y-3 max-h-[calc(100vh-6rem-var(--anchor-ad-h,0px))] overflow-y-auto overscroll-contain pr-2">
          {railContent}
        </div>
      </aside>

      {/* The same widgets, one tap away, below xl.
          The contents mount only while the sheet is open: FeedRightRail fetches
          /api/feed/rail-widgets on mount, and a permanently-mounted second copy
          would put an extra request on every feed load on every phone for a
          panel nobody had opened. */}
      <BottomSheet
        open={railOpen}
        onOpenChange={setRailOpen}
        title="Earnings & discovery"
        description="Your balance, daily mission, referrals and who to follow."
      >
        {railOpen && <div className="space-y-3 pb-2">{railContent}</div>}
      </BottomSheet>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feed tab
// ─────────────────────────────────────────────────────────────────────────────

function FeedTab({
  user,
  initialBanners,
  initialFeedAd,
  initialTicker,
  tickerConfig,
  sort,
  canBoost,
  canShareLinks,
  canShareYouTube,
  canDonate,
  feedAdInterval,
  underPostBanner,
  underPostInterval,
}: {
  user: SessionUser;
  initialBanners: BannerSlide[];
  initialFeedAd?: FeedAd | null;
  initialTicker: WithdrawalTickerItem[];
  tickerConfig?: TickerConfig;
  sort: Sort;
  canBoost?: boolean;
  canShareLinks?: boolean;
  canShareYouTube?: boolean;
  canDonate?: boolean;
  feedAdInterval: number;
  underPostBanner: boolean;
  underPostInterval: number;
}) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Per-session jitter seed → the main feed reshuffles each session, and each
  // pull-to-refresh regenerates it for fresh variety, while staying stable
  // across pages within one session (same seed).
  const seedRef = useRef<string>(Math.random().toString(36).slice(2));
  // Baseline for the live "new activity" pill — the max lastActivityAt from the
  // last full load. The pulse poll compares against this.
  const latestSeenRef = useRef<number>(0);
  const [hasNewActivity, setHasNewActivity] = useState(false);

  // Native in-feed ad pool — each ad is consumed once, in order, spaced through
  // the feed (no repeats while scrolling). We fetch more (excluding already-seen
  // ids) as the pool is consumed; de-dupe on append so a server fallback repeat
  // is never re-added.
  // Seed with the SSR-injected first ad so it paints from the server HTML (an
  // ad-blocker can't hide markup already in the document); the client fetches
  // the rest via /api/feed/inline, excluding this one.
  const [feedAds, setFeedAds] = useState<FeedAd[]>(
    initialFeedAd ? [initialFeedAd] : []
  );
  const feedAdIdsRef = useRef<Set<string>>(
    new Set(initialFeedAd ? [initialFeedAd.adId] : [])
  );
  const loadingAdsRef = useRef(false);

  const PAGE_SIZE = 20;

  const fetchFeedAds = async () => {
    if (loadingAdsRef.current) return;
    loadingAdsRef.current = true;
    try {
      const exclude = Array.from(feedAdIdsRef.current).join(",");
      const res = await fetch(
        `/api/feed/inline?count=10${exclude ? `&exclude=${encodeURIComponent(exclude)}` : ""}`
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

  // `reshuffle` regenerates the session seed (pull-to-refresh → new order);
  // the pill reload keeps the seed so only genuinely-resurfaced posts move.
  const load = async (reshuffle = false) => {
    if (reshuffle) seedRef.current = Math.random().toString(36).slice(2);
    try {
      const res = await fetch(
        `/api/feed?page=1&limit=${PAGE_SIZE}&seed=${seedRef.current}`
      );
      const data = await res.json();
      const items: FeedPost[] = data.posts ?? [];
      setPosts(items);
      setPage(1);
      setHasMore(items.length >= PAGE_SIZE);
      // Reset the live-pill baseline to the freshest activity we just loaded.
      if (data.latestActivityAt) {
        latestSeenRef.current = new Date(data.latestActivityAt).getTime();
      }
      setHasNewActivity(false);
    } catch {
      setPosts([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
    void fetchFeedAds();
  };

  // Pull-to-refresh should reshuffle for fresh variety.
  const refresh = () => load(true);
  // App-wide pull-to-refresh (from the layout shell) re-pulls the feed too.
  useAppRefresh(refresh);

  // Refs so the ~30s pollers below always see the latest load fn + posts without
  // re-subscribing their timers on every render.
  const loadRef = useRef(load);
  loadRef.current = load;
  const postsRef = useRef(posts);
  postsRef.current = posts;

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = page + 1;
    try {
      const res = await fetch(
        `/api/feed?page=${next}&limit=${PAGE_SIZE}&seed=${seedRef.current}`
      );
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

  // Instant bubble: when the viewer comments on a post, float it to the top
  // right away (server already bumped lastActivityAt). Advance the pill baseline
  // so this own-action doesn't also trigger the "new activity" pill.
  const handlePostBumped = useCallback((id: string) => {
    latestSeenRef.current = Date.now();
    setPosts((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx <= 0) return prev; // already at top or not present
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.unshift(moved);
      return next;
    });
  }, []);

  // Live "new activity" — poll the cheap /api/feed/pulse signal (~30s, paused
  // while the tab is hidden). If there's newer activity: when the user is at the
  // top, pull it in seamlessly (Facebook-style); otherwise surface the pill so
  // the view never jumps under them.
  useAutoRefresh(
    useCallback(async () => {
      try {
        const res = await fetch("/api/feed/pulse");
        if (!res.ok) return;
        const data = await res.json();
        if (!data.latestActivityAt) return;
        const latest = new Date(data.latestActivityAt).getTime();
        if (latest > latestSeenRef.current) {
          if (window.scrollY <= 4) {
            latestSeenRef.current = latest;
            void loadRef.current();
          } else {
            setHasNewActivity(true);
          }
        }
      } catch {
        /* transient — try again next tick */
      }
    }, []),
    { intervalMs: 30000 }
  );

  // Live engagement counts — patch like/comment counts of the posts on screen so
  // other users' likes/comments update in place without a reload (~30s, paused
  // while hidden). Bounded to the visible window; own optimistic `liked` state is
  // untouched (only the numeric counts are patched).
  useAutoRefresh(
    useCallback(async () => {
      const ids = postsRef.current.slice(0, 30).map((p) => p.id);
      if (ids.length === 0) return;
      try {
        const res = await fetch("/api/feed/counts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) return;
        const data = await res.json();
        for (const c of (data.counts ?? []) as Array<{
          id: string;
          likesCount: number;
          commentsCount: number;
        }>) {
          handlePostUpdated(c.id, {
            likesCount: c.likesCount,
            commentsCount: c.commentsCount,
          });
        }
      } catch {
        /* transient */
      }
    }, [handlePostUpdated]),
    { intervalMs: 30000 }
  );

  const showNewActivity = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    void load(); // same seed — only resurfaced posts move
  };

  return (
    <div className="space-y-4">
      {hasNewActivity && (
        <div className="sticky top-2 z-20 flex justify-center">
          <button
            onClick={showNewActivity}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-indigo-500 text-white text-sm font-semibold shadow-lg hover:bg-indigo-600 transition-colors"
          >
            <ArrowUp className="w-4 h-4" />
            New posts
          </button>
        </div>
      )}
      {/* Write first. The composer is the one thing on this column the viewer
          can only do here, so it goes above the promotional furniture rather
          than below a banner, a ticker and two strips of widgets — which is the
          order it used to arrive in, three screens down on a phone. */}
      <CreatePostComposer
        user={user}
        onCreated={handlePostCreated}
        canShareLinks={canShareLinks}
        canShareYouTube={canShareYouTube}
        canDonate={canDonate}
      />

      {/* Banner and ticker are both ambient — nothing here is a decision the
          viewer has to make — so they sit between the composer and the posts
          instead of in front of them. */}
      {initialBanners.length > 0 && <BannerSlider slides={initialBanners} />}

      {initialTicker.length > 0 && (
        <WithdrawalTicker
          items={initialTicker}
          showAmount={tickerConfig?.showAmount}
          showMethod={tickerConfig?.showMethod}
          showCountry={tickerConfig?.showCountry}
          speedSec={tickerConfig?.speedSec}
        />
      )}

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
            // Native ad after every `feedAdInterval` posts. Each ad is consumed
            // once (no modulo wrap) so nothing repeats while scrolling; empty
            // slots (pool not yet grown) simply show no ad.
            const n = Math.max(1, feedAdInterval);
            const slot = Math.floor(i / n);
            const ad =
              (i + 1) % n === 0 && slot < feedAds.length ? feedAds[slot] : null;
            // The under-post banner honours its interval.
            //
            // `underPostInterval` was read from settings, clamped, threaded
            // through three components and then discarded here — the prop was
            // renamed `_underPostInterval` with a comment claiming the rail
            // consumed it, which the rail never did. FeedPostCard gated on the
            // boolean alone, so the banner rendered under EVERY post: twenty
            // concurrent serve calls on a twenty-post page, and an admin setting
            // that did nothing.
            const un = Math.max(1, underPostInterval);
            const showUnderPost = underPostBanner && (i + 1) % un === 0;
            return (
              <Fragment key={post.id}>
                <FeedPostCard
                  post={post}
                  currentUserId={user.id}
                  currentUserRole={user.role ?? null}
                  canBoost={canBoost}
                  onUpdatePost={handlePostUpdated}
                  onDeletePost={handlePostDeleted}
                  onBumpPost={handlePostBumped}
                  underPostBanner={showUnderPost}
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
  );
}
