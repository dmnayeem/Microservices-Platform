"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { FeedAdCard, type FeedAd } from "@/components/user/feed/feed-ad-card";
import {
  Image as ImageIcon,
  X,
  Send,
  Loader2,
  Heart,
  MessageCircle,
  Share2,
  Megaphone,
  MoreHorizontal,
  ListChecks,
  HandCoins,
  Type as TypeIcon,
  Plus,
  Flame,
  Clock,
  Users,
  Compass,
  Sparkles,
  BarChart3,
  CheckCircle,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Smile,
  Palette,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { PullToRefresh } from "@/components/user/primitives/pull-to-refresh";
import { profileHref } from "@/lib/user-href";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  POST_BACKGROUNDS,
  getPostBackground,
} from "@/lib/post-backgrounds";
import { compressImageToTarget } from "@/lib/image-compress";
import {
  BannerSlider,
  type BannerSlide,
} from "@/components/user/primitives/banner-slider";
import {
  WithdrawalTicker,
  type WithdrawalTickerItem,
} from "@/components/user/primitives/withdrawal-ticker";
import { ShareModal } from "@/components/user/primitives/share-modal";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { PostAnalyticsPanel } from "@/components/user/feed/post-analytics-panel";
import { MobileEarnBlock } from "@/components/user/feed/mobile-earn-block";
import {
  FeedRightRail,
  type RailEarner,
  type RailFollowUser,
  type RailPromo,
} from "@/components/user/feed/feed-right-rail";
import type { FeedWidgetConfig } from "@/lib/feed-widgets";
import type { QuickEarnTile } from "@/lib/feed-quick-earn";
import type { CustomWidget } from "@/lib/feed-custom-widgets";

interface SessionUser {
  id: string;
  name: string | null;
  avatar: string | null;
  /** Role of the viewer. Used to surface admin-only UI affordances
   *  (announcement toggle, promote/un-promote menu, force-delete). */
  role?: string | null;
}

interface PollOption {
  id: string;
  label: string;
  voteCount: number;
}

interface FeedPost {
  id: string;
  content: string;
  images: string[];
  backgroundStyle?: string | null;
  isPinned: boolean;
  isAnnouncement?: boolean;
  isPromoted?: boolean;
  promotedUntil?: string | null;
  promotedNote?: string | null;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount?: number;
  pollOptions?: PollOption[] | null;
  pollEndsAt?: string | null;
  donationGoal?: number | null;
  donationCollected?: number;
  groupId?: string | null;
  myVote?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string | null;
    username?: string | null;
    avatar: string | null;
    level: number;
    packageTier: string;
    isBlueVerified?: boolean;
    role?: string | null;
  };
  isLiked: boolean;
  isOwner: boolean;
  isFollowingAuthor?: boolean;
}

interface FeedComment {
  id: string;
  content: string;
  parentId?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string | null;
    avatar: string | null;
    level: number;
  };
  isOwner: boolean;
}

interface TickerConfig {
  showAmount: boolean;
  showMethod: boolean;
  showCountry: boolean;
  speedSec: number;
}

interface Props {
  user: SessionUser;
  initialBanners: BannerSlide[];
  initialTicker: WithdrawalTickerItem[];
  tickerConfig?: TickerConfig;
  bestEarners: RailEarner[];
  whoToFollow: RailFollowUser[];
  trendingHashtags: { tag: string; count: number }[];
  promo?: RailPromo | null;
  widgetConfig?: FeedWidgetConfig;
  quickEarn?: QuickEarnTile[];
  customWidgets?: CustomWidget[];
  canBoost?: boolean;
}

type ViewTab = "feed" | "groups";
type Sort = "recent" | "trending";

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

  const handlePostUpdated = (id: string, patch: Partial<FeedPost>) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const handlePostDeleted = (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

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
                  onUpdated={(patch) => handlePostUpdated(post.id, patch)}
                  onDeleted={() => handlePostDeleted(post.id)}
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

// ─────────────────────────────────────────────────────────────────────────────
// Composer
// ─────────────────────────────────────────────────────────────────────────────

type ComposerMode = "text" | "poll" | "donation";

const COMPOSER_EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "🥰", "😎",
  "🤩", "😅", "😇", "🙂", "😉", "😌", "😴", "🤔",
  "😐", "🙃", "😭", "😡", "👍", "👎", "🙏", "👏",
  "🙌", "💪", "🤝", "✌️", "🤞", "👌", "🔥", "✨",
  "🎉", "🎊", "💯", "⚡", "🌟", "❤️", "🧡", "💛",
  "💚", "💙", "💜", "🖤", "💰", "💸", "🚀", "🏆",
];

function ComposerToolBtn({
  title,
  onClick,
  active,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "p-2 rounded-lg transition-colors disabled:opacity-50",
        active
          ? "bg-indigo-500/20 text-indigo-300"
          : "text-gray-400 hover:text-white hover:bg-gray-800"
      )}
    >
      {children}
    </button>
  );
}

function EmojiPopover({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full mt-1 z-50 w-64 max-w-[calc(100vw-2rem)] p-2 rounded-xl bg-gray-900 border border-gray-800 shadow-xl grid grid-cols-8 gap-0.5">
        {COMPOSER_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            className="w-7 h-7 text-lg leading-none rounded hover:bg-gray-800 flex items-center justify-center"
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}

function CreatePostComposer({
  user,
  onCreated,
}: {
  user: SessionUser;
  onCreated: (post: FeedPost) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<ComposerMode>("text");
  const [content, setContent] = useState("");
  const [imageInput, setImageInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [bg, setBg] = useState<string>(""); // colored-background id ("" = none)
  const [uploading, setUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollDuration, setPollDuration] = useState<24 | 48 | 72>(24);
  const [donationGoal, setDonationGoal] = useState<number>(1000);
  const [busy, setBusy] = useState(false);
  const [postAsAnnouncement, setPostAsAnnouncement] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // A colored background only applies to text-only posts.
  const activeBg = images.length === 0 ? getPostBackground(bg) : null;

  // Insert text at the textarea caret (used by the emoji picker).
  const insertAtCaret = (text: string) => {
    const el = textareaRef.current;
    if (!el) {
      setContent((c) => c + text);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + text + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // Wrap the current selection in a markdown marker (** bold, * italic).
  const wrapSelection = (marker: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const sel = content.slice(start, end) || "text";
    const next =
      content.slice(0, start) + marker + sel + marker + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + marker.length, start + marker.length + sel.length);
    });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please pick an image");
      return;
    }
    // Sanity cap on the SOURCE so we don't try to decode absurd files; the
    // compressed output is tiny (~50–70 KB), so the 5 MB upload limit is moot.
    if (f.size > 25 * 1024 * 1024) {
      toast.error("Image too large (max 25MB)");
      return;
    }
    setUploading(true);
    try {
      // Auto-compress to ~50–70 KB (WebP) before upload — quality stays crisp.
      const out = await compressImageToTarget(f);
      const fd = new FormData();
      fd.append("file", out);
      fd.append("folder", "posts");
      const res = await fetch("/api/upload", { method: "PUT", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) throw new Error(d.error ?? `HTTP ${res.status}`);
      setImages((prev) => [...prev, d.url as string]);
      setBg(""); // images and colored background are mutually exclusive
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setUploading(false);
    }
  };

  // Only admin-ish roles see the announcement toggle. We don't enforce
  // here — the server gates `social.post`.
  const canAnnounce =
    !!user.role && user.role !== "USER" && user.role !== "user";

  const reset = () => {
    setContent("");
    setImageInput("");
    setImages([]);
    setBg("");
    setShowEmoji(false);
    setPollOptions(["", ""]);
    setPollDuration(24);
    setDonationGoal(1000);
    setExpanded(false);
    setMode("text");
    setPostAsAnnouncement(false);
  };

  const addImage = () => {
    const v = imageInput.trim();
    if (!v) return;
    setImages((prev) => [...prev, v]);
    setImageInput("");
    setBg(""); // images and colored background are mutually exclusive
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (!content.trim()) {
      toast.error("Write something first");
      return;
    }
    if (mode === "poll") {
      const cleaned = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (cleaned.length < 2) {
        toast.error("Add at least 2 poll options");
        return;
      }
    }
    if (mode === "donation" && donationGoal < 1) {
      toast.error("Donation goal must be at least 1 pt");
      return;
    }
    setBusy(true);
    try {
      const cleanedPoll =
        mode === "poll"
          ? pollOptions.map((o) => o.trim()).filter(Boolean).slice(0, 8)
          : null;
      // Announcements use the dedicated admin endpoint so the server
      // gate is explicit. Everything else goes through the regular path.
      const endpoint =
        canAnnounce && postAsAnnouncement
          ? "/api/admin/feed/announce"
          : "/api/feed";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          images,
          isPublic: true,
          backgroundStyle:
            mode === "text" && images.length === 0 && bg ? bg : null,
          ...(cleanedPoll && {
            pollOptions: cleanedPoll.map((label) => ({ label })),
            pollEndsAt: new Date(
              Date.now() + pollDuration * 60 * 60 * 1000
            ).toISOString(),
          }),
          ...(mode === "donation" && {
            donationGoal,
          }),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      onCreated(data.post);
      reset();
      toast.success(
        canAnnounce && postAsAnnouncement ? "Announcement posted!" : "Posted!"
      );
    } catch (err) {
      toast.error("Failed to post", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const initial = (user.name ?? "U").charAt(0).toUpperCase();

  if (!expanded) {
    const firstName = user.name?.split(" ")[0] ?? "there";
    const quickActions = [
      {
        label: "Photo",
        icon: ImageIcon,
        tone: "text-emerald-400",
        onClick: () => {
          setMode("text");
          setExpanded(true);
        },
      },
      {
        label: "Poll",
        icon: ListChecks,
        tone: "text-amber-400",
        onClick: () => {
          setMode("poll");
          setExpanded(true);
        },
      },
      {
        label: "Colored",
        icon: Palette,
        tone: "text-pink-400",
        onClick: () => {
          setMode("text");
          setExpanded(true);
        },
      },
    ];
    return (
      <div className="rounded-2xl border border-indigo-500/30 bg-linear-to-br from-indigo-500/10 via-purple-500/5 to-gray-900 p-3 shadow-lg shadow-indigo-500/5">
        {/* Top row — tap anywhere to open the composer */}
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-3 group"
        >
          <div className="w-11 h-11 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0 ring-2 ring-indigo-500/30">
            {initial}
          </div>
          <span className="flex-1 text-left rounded-full bg-gray-950/80 border border-gray-700 group-hover:border-indigo-500/50 px-4 py-2.5 text-sm text-gray-400 transition-colors truncate">
            What&apos;s on your mind, {firstName}?
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-linear-to-r from-indigo-500 to-purple-600 text-white text-sm font-bold shrink-0">
            <Send className="w-4 h-4" />
            Post
          </span>
        </button>

        {/* Quick actions */}
        <div className="mt-2.5 pt-2.5 border-t border-white/5 grid grid-cols-3 gap-1">
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className="inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-gray-300 hover:bg-white/5 transition-colors"
            >
              <a.icon className={cn("w-4 h-4", a.tone)} />
              {a.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium shrink-0">
          {initial}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">
            {user.name ?? "You"}
          </p>
          <p className="text-[11px] text-gray-500">Posting publicly</p>
        </div>
        <button
          onClick={reset}
          disabled={busy}
          className="p-1.5 text-gray-500 hover:text-red-400 disabled:opacity-50"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1">
        {(
          [
            { key: "text", label: "Text", icon: TypeIcon },
            { key: "poll", label: "Poll", icon: ListChecks },
            { key: "donation", label: "Donation", icon: HandCoins },
          ] as const
        ).map((m) => {
          const isActive = m.key === mode;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                isActive
                  ? "bg-indigo-500/15 text-white border-indigo-500/40"
                  : "bg-gray-950 text-gray-400 border-gray-800 hover:text-white"
              )}
            >
              <m.icon className="w-3.5 h-3.5" />
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === "text" && (
        <>
          {/* Composer surface — a colored background applies to text-only posts */}
          <div
            className={cn(
              "rounded-xl border transition-colors",
              activeBg
                ? cn("border-transparent", activeBg.className)
                : "border-gray-800 bg-gray-950"
            )}
          >
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              rows={activeBg ? 5 : 4}
              maxLength={2000}
              disabled={busy}
              className={cn(
                "w-full bg-transparent px-3 py-3 focus:outline-none resize-none",
                activeBg
                  ? cn(
                      "text-center text-lg font-semibold min-h-36 flex items-center justify-center",
                      activeBg.textClass,
                      activeBg.textClass === "text-white"
                        ? "placeholder:text-white/70"
                        : "placeholder:text-gray-900/60"
                    )
                  : "text-sm text-white placeholder:text-gray-500"
              )}
            />
          </div>

          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {images.map((url, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded-lg overflow-hidden bg-gray-950 border border-gray-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/70 hover:bg-red-500/80 text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Formatting toolbar */}
          <div className="flex items-center gap-1">
            <ComposerToolBtn title="Bold" onClick={() => wrapSelection("**")}>
              <BoldIcon className="w-4 h-4" />
            </ComposerToolBtn>
            <ComposerToolBtn title="Italic" onClick={() => wrapSelection("*")}>
              <ItalicIcon className="w-4 h-4" />
            </ComposerToolBtn>
            <div className="relative">
              <ComposerToolBtn
                title="Emoji"
                active={showEmoji}
                onClick={() => setShowEmoji((v) => !v)}
              >
                <Smile className="w-4 h-4" />
              </ComposerToolBtn>
              {showEmoji && (
                <EmojiPopover
                  onPick={(e) => insertAtCaret(e)}
                  onClose={() => setShowEmoji(false)}
                />
              )}
            </div>
            <ComposerToolBtn
              title="Add photo"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || busy}
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
            </ComposerToolBtn>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            <span className="ml-auto text-[10px] text-gray-500 hidden sm:inline">
              **bold** · *italic*
            </span>
          </div>

          {/* Colored background swatches (text-only posts) */}
          {images.length === 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setBg("")}
                title="No background"
                className={cn(
                  "w-7 h-7 rounded-full border border-gray-700 bg-gray-950 inline-flex items-center justify-center text-gray-500",
                  !bg && "ring-2 ring-indigo-400"
                )}
              >
                <X className="w-3.5 h-3.5" />
              </button>
              {POST_BACKGROUNDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  title={b.label}
                  onClick={() => setBg(b.id)}
                  className={cn(
                    "w-7 h-7 rounded-full",
                    b.className,
                    bg === b.id && "ring-2 ring-white ring-offset-2 ring-offset-gray-900"
                  )}
                />
              ))}
            </div>
          )}

          {/* Optional: paste an image URL */}
          <div className="flex gap-2">
            <input
              type="url"
              value={imageInput}
              onChange={(e) => setImageInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addImage())}
              placeholder="…or paste an image URL"
              disabled={busy}
              className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={addImage}
              disabled={busy || !imageInput.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </>
      )}

      {mode === "poll" && (
        <PollComposer
          options={pollOptions}
          onChange={setPollOptions}
          duration={pollDuration}
          onDurationChange={setPollDuration}
          content={content}
          onContentChange={setContent}
        />
      )}

      {mode === "donation" && (
        <DonationComposer
          content={content}
          onContentChange={setContent}
          goal={donationGoal}
          onGoalChange={setDonationGoal}
        />
      )}

      {canAnnounce && (
        <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2">
          <input
            type="checkbox"
            checked={postAsAnnouncement}
            onChange={(e) => setPostAsAnnouncement(e.target.checked)}
            disabled={busy}
            className="rounded bg-gray-800 border-gray-600 text-cyan-500 focus:ring-cyan-500"
          />
          <Megaphone className="w-3.5 h-3.5 text-cyan-300" />
          <span className="text-xs font-semibold text-cyan-200">
            Post as Official Announcement
          </span>
          <span className="text-[10px] text-cyan-400/70 ml-auto">
            Pinned to top • OFFICIAL badge
          </span>
        </label>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-gray-800">
        <span className="text-[11px] text-gray-500 tabular-nums">
          {content.length}/2000
        </span>
        <button
          onClick={submit}
          disabled={busy || (mode === "text" && !content.trim())}
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-opacity hover:opacity-90",
            canAnnounce && postAsAnnouncement
              ? "bg-linear-to-r from-cyan-500 to-blue-600"
              : "bg-linear-to-r from-indigo-500 to-purple-600"
          )}
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : canAnnounce && postAsAnnouncement ? (
            <Megaphone className="w-4 h-4" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {canAnnounce && postAsAnnouncement
            ? "Post Announcement"
            : mode === "poll"
              ? "Post Poll"
              : mode === "donation"
                ? "Start Fundraiser"
                : "Post"}
        </button>
      </div>
    </div>
  );
}

function PollComposer({
  options,
  onChange,
  duration,
  onDurationChange,
  content,
  onContentChange,
}: {
  options: string[];
  onChange: (next: string[]) => void;
  duration: 24 | 48 | 72;
  onDurationChange: (d: 24 | 48 | 72) => void;
  content: string;
  onContentChange: (c: string) => void;
}) {
  return (
    <div className="space-y-2">
      <input
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        placeholder="Poll question…"
        maxLength={200}
        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500"
      />
      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={opt}
              onChange={(e) => {
                const next = [...options];
                next[i] = e.target.value;
                onChange(next);
              }}
              placeholder={`Option ${i + 1}`}
              maxLength={120}
              className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500"
            />
            {options.length > 2 && (
              <button
                onClick={() => onChange(options.filter((_, j) => j !== i))}
                className="p-1.5 text-gray-500 hover:text-red-400"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {options.length < 6 && (
          <button
            onClick={() => onChange([...options, ""])}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            Add option
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Duration:</span>
        {([24, 48, 72] as const).map((d) => (
          <button
            key={d}
            onClick={() => onDurationChange(d)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-bold",
              duration === d
                ? "bg-indigo-500 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            )}
          >
            {d}h
          </button>
        ))}
      </div>
    </div>
  );
}

function DonationComposer({
  content,
  onContentChange,
  goal,
  onGoalChange,
}: {
  content: string;
  onContentChange: (c: string) => void;
  goal: number;
  onGoalChange: (g: number) => void;
}) {
  return (
    <div className="space-y-2">
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        placeholder="What's your donation cause?"
        rows={3}
        maxLength={2000}
        className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Goal (pts):</span>
        <input
          type="number"
          min={100}
          step={100}
          value={goal}
          onChange={(e) => onGoalChange(parseInt(e.target.value) || 0)}
          className="w-32 bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FeedPostCard
// ─────────────────────────────────────────────────────────────────────────────

function FeedPostCard({
  post,
  currentUserId,
  currentUserRole,
  canBoost,
  onUpdated,
  onDeleted,
}: {
  post: FeedPost;
  currentUserId: string;
  currentUserRole: string | null;
  canBoost?: boolean;
  onUpdated: (patch: Partial<FeedPost>) => void;
  onDeleted: () => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const viewFiredRef = useRef(false);
  const initial = (post.user?.name ?? "U").charAt(0).toUpperCase();
  const isAdmin =
    !!currentUserRole &&
    currentUserRole !== "USER" &&
    currentUserRole !== "user";

  // Facebook-style colored background: only for short text-only posts (no
  // images, poll, or donation).
  const hasPoll = !!post.pollOptions && post.pollOptions.length > 0;
  const hasDonation =
    typeof post.donationGoal === "number" && post.donationGoal > 0;
  const postBg =
    post.images.length === 0 && !hasPoll && !hasDonation
      ? getPostBackground(post.backgroundStyle)
      : null;

  const promotionActive =
    !!post.isPromoted &&
    (post.promotedUntil == null ||
      new Date(post.promotedUntil).getTime() > Date.now());

  // Close the action menu on outside-click
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const toggleAnnounce = async () => {
    if (busy) return;
    setBusy(true);
    setMenuOpen(false);
    const next = !post.isAnnouncement;
    try {
      const res = await fetch(`/api/admin/feed/${post.id}/announce`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAnnouncement: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      onUpdated({ isAnnouncement: next });
      toast.success(next ? "Marked as announcement" : "Announcement removed");
    } catch (err) {
      toast.error("Couldn't update", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const forceDelete = async () => {
    if (busy) return;
    if (
      !(await confirmDialog({
        title: "Force-delete this post?",
        description: "This action is logged and cannot be undone.",
        tone: "danger",
        confirmLabel: "Delete",
      }))
    ) {
      return;
    }
    setBusy(true);
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/admin/feed/${post.id}`, {
        method: "DELETE",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      onDeleted();
      toast.success("Post deleted");
    } catch (err) {
      setBusy(false);
      toast.error("Couldn't delete", {
        description: err instanceof Error ? err.message : "Try again",
      });
    }
  };

  // View tracking — fire once when the post is ≥50% visible for ≥2s
  useEffect(() => {
    if (post.isOwner) return; // never count own views
    if (viewFiredRef.current) return;
    const el = articleRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            if (timer) continue;
            timer = setTimeout(() => {
              if (viewFiredRef.current) return;
              viewFiredRef.current = true;
              fetch(`/api/feed/${post.id}/view`, { method: "POST" })
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => {
                  if (d?.counted && typeof d.viewsCount === "number") {
                    onUpdated({ viewsCount: d.viewsCount });
                  }
                })
                .catch(() => {})
                .finally(() => observer.disconnect());
            }, 2000);
          } else {
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
          }
        }
      },
      { threshold: [0, 0.5, 1] }
    );
    observer.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, post.isOwner]);

  const toggleFollowAuthor = async () => {
    if (!post.user?.id || followBusy) return;
    setFollowBusy(true);
    const wasFollowing = !!post.isFollowingAuthor;
    onUpdated({ isFollowingAuthor: !wasFollowing });
    try {
      const r = await fetch(`/api/users/${post.user.id}/follow`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      onUpdated({ isFollowingAuthor: !!d.following });
    } catch {
      onUpdated({ isFollowingAuthor: wasFollowing });
      toast.error("Couldn't update follow");
    } finally {
      setFollowBusy(false);
    }
  };

  const toggleLike = async () => {
    if (busy) return;
    setBusy(true);
    const wasLiked = post.isLiked;
    // Optimistic
    onUpdated({
      isLiked: !wasLiked,
      likesCount: post.likesCount + (wasLiked ? -1 : 1),
    });
    try {
      const res = await fetch(`/api/feed/${post.id}/like`, {
        method: wasLiked ? "DELETE" : "POST",
      });
      if (!res.ok && res.status !== 409) {
        // 409 = already liked
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      // Revert
      onUpdated({
        isLiked: wasLiked,
        likesCount: post.likesCount,
      });
      toast.error("Couldn't update like");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      ref={articleRef}
      className={cn(
        "relative rounded-xl border bg-gray-900 overflow-hidden",
        post.isAnnouncement
          ? "border-cyan-500/40 ring-1 ring-cyan-500/20"
          : promotionActive
            ? "border-amber-500/40"
            : "border-gray-800"
      )}
    >
      {/* Top-right badge (OFFICIAL > PROMOTED, mutually exclusive in render). */}
      {(post.isAnnouncement || promotionActive) && (
        <div className="absolute top-3 right-3 z-10">
          {post.isAnnouncement ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500 text-gray-950 px-2 py-0.5 text-[10px] font-extrabold tracking-wider uppercase shadow-md">
              <Megaphone className="w-3 h-3" />
              Official
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-amber-500 text-gray-950 px-2 py-0.5 text-[10px] font-extrabold tracking-wider uppercase shadow-md"
              title={post.promotedNote ? `Promoted by ${post.promotedNote}` : "Promoted"}
            >
              <Sparkles className="w-3 h-3" />
              Promoted
            </span>
          )}
        </div>
      )}
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Link
            href={post.user ? profileHref(post.user) : "#"}
            className="shrink-0"
          >
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium overflow-hidden">
              {post.user?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.user.avatar}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                initial
              )}
            </div>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5">
              <Link
                href={post.user ? profileHref(post.user) : "#"}
                className="text-sm font-semibold text-white hover:text-indigo-400 transition-colors"
              >
                {post.user?.name ?? "Anonymous"}
              </Link>
              {post.user?.isBlueVerified && (
                <CheckCircle
                  className="w-3.5 h-3.5 text-blue-400 fill-blue-500/30"
                  aria-label="Verified"
                />
              )}
              {post.user && post.user.level >= 10 && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">
                  Lvl {post.user.level}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500">
              {formatDistanceToNow(new Date(post.createdAt), {
                addSuffix: true,
              })}
            </p>
          </div>
          {!post.isOwner && post.user && (
            <button
              onClick={toggleFollowAuthor}
              disabled={followBusy}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-colors disabled:opacity-50",
                post.isFollowingAuthor
                  ? "bg-gray-800 text-white border border-gray-700"
                  : "bg-indigo-500 hover:bg-indigo-600 text-white"
              )}
            >
              {followBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : post.isFollowingAuthor ? (
                "Following"
              ) : (
                "Follow"
              )}
            </button>
          )}
          {(post.isOwner || isAdmin) && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="p-1.5 text-gray-500 hover:text-white"
                aria-label="Post actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-52 rounded-lg border border-gray-700 bg-gray-950 shadow-xl z-20 overflow-hidden">
                  {isAdmin && (
                    <>
                      <button
                        onClick={toggleAnnounce}
                        disabled={busy}
                        className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-900 inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        <Megaphone className="w-3.5 h-3.5 text-cyan-400" />
                        {post.isAnnouncement
                          ? "Remove Announcement"
                          : "Mark as Announcement"}
                      </button>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          setPromoteOpen(true);
                        }}
                        disabled={busy}
                        className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-900 inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        {promotionActive ? "Edit Promotion" : "Promote Post"}
                      </button>
                      <div className="border-t border-gray-800" />
                      <button
                        onClick={forceDelete}
                        disabled={busy}
                        className="w-full text-left px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        Force Delete
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        {post.content &&
          (postBg ? (
            <div
              className={cn(
                "mt-3 rounded-xl px-4 py-10 min-h-40 flex items-center justify-center text-center",
                postBg.className
              )}
            >
              <p
                className={cn(
                  "text-xl font-bold leading-snug whitespace-pre-wrap break-words",
                  postBg.textClass
                )}
              >
                <RenderedContent content={post.content} />
              </p>
            </div>
          ) : (
            <p className="text-[15px] text-gray-200 leading-relaxed whitespace-pre-wrap mt-3">
              <RenderedContent content={post.content} />
            </p>
          ))}
      </div>

      {/* Images */}
      {post.images.length > 0 && (
        <div
          className={cn(
            "grid gap-px bg-gray-800",
            post.images.length === 1 && "grid-cols-1",
            post.images.length === 2 && "grid-cols-2",
            post.images.length >= 3 && "grid-cols-3"
          )}
        >
          {post.images.slice(0, 6).map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt=""
              onError={(e) => {
                // Hide broken images so a bad URL doesn't leave a giant empty box.
                e.currentTarget.style.display = "none";
              }}
              className={cn(
                "w-full bg-gray-950",
                // A lone image keeps its natural shape (capped height); grids stay square.
                post.images.length === 1
                  ? "max-h-[70vh] object-contain"
                  : "aspect-square object-cover"
              )}
            />
          ))}
        </div>
      )}

      {/* Poll */}
      {post.pollOptions && post.pollOptions.length > 0 && (
        <PollBlock post={post} onUpdated={onUpdated} />
      )}

      {/* Donation progress */}
      {typeof post.donationGoal === "number" && post.donationGoal > 0 && (
        <DonationBlock post={post} onUpdated={onUpdated} />
      )}

      {/* Reactions row */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-800">
        <button
          onClick={toggleLike}
          disabled={busy}
          className={cn(
            "inline-flex items-center gap-1.5 text-sm transition-colors",
            post.isLiked
              ? "text-red-400"
              : "text-gray-400 hover:text-red-400"
          )}
        >
          <Heart
            className={cn(
              "w-4 h-4",
              post.isLiked && "fill-red-400 text-red-400"
            )}
          />
          <span className="tabular-nums font-medium">{post.likesCount}</span>
        </button>
        <button
          onClick={() => setShowComments((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
        >
          <MessageCircle className="w-4 h-4" />
          <span className="tabular-nums font-medium">
            {post.commentsCount}
          </span>
        </button>
        <button
          onClick={() => setShareOpen(true)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
        >
          <Share2 className="w-4 h-4" />
          Share
        </button>
        {post.isOwner && !post.isPinned && canBoost && (
          <button
            onClick={async () => {
              if (
                !(await confirmDialog({
                  title: "Boost this post for 100 pts?",
                  description: "Boosted posts pin to the top of the feed.",
                  tone: "info",
                  confirmLabel: "Boost",
                }))
              )
                return;
              try {
                const res = await fetch(`/api/feed/${post.id}/boost`, {
                  method: "POST",
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                toast.success("Boosted! Your post is now pinned.");
                onUpdated({ isPinned: true });
              } catch (err) {
                toast.error("Boost failed", {
                  description: err instanceof Error ? err.message : "Try again",
                });
              }
            }}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-amber-400 ml-auto"
          >
            <Megaphone className="w-4 h-4" />
            Boost
          </button>
        )}
        {post.isPinned && (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-bold">
            <Megaphone className="w-3.5 h-3.5" />
            Boosted
          </span>
        )}
        {post.isOwner && (
          <button
            onClick={() => setShowAnalytics((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-indigo-400 ml-auto"
            title="View analytics"
          >
            <BarChart3 className="w-4 h-4" />
            <span className="tabular-nums text-xs">{post.viewsCount ?? 0}</span>
          </button>
        )}
      </div>

      {showAnalytics && post.isOwner && (
        <PostAnalyticsPanel postId={post.id} />
      )}

      {showComments && (
        <CommentsSection postId={post.id} currentUserId={currentUserId} onCommentAdded={() => onUpdated({ commentsCount: post.commentsCount + 1 })} />
      )}

      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={`${typeof window !== "undefined" ? window.location.origin : ""}/social/${post.id}`}
        title={post.user?.name ? `Post by ${post.user.name}` : "EarnGPT post"}
        text={post.content.slice(0, 200)}
        onShare={async (channel) => {
          try {
            const r = await fetch(`/api/feed/${post.id}/share`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ channel }),
            });
            if (!r.ok) return;
            const d = (await r.json().catch(() => ({}))) as {
              sharesCount?: number;
            };
            if (typeof d.sharesCount === "number") {
              onUpdated({ sharesCount: d.sharesCount });
            }
          } catch {
            /* network failure — sharing already happened browser-side */
          }
        }}
      />

      {isAdmin && promoteOpen && (
        <PromoteModal
          post={post}
          onClose={() => setPromoteOpen(false)}
          onSaved={(patch) => {
            onUpdated(patch);
            setPromoteOpen(false);
          }}
        />
      )}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PromoteModal — lets an admin toggle PROMOTED, set an expiry, and tag a sponsor.
// ─────────────────────────────────────────────────────────────────────────────
function PromoteModal({
  post,
  onClose,
  onSaved,
}: {
  post: FeedPost;
  onClose: () => void;
  onSaved: (patch: Partial<FeedPost>) => void;
}) {
  const initialUntil = post.promotedUntil
    ? new Date(post.promotedUntil)
    : null;
  const [enabled, setEnabled] = useState(!!post.isPromoted);
  const [duration, setDuration] = useState<"1d" | "7d" | "30d" | "forever">(
    initialUntil ? "7d" : "forever"
  );
  const [note, setNote] = useState(post.promotedNote ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      let until: string | null = null;
      if (enabled && duration !== "forever") {
        const days = duration === "1d" ? 1 : duration === "7d" ? 7 : 30;
        until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      }
      const res = await fetch(`/api/admin/feed/${post.id}/promote`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPromoted: enabled,
          until,
          note: enabled ? note.trim() || null : null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      onSaved({
        isPromoted: !!d.isPromoted,
        promotedUntil: d.promotedUntil ?? null,
        promotedNote: d.promotedNote ?? null,
      });
      toast.success(enabled ? "Post promoted" : "Promotion removed");
    } catch (err) {
      toast.error("Couldn't update promotion", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-gray-950 shadow-2xl p-5 space-y-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-base font-bold text-white inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Promote Post
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Promoted posts get a PROMOTED badge and are interleaved through the feed.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded bg-gray-800 border-gray-600 text-amber-500 focus:ring-amber-500"
          />
          <span className="text-sm font-semibold text-white">
            Show PROMOTED badge
          </span>
        </label>

        {enabled && (
          <>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">
                Duration
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(["1d", "7d", "30d", "forever"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    type="button"
                    className={cn(
                      "px-2 py-1.5 rounded-md text-xs font-bold border",
                      duration === d
                        ? "bg-amber-500 border-amber-500 text-gray-950"
                        : "bg-gray-900 border-gray-800 text-gray-400 hover:text-white"
                    )}
                  >
                    {d === "forever" ? "Forever" : d.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold block mb-1.5">
                Sponsor / Note (optional)
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={120}
                placeholder='e.g. "NordVPN", "Coinbase"'
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Shown as a tooltip on the PROMOTED badge.
              </p>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={busy}
            type="button"
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            type="button"
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-950 text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {enabled ? "Save promotion" : "Remove promotion"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RenderedContent — splits text by @mentions and turns them into Links to /u/<id>
// ─────────────────────────────────────────────────────────────────────────────
// Render **bold** and *italic* markdown within a plain-text chunk as React nodes
// (no HTML injection). Used between @mention segments in RenderedContent.
function renderFormatted(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(<span key={`${keyPrefix}-t${k++}`}>{text.slice(last, m.index)}</span>);
    }
    if (m[1] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-b${k++}`} className="font-bold">
          {m[1]}
        </strong>
      );
    } else if (m[2] !== undefined) {
      out.push(
        <em key={`${keyPrefix}-i${k++}`} className="italic">
          {m[2]}
        </em>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(<span key={`${keyPrefix}-t${k++}`}>{text.slice(last)}</span>);
  }
  return out;
}

function RenderedContent({ content }: { content: string }) {
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const usernames = Array.from(content.matchAll(/@([a-zA-Z0-9_]{2,30})/g)).map(
      (m) => m[1].toLowerCase()
    );
    const unique = Array.from(new Set(usernames));
    if (unique.length === 0) return;
    let cancel = false;
    Promise.all(
      unique.map((u) =>
        fetch(`/api/users/search?q=${encodeURIComponent(u)}&limit=1`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            const hit = d?.users?.[0];
            return hit && hit.username?.toLowerCase() === u
              ? { username: u, id: hit.id }
              : null;
          })
          .catch(() => null)
      )
    ).then((rows) => {
      if (cancel) return;
      const map: Record<string, string> = {};
      for (const r of rows) {
        if (r) map[r.username] = r.id;
      }
      if (Object.keys(map).length > 0) setMentionMap(map);
    });
    return () => {
      cancel = true;
    };
  }, [content]);

  // Split content
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  for (const m of content.matchAll(/@([a-zA-Z0-9_]{2,30})/g)) {
    const start = m.index ?? 0;
    const username = m[1];
    if (start > lastIdx) {
      parts.push(...renderFormatted(content.slice(lastIdx, start), `p${key++}`));
    }
    const userId = mentionMap[username.toLowerCase()];
    if (userId) {
      parts.push(
        <Link
          key={key++}
          href={`/u/${encodeURIComponent(username)}`}
          className="text-indigo-400 hover:text-indigo-300 hover:underline font-semibold"
        >
          @{username}
        </Link>
      );
    } else {
      parts.push(<span key={key++}>@{username}</span>);
    }
    lastIdx = start + m[0].length;
  }
  if (lastIdx < content.length) {
    parts.push(...renderFormatted(content.slice(lastIdx), `p${key++}`));
  }
  return <>{parts}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────────────────────

function CommentsSection({
  postId,
  currentUserId,
  onCommentAdded,
}: {
  postId: string;
  currentUserId: string;
  onCommentAdded: () => void;
}) {
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/feed/${postId}/comments?page=1&limit=20`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setComments(d.comments ?? []);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/feed/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text.trim(),
          parentId: replyTo?.id ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setComments((prev) => [data.comment, ...prev]);
      setText("");
      setReplyTo(null);
      onCommentAdded();
    } catch (err) {
      toast.error("Couldn't comment", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  // Build a thread tree
  const topLevel = comments.filter((c) => !c.parentId);
  const repliesByParent = new Map<string, FeedComment[]>();
  for (const c of comments) {
    if (c.parentId) {
      const arr = repliesByParent.get(c.parentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentId, arr);
    }
  }

  const renderComment = (c: FeedComment, depth = 0) => {
    const replies = repliesByParent.get(c.id) ?? [];
    return (
      <li
        key={c.id}
        className={cn(
          "flex gap-2 items-start",
          c.user?.id === currentUserId && depth === 0 && "flex-row-reverse"
        )}
      >
        <div className="w-7 h-7 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
          {(c.user?.name ?? "U").charAt(0).toUpperCase()}
        </div>
        <div
          className={cn(
            "flex-1 min-w-0 rounded-lg px-2.5 py-1.5 max-w-[85%]",
            c.user?.id === currentUserId && depth === 0
              ? "bg-indigo-500/15"
              : "bg-gray-900"
          )}
        >
          <p className="text-xs font-semibold text-white">
            {c.user?.name ?? "Anonymous"}
          </p>
          <p className="text-sm text-gray-200 mt-0.5 break-words">{c.content}</p>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-[10px] text-gray-500">
              {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
            </p>
            {/* Allow replies up to depth 2 — produces a tree of root → reply → reply-to-reply.
                Past that, deeper replies still render but the Reply button hides so threads stay readable. */}
            {depth < 2 && (
              <button
                onClick={() => {
                  setReplyTo(c);
                  inputRef.current?.focus();
                }}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                Reply
              </button>
            )}
          </div>

          {replies.length > 0 && (
            <ul className="mt-2 space-y-1.5 pl-2 border-l border-gray-800">
              {replies.map((r) => renderComment(r, depth + 1))}
            </ul>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="border-t border-gray-800 px-4 py-3 space-y-3 bg-gray-950/40">
      {/* Input */}
      {replyTo && (
        <div className="flex items-center justify-between text-[11px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1.5 rounded-lg">
          <span className="truncate">
            Replying to <strong>{replyTo.user?.name ?? "Anonymous"}</strong>
          </span>
          <button
            onClick={() => setReplyTo(null)}
            className="ml-2 text-indigo-400 hover:text-white"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void submit())}
          placeholder={replyTo ? `Reply to ${replyTo.user?.name ?? "comment"}…` : "Add a comment…"}
          maxLength={500}
          disabled={busy}
          className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          Post
        </button>
      </div>

      {loading && (
        <p className="text-xs text-gray-500 text-center py-2">
          Loading comments…
        </p>
      )}

      {!loading && comments.length === 0 && (
        <p className="text-xs text-gray-500 text-center py-2">
          No comments yet — start the conversation.
        </p>
      )}

      {!loading && topLevel.length > 0 && (
        <ul className="space-y-2">{topLevel.map((c) => renderComment(c))}</ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups Tab — real implementation
// ─────────────────────────────────────────────────────────────────────────────

interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  type: "PUBLIC" | "PRIVATE";
  avatarUrl: string | null;
  memberCount: number;
  role?: string;
  isOwner?: boolean;
  hasPendingRequest?: boolean;
}

function GroupsTab() {
  const [scope, setScope] = useState<"mine" | "discover">("mine");
  const [mine, setMine] = useState<GroupSummary[]>([]);
  const [discover, setDiscover] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [m, d] = await Promise.all([
        fetch("/api/groups?scope=mine").then((r) =>
          r.ok ? r.json() : { groups: [] }
        ),
        fetch("/api/groups?scope=discover").then((r) =>
          r.ok ? r.json() : { groups: [] }
        ),
      ]);
      setMine(m.groups ?? []);
      setDiscover(d.groups ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const join = async (g: GroupSummary) => {
    setBusyId(g.id);
    try {
      const res = await fetch(`/api/groups/${g.id}/join`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.status === "joined") {
        toast.success(`Joined ${g.name}`);
      } else {
        toast.success("Join request sent");
      }
      load();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusyId(null);
    }
  };

  const list = scope === "mine" ? mine : discover;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1 flex-1">
          {(["mine", "discover"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn(
                "flex-1 py-1.5 text-xs font-semibold rounded transition-colors",
                scope === s ? "bg-indigo-500 text-white" : "text-gray-400"
              )}
            >
              {s === "mine"
                ? `My Groups${mine.length ? ` · ${mine.length}` : ""}`
                : `Discover${discover.length ? ` · ${discover.length}` : ""}`}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      </div>

      {loading && (
        <div className="text-center py-8 text-gray-500 text-sm">Loading…</div>
      )}

      {!loading && list.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-800 p-8 text-center">
          <Users className="w-10 h-10 text-gray-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-white">
            {scope === "mine"
              ? "You haven't joined any groups yet"
              : "No public groups to discover"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {scope === "mine"
              ? "Browse the Discover tab to find communities to join."
              : "Be the first — create one!"}
          </p>
        </div>
      )}

      {!loading && list.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {list.map((g) => (
            <div
              key={g.id}
              className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex items-start gap-3"
            >
              <div className="w-12 h-12 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0 overflow-hidden">
                {g.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={g.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Users className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-white truncate">
                    {g.name}
                  </p>
                  {g.type === "PRIVATE" && (
                    <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">
                      Private
                    </span>
                  )}
                  {g.isOwner && (
                    <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                      Owner
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">
                  {g.memberCount.toLocaleString()} member{g.memberCount === 1 ? "" : "s"}
                </p>
                {g.description && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                    {g.description}
                  </p>
                )}
                <div className="mt-2.5 flex items-center gap-2">
                  <Link
                    href={`/groups/${g.id}`}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    Open →
                  </Link>
                  {scope === "discover" && !g.hasPendingRequest && (
                    <button
                      onClick={() => join(g)}
                      disabled={busyId === g.id}
                      className="ml-auto px-3 py-1 rounded bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 text-xs font-bold disabled:opacity-50"
                    >
                      {busyId === g.id
                        ? "…"
                        : g.type === "PRIVATE"
                        ? "Request to join"
                        : "Join"}
                    </button>
                  )}
                  {g.hasPendingRequest && (
                    <span className="ml-auto text-[11px] text-amber-400 font-semibold">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          type,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success("Group created");
      onCreated();
    } catch (err) {
      toast.error("Couldn't create group", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={busy ? undefined : onClose}
      />
      <div className="relative bg-gray-900 border border-gray-800 rounded-xl shadow-2xl max-w-md w-full p-5">
        <h3 className="text-base font-bold text-white mb-3">Create Group</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Crypto Earners"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Description (optional)
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this group about?"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Visibility
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["PUBLIC", "PRIVATE"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    "py-2 rounded-lg text-xs font-bold border transition-colors",
                    type === t
                      ? "bg-indigo-500 text-white border-indigo-500"
                      : "bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600"
                  )}
                >
                  {t === "PUBLIC" ? "Public · anyone joins" : "Private · approve members"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 py-2.5 rounded-lg bg-indigo-500 text-white text-sm font-bold disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PollBlock — renders poll bars with vote button per option
// ─────────────────────────────────────────────────────────────────────────────

function PollBlock({
  post,
  onUpdated,
}: {
  post: FeedPost;
  onUpdated: (patch: Partial<FeedPost>) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const options = post.pollOptions ?? [];
  const total = options.reduce((s, o) => s + o.voteCount, 0);
  const ended =
    post.pollEndsAt && new Date(post.pollEndsAt).getTime() < Date.now();

  const vote = async (optionId: string) => {
    if (ended || busyId) return;
    setBusyId(optionId);
    try {
      const res = await fetch(`/api/feed/${post.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onUpdated({
        pollOptions: data.pollOptions,
        myVote: data.myVote,
      });
    } catch (err) {
      toast.error("Couldn't vote", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="px-4 py-3 border-t border-gray-800 space-y-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-gray-500">
        <span>Poll</span>
        <span>
          {total} vote{total === 1 ? "" : "s"}
          {ended ? " · ended" : post.pollEndsAt ? ` · ends ${formatDistanceToNow(new Date(post.pollEndsAt), { addSuffix: true })}` : ""}
        </span>
      </div>
      <div className="space-y-1.5">
        {options.map((o) => {
          const pct = total > 0 ? (o.voteCount / total) * 100 : 0;
          const isMine = post.myVote === o.id;
          return (
            <button
              key={o.id}
              onClick={() => vote(o.id)}
              disabled={ended || busyId === o.id}
              className={cn(
                "relative w-full text-left p-2.5 rounded-lg overflow-hidden border transition-colors disabled:cursor-default",
                isMine
                  ? "border-indigo-500 bg-indigo-500/5"
                  : "border-gray-800 bg-gray-950 hover:border-gray-700"
              )}
            >
              <div
                className={cn(
                  "absolute inset-0 transition-[width]",
                  isMine ? "bg-indigo-500/15" : "bg-gray-800/40"
                )}
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <span className="text-sm text-white truncate">{o.label}</span>
                <span className="text-xs tabular-nums text-gray-300 shrink-0">
                  {pct.toFixed(0)}% · {o.voteCount}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DonationBlock — progress bar + donate modal
// ─────────────────────────────────────────────────────────────────────────────

function DonationBlock({
  post,
  onUpdated,
}: {
  post: FeedPost;
  onUpdated: (patch: Partial<FeedPost>) => void;
}) {
  const goal = post.donationGoal ?? 0;
  const collected = post.donationCollected ?? 0;
  const pct = goal > 0 ? Math.min(100, (collected / goal) * 100) : 0;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(100);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (amount < 1) {
      toast.error("Enter at least 1 pt");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/feed/${post.id}/donate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(`Thanks! ${amount} pts donated`);
      onUpdated({
        donationCollected: data.donationCollected,
        donationGoal: data.donationGoal,
      });
      setOpen(false);
    } catch (err) {
      toast.error("Donation failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="px-4 py-3 border-t border-gray-800 space-y-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-gray-500">
          <span>Donation Goal</span>
          <span className="tabular-nums">
            {collected.toLocaleString()} / {goal.toLocaleString()} pts
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-950 overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-pink-500 to-amber-500 transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
        {!post.isOwner && (
          <button
            onClick={() => setOpen(true)}
            className="w-full mt-2 py-2 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 text-xs font-bold inline-flex items-center justify-center gap-1.5"
          >
            💝 Donate pts
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={busy ? undefined : () => setOpen(false)}
          />
          <div className="relative bg-gray-900 border border-gray-800 rounded-xl shadow-2xl max-w-sm w-full p-5">
            <h3 className="text-base font-bold text-white mb-3">
              Donate to this post
            </h3>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Amount (pts)
            </label>
            <input
              type="number"
              min={1}
              max={100000}
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-pink-500"
            />
            <div className="flex gap-2 mt-2">
              {[50, 100, 500, 1000].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className="flex-1 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 tabular-nums"
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="flex-1 py-2.5 rounded-lg bg-linear-to-r from-pink-500 to-amber-500 text-white text-sm font-bold disabled:opacity-50"
              >
                {busy ? "Processing…" : `Donate ${amount} pts`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
