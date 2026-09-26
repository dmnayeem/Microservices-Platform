"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { reportPostView } from "@/lib/view-beacon";
import {
  Loader2,
  Heart,
  MessageCircle,
  Share2,
  Megaphone,
  MoreHorizontal,
  Sparkles,
  BarChart3,
  CheckCircle,
  Bookmark,
  Flag,
  X,
  Globe,
  Users,
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { profileHref } from "@/lib/user-href";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { getPostBackground } from "@/lib/post-backgrounds";
import { ShareModal } from "@/components/user/primitives/share-modal";
import { ImageZoomModal } from "@/components/user/primitives/image-zoom-modal";
import { ReportContent } from "@/components/user/primitives/report-content";
import { ReactionButton } from "./reaction-button";
import { findFirstUrl } from "@/lib/post-urls";
import {
  DEFAULT_REACTION,
  shiftReactionCounts,
  type ReactionType,
} from "@/lib/reactions";
import { PostAnalyticsPanel } from "@/components/user/feed/post-analytics-panel";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { mediaSrc } from "@/lib/media-url";
import { Avatar } from "@/components/user/primitives/avatar";
import { AdRenderer } from "@/components/user/primitives/ad-renderer";
import { PollBlock } from "./poll-block";
import { DonationBlock } from "./donation-block";
import { PromoteModal } from "./promote-modal";
import { CommentsSection } from "./comments-section";
import { RenderedContent } from "./feed-content";
import { ExpandableContent } from "./expandable-content";
import { LinkPreviewCard } from "./link-preview-card";
import {
  InlineVideoEmbed,
  isEmbeddableVideoUrl,
} from "@/components/user/primitives/inline-video-embed";
import type { FeedPost } from "./social-feed-view.types";

// URL detection lives in `@/lib/post-urls`, shared with the composer so that
// what previews there is what links here. The local copy this replaced required
// an explicit "https://", so a post saying "example.com" showed neither.

// ─────────────────────────────────────────────────────────────────────────────
// FeedPostCard
// ─────────────────────────────────────────────────────────────────────────────

export const FeedPostCard = memo(function FeedPostCard({
  post,
  currentUserId,
  currentUserRole,
  canBoost,
  onUpdatePost,
  onDeletePost,
  onBumpPost,
  underPostBanner,
}: {
  post: FeedPost;
  currentUserId: string;
  currentUserRole: string | null;
  canBoost?: boolean;
  onUpdatePost: (id: string, patch: Partial<FeedPost>) => void;
  onDeletePost: (id: string) => void;
  /** Float this post to the top of the feed (viewer just commented on it). */
  onBumpPost?: (id: string) => void;
  /** Show a compact sponsor banner under this post, above the reactions row. */
  underPostBanner?: boolean;
}) {
  // Re-bind the id-scoped parent handlers to this card's post so all the
  // existing `onUpdated(patch)` / `onDeleted()` call sites below stay unchanged,
  // while the props received from the list are stable (enabling React.memo).
  const onUpdated = useCallback(
    (patch: Partial<FeedPost>) => onUpdatePost(post.id, patch),
    [onUpdatePost, post.id]
  );
  const onDeleted = useCallback(
    () => onDeletePost(post.id),
    [onDeletePost, post.id]
  );
  const [showComments, setShowComments] = useState(false);
  // Set while the comment box has text. Clicking away must not throw away a
  // half-written comment, so the collapse below refuses to run while it is true.
  const [hasDraft, setHasDraft] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // -1 = closed. The zoom modal already handles prev/next and the keyboard.
  const [zoomIndex, setZoomIndex] = useState(-1);
  // Heart burst after a double-tap on the photo.
  const [burst, setBurst] = useState(false);
  const lastTapRef = useRef<{
    at: number;
    index: number;
    pt: { x: number; y: number } | null;
  }>({ at: 0, index: -1, pt: null });
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A card can be unmounted mid-gesture — the feed reshuffles, or the post is
  // deleted between the two taps. Without this the pending single-tap fires
  // into a dead component and tries to open a viewer that is gone.
  useEffect(
    () => () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    },
    []
  );
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
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
              // Queued, not sent: the whole scroll is reported in one request.
              // Optimistically bump the local count — the server no longer
              // returns one per view, and being off by one on a view counter
              // until the next load is not worth a round-trip per post.
              reportPostView(post.id);
              onUpdated({ viewsCount: (post.viewsCount ?? 0) + 1 });
              observer.disconnect();
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
    const wasReaction = post.myReaction ?? (wasLiked ? DEFAULT_REACTION : null);
    // Optimistic. The per-type map moves with the headline count, or the
    // breakdown behind the number would still show the reaction just removed.
    onUpdated({
      isLiked: !wasLiked,
      myReaction: wasLiked ? null : DEFAULT_REACTION,
      likesCount: post.likesCount + (wasLiked ? -1 : 1),
      reactionCounts: shiftReactionCounts(
        post.reactionCounts,
        wasReaction,
        wasLiked ? null : DEFAULT_REACTION
      ),
    });
    try {
      const res = await fetch(`/api/feed/${post.id}/like`, {
        method: wasLiked ? "DELETE" : "POST",
        ...(wasLiked
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: DEFAULT_REACTION }),
            }),
      });
      if (!res.ok && res.status !== 409) {
        // 409 = already liked
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      // Revert
      onUpdated({
        isLiked: wasLiked,
        myReaction: post.myReaction ?? null,
        likesCount: post.likesCount,
        reactionCounts: post.reactionCounts,
      });
      toast.error("Couldn't update like");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Pick a specific emoji.
   *
   * The count only moves when this is the viewer's FIRST reaction on the post —
   * switching between emojis is one row being updated, and the server
   * deliberately credits nothing for it (otherwise cycling five reactions would
   * mint points). The optimistic update has to model that or the number would
   * drift away from what the server returns.
   */
  const react = async (type: ReactionType) => {
    if (busy) return;
    const wasLiked = post.isLiked;
    const prev = {
      isLiked: wasLiked,
      myReaction: post.myReaction ?? null,
      likesCount: post.likesCount,
      reactionCounts: post.reactionCounts,
    };
    setBusy(true);
    onUpdated({
      isLiked: true,
      myReaction: type,
      likesCount: post.likesCount + (wasLiked ? 0 : 1),
      // A switch leaves the total alone but still moves one from the old emoji
      // to the new one — which is exactly what the breakdown is there to show.
      reactionCounts: shiftReactionCounts(
        post.reactionCounts,
        post.myReaction ?? (wasLiked ? DEFAULT_REACTION : null),
        type
      ),
    });
    try {
      const res = await fetch(`/api/feed/${post.id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json().catch(() => null);
      // Trust the server's count — it is the one that knows whether this was a
      // new reaction or a switch.
      if (d && typeof d.likesCount === "number") {
        onUpdated({ likesCount: d.likesCount, myReaction: d.reaction ?? type });
      }
    } catch {
      onUpdated(prev);
      toast.error("Couldn't update reaction");
    } finally {
      setBusy(false);
    }
  };

  const toggleSave = async () => {
    const wasSaved = !!post.isSaved;
    onUpdated({ isSaved: !wasSaved });
    try {
      const res = await fetch(`/api/feed/${post.id}/save`, {
        method: wasSaved ? "DELETE" : "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(wasSaved ? "Removed from saved" : "Saved");
    } catch {
      onUpdated({ isSaved: wasSaved });
      toast.error("Couldn't update saved posts");
    }
  };

  /**
   * Clicking outside this card collapses its comments.
   *
   * Guarded on the draft: a stray click while someone is mid-sentence would
   * otherwise discard what they typed, which is worse than the section staying
   * open. Clicks anywhere INSIDE the card — the input, a link, the photo
   * viewer — are ignored, so only genuinely leaving the post collapses it.
   */
  useEffect(() => {
    if (!showComments) return;
    const onDown = (e: PointerEvent) => {
      if (hasDraft) return;
      if (articleRef.current?.contains(e.target as Node)) return;
      // The image viewer is portalled to the body, so a click on it is outside
      // the article but very much still "in" this post.
      if (zoomIndex >= 0) return;
      setShowComments(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !hasDraft) setShowComments(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [showComments, hasDraft, zoomIndex]);

  /**
   * Double-tap a photo to love it — the gesture people already expect.
   *
   * The window was 300ms with no tolerance for anything else, which is why it
   * "did not always work":
   *  - 300ms is tight for a real thumb. 450ms is the usual figure and is what
   *    the platforms use.
   *  - Two taps a few pixels apart were still two taps as far as this was
   *    concerned, but a tap that drifted during a scroll also counted — so a
   *    flick down the feed could open the viewer, and a genuine double-tap on a
   *    moving finger could be split across two images.
   *  - The pending single-tap timer was never cleared, only out-voted by a ref
   *    comparison; a re-render between the two taps lost the race.
   *
   * Now: a real timer that is cancelled, a longer window, and both taps have to
   * land near each other AND on the same image.
   */
  const onImageTap = (index: number, e?: { clientX: number; clientY: number }) => {
    const now = Date.now();
    const pt = e ? { x: e.clientX, y: e.clientY } : null;
    const prev = lastTapRef.current;
    const near =
      !pt ||
      !prev.pt ||
      (Math.abs(pt.x - prev.pt.x) < 44 && Math.abs(pt.y - prev.pt.y) < 44);

    if (now - prev.at < 450 && prev.index === index && near) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      lastTapRef.current = { at: 0, index: -1, pt: null };
      // Double-tap only ever ADDS. Taking a love away by accident on a gesture
      // meant to give one is the wrong way for a mistake to go.
      if (!post.isLiked) void react(DEFAULT_REACTION);
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
      return;
    }

    lastTapRef.current = { at: now, index, pt };
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      lastTapRef.current = { at: 0, index: -1, pt: null };
      setZoomIndex(index);
    }, 450);
  };

  return (
    <article
      ref={articleRef}
      className={cn(
        // One radius, one surface, one border, one shadow — the card is the
        // paper, not the message. A post was previously given a cyan border
        // when it was an announcement and an amber one when it was promoted, so
        // a feed with a couple of each was three border colours deep before any
        // content was read. Both states are still called out, but by the badge
        // in the corner, which is where a label belongs.
        "app-card relative overflow-hidden p-0 animate-card-in",
        "transition-colors duration-200 hover:border-(--app-line-strong)"
      )}
    >
      {/* Top-right badge (OFFICIAL > PROMOTED, mutually exclusive in render).
          These are the two states that are genuinely worth a colour on a post
          — one is the platform speaking, one is paid placement — so they keep
          one each, as a chip. What they lost is the matching border and ring
          around the whole card. */}
      {(post.isAnnouncement || promotionActive) && (
        <div className="absolute top-3.5 right-3.5 z-10">
          {post.isAnnouncement ? (
            <span className="app-chip app-chip-info uppercase tracking-wider">
              <Megaphone className="w-3 h-3" />
              Official
            </span>
          ) : (
            <span
              className="app-chip app-chip-warn uppercase tracking-wider"
              title={post.promotedNote ? `Promoted by ${post.promotedNote}` : "Promoted"}
            >
              <Sparkles className="w-3 h-3" />
              Promoted
            </span>
          )}
        </div>
      )}
      <div className="p-(--app-pad)">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Link
            href={post.user ? profileHref(post.user) : "#"}
            className="shrink-0"
          >
            <Avatar
              src={post.user?.avatar}
              size={44}
              name={post.user?.name}
              fallbackText={initial}
            />
          </Link>
          <div className="flex-1 min-w-0">
            {/* `min-w-0` and `truncate`, because this row is squeezed from
              * both sides — a level chip and a Follow button — and without
              * them a two-word name wrapped mid-name on a phone: "Super" on
              * one line, "Admin" on the next. A name that is too long is
              * shortened with an ellipsis; it never becomes two lines. */}
            <div className="flex min-w-0 items-center gap-1.5">
              <Link
                href={post.user ? profileHref(post.user) : "#"}
                className="t-card-title truncate text-white hover:text-(--app-accent-ink) transition-colors"
              >
                {post.user?.name ?? "Anonymous"}
              </Link>
              {post.user?.isBlueVerified && (
                <span
                  title="Verified"
                  aria-label="Verified"
                  className="inline-flex shrink-0"
                >
                  <CheckCircle className="w-4 h-4 text-(--app-accent-ink)" />
                </span>
              )}
              {/* Was an amber pill. A level is not a warning, and on a feed
                  where a third of authors are level 10+ it was a wall of amber
                  next to a blue tick and a blue Follow button. */}
              {post.user && post.user.level >= 10 && (
                <span className="app-chip uppercase tracking-wider">
                  Lvl {post.user.level}
                </span>
              )}
            </div>
            <p className="t-meta mt-0.5 flex min-w-0 items-center gap-1.5 text-(--app-ink-3)">
              {/* The age is short and fixed; it is the audience label beside it
                * that varies. Keeping the age on one line and letting the
                * label shrink is the right way round — "2 months ago" broke
                * across two lines otherwise. */}
              <span className="shrink-0 whitespace-nowrap">
                {formatDistanceToNow(new Date(post.createdAt), {
                  addSuffix: true,
                })}
              </span>
              {/* The author's own posts say who they went out to. An author who
                  cannot see what they published cannot correct it. */}
              {post.isOwner && post.audience && (
                <span
                  className="inline-flex items-center gap-1 text-(--app-ink-3)"
                  title={
                    post.audience === "PUBLIC"
                      ? "Anyone on the internet can read this post."
                      : "Only signed-in EarnGPT members can read this post."
                  }
                >
                  <span aria-hidden>·</span>
                  {post.audience === "PUBLIC" ? (
                    <Globe className="w-3 h-3" />
                  ) : (
                    <Users className="w-3 h-3" />
                  )}
                  {post.audience === "PUBLIC" ? "Public" : "Members only"}
                </span>
              )}
            </p>
          </div>
          {!post.isOwner && post.user && (
            <button
              onClick={toggleFollowAuthor}
              disabled={followBusy}
              /* Follow was a solid indigo fill. In a feed of twenty posts from
                 people you do not follow, that is twenty saturated buttons
                 stacked down the page, each as loud as the balance card — and
                 white on indigo-500 is 4.47:1, under the floor. It is an
                 outlined control now: still the only button in the post header,
                 still obviously pressable, no longer shouting twenty times. */
              className={cn(
                "app-press app-tap-row shrink-0 px-3.5 rounded-(--app-r-chip) text-xs font-extrabold border disabled:opacity-50",
                post.isFollowingAuthor
                  ? "bg-(--app-surface-2) text-(--app-ink-2) border-(--app-line)"
                  : "bg-transparent text-(--app-accent-ink) border-(--app-accent-edge) hover:bg-(--app-nav-wash)"
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
                className="app-tap app-press inline-flex items-center justify-center rounded-(--app-r-chip) text-(--app-ink-3) hover:text-white hover:bg-(--app-surface-2)"
                aria-label="Post actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-56 rounded-(--app-r-control) border border-(--app-line) bg-(--app-surface) shadow-(--app-e3) z-20 overflow-hidden p-1">
                  {/* Available to everyone, own post or not. */}
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      void toggleSave();
                    }}
                    className="app-nav-item app-press w-full text-left text-xs"
                  >
                    <Bookmark
                      className={cn("w-4 h-4 shrink-0", post.isSaved && "fill-current")}
                    />
                    {post.isSaved ? "Remove from saved" : "Save post"}
                  </button>
                  {!post.isOwner && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setReportOpen(true);
                      }}
                      className="app-nav-item app-press w-full text-left text-xs"
                    >
                      <Flag className="w-4 h-4 shrink-0" />
                      Report post
                    </button>
                  )}
                  <div className="my-1 border-t border-(--app-line)" />
                  {isAdmin && (
                    <>
                      <button
                        onClick={toggleAnnounce}
                        disabled={busy}
                        className="app-nav-item app-press w-full text-left text-xs disabled:opacity-50"
                      >
                        <Megaphone className="w-4 h-4 shrink-0" />
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
                        className="app-nav-item app-press w-full text-left text-xs disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4 shrink-0" />
                        {promotionActive ? "Edit Promotion" : "Promote Post"}
                      </button>
                      <div className="my-1 border-t border-(--app-line)" />
                      <button
                        onClick={forceDelete}
                        disabled={busy}
                        className="app-nav-item app-press w-full text-left text-xs text-(--app-out) hover:text-(--app-out) disabled:opacity-50"
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
                <RenderedContent content={post.content} postId={post.id} />
              </p>
            </div>
          ) : (
            <ExpandableContent
              content={post.content}
              postId={post.id}
              wrapperClassName="mt-3"
              pClassName="text-[15px] text-(--app-ink) leading-relaxed"
            />
          ))}

        {/* Link preview — only for text posts (no uploaded images / colored bg),
            so it doesn't compete with post media. A YouTube/Vimeo/video URL plays
            inline; any other URL gets an OpenGraph card. */}
        {!postBg && post.images.length === 0 && (() => {
          const url = findFirstUrl(post.content)?.href ?? null;
          if (url && isEmbeddableVideoUrl(url)) {
            return <div className="mt-3"><InlineVideoEmbed url={url} /></div>;
          }
          if (post.linkPreview || url) {
            return <LinkPreviewCard preview={post.linkPreview} contentUrl={url} postId={post.id} />;
          }
          return null;
        })()}
      </div>

      {/* Images */}
      {post.images.length > 0 && (
        <div
          className={cn(
            "relative grid gap-px bg-(--app-surface-2)",
            post.images.length === 1 && "grid-cols-1",
            post.images.length === 2 && "grid-cols-2",
            post.images.length >= 3 && "grid-cols-3"
          )}
        >
          {post.images.slice(0, 6).map((url, i) =>
            // A lone image keeps its natural shape (capped height); grids stay square.
            post.images.length === 1 ? (
              // `mediaSrc` and not a bare src: our bucket is private, so the
              // stored S3 URL 403s and the photo renders broken. The grid branch
              // below always went through SmartImage (which applies the same
              // rewrite) — only the single-image case was handing the browser the
              // dead URL, so a post with one photo was broken and the same post
              // with two was fine.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={mediaSrc(url)}
                alt=""
                onClick={(e) => onImageTap(i, e)}
                onError={(e) => {
                  // Hide broken images so a bad URL doesn't leave a giant empty box.
                  e.currentTarget.style.display = "none";
                }}
                /* A tall photo does not get to own the screen.
                 *
                 * The cap was 70vh, so a portrait shot — measured on a real
                 * post, 645x1159 — filled seven tenths of a phone and pushed
                 * the like row off the bottom, with one post per screenful.
                 * Capped by RATIO instead: 5/4 portrait is the tallest a photo
                 * renders at, which is what a feed of photos wants and roughly
                 * where Facebook lands.
                 *
                 * `object-contain` stays. Cover would fill the box, but it
                 * crops — and cropping the top of somebody's screenshot to
                 * make the feed tidier is not a trade this makes on their
                 * behalf. A photo taller than 5/4 is shown whole, smaller; a
                 * tap still opens it full-size. */
                className="mx-auto block max-h-[min(70vh,125vw)] w-full bg-(--app-page) object-contain cursor-zoom-in select-none"
              />
            ) : (
              <div
                key={i}
                onClick={(e) => onImageTap(i, e)}
                className="relative aspect-square overflow-hidden cursor-zoom-in select-none"
              >
                <SmartImage
                  src={url}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  onError={(e) => {
                    // Hide broken images so a bad URL doesn't leave a giant empty box.
                    e.currentTarget.style.display = "none";
                  }}
                  className="object-cover bg-(--app-page)"
                />
              </div>
            )
          )}
          {/* Double-tap feedback. Pointer-events off so it never eats the tap
              that produced it. */}
          {burst && (
            <span className="pointer-events-none absolute inset-0 grid place-items-center z-10">
              <Heart className="w-24 h-24 text-white/90 fill-rose-500 drop-shadow-2xl animate-heart-burst" />
            </span>
          )}
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

      {/* Reactions row.
          Every control here is a real ≥44px target with breathing room between
          them. The old row set padding with `[&>button]`, which reaches DIRECT
          button children only — the like button sat inside its own wrapper and
          so got none of it, ending up a ~20px target wedged against its
          neighbours. That is the "have to press it two or three times" bug:
          the presses were landing in the 4px gap, or on the row.

          It is written on each control now, as `app-tap`, rather than inherited
          from a parent selector that silently skips a wrapped child. A child
          selector cannot be relied on to size a target it may not reach.
          `touch-manipulation` (part of `app-tap`) drops the browser's own
          double-tap-zoom wait, so the first tap registers immediately instead
          of ~300ms later. */}
      {/* No control in this row may shrink. On a narrow phone the flex row
          used to squeeze its children, and an SVG squeezed in a flex item
          renders smaller than its neighbours - the icons came out at
          different sizes. Every button and icon is `shrink-0`, icons are all
          20px, and the side padding tightens below `sm` instead. On the very
          narrowest phones, with Boost showing, the right-hand group wraps to
          a line of its own (still right-aligned) rather than being squeezed
          or pushed out of reach. */}
      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1.5 border-t border-(--app-line)">
        <ReactionButton
          reacted={post.isLiked}
          disabled={busy}
          onToggle={toggleLike}
        />
        {/* Just the count now. With one reaction there is no split to open, so
            the tap-to-break-down popover has been removed rather than left as a
            control that shows the same number a second time. */}
        {post.likesCount > 0 && (
          <span className="shrink-0 text-sm text-(--app-ink-3) tabular-nums font-bold -ml-1 mr-0.5">
            {post.likesCount}
          </span>
        )}
        <button
          onClick={() => setShowComments((v) => !v)}
          aria-label="Comments"
          className="shrink-0 app-tap app-press inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 rounded-(--app-r-chip) text-sm font-semibold text-(--app-ink-3) hover:text-white hover:bg-(--app-surface-2)"
        >
          <MessageCircle className="w-5 h-5 shrink-0" />
          <span className="tabular-nums font-bold">
            {post.commentsCount}
          </span>
        </button>
        <button
          onClick={() => setShareOpen(true)}
          aria-label="Share"
          className="shrink-0 app-tap app-press inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 rounded-(--app-r-chip) text-sm font-semibold text-(--app-ink-3) hover:text-white hover:bg-(--app-surface-2)"
        >
          <Share2 className="w-5 h-5 shrink-0" />
          <span className="hidden sm:inline">Share</span>
        </button>
        {/* Saved is a state, not a warning — it was amber, the same colour the
            level badge, the boost control and the link-click counter all used
            in the same card. It is now the brand mark, filled, which says
            "you did this" without adding a hue. */}
        <button
          onClick={toggleSave}
          aria-label={post.isSaved ? "Remove from saved" : "Save post"}
          title={post.isSaved ? "Saved" : "Save"}
          className={cn(
            "shrink-0 app-tap app-press inline-flex items-center justify-center px-2.5 sm:px-3 rounded-(--app-r-chip) text-sm hover:bg-(--app-surface-2)",
            post.isSaved
              ? "text-(--app-accent-ink)"
              : "text-(--app-ink-3) hover:text-white"
          )}
        >
          <Bookmark className={cn("w-5 h-5 shrink-0", post.isSaved && "fill-current")} />
        </button>
        {post.isOwner &&
          canBoost &&
          !(post.boostedUntil && new Date(post.boostedUntil) > new Date()) && (
            <button
              onClick={() => setBoostOpen(true)}
              aria-label="Boost this post"
              className="shrink-0 app-tap app-press ml-auto inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-(--app-r-chip) text-sm font-semibold text-(--app-ink-3) hover:text-white hover:bg-(--app-surface-2)"
            >
              <Megaphone className="w-5 h-5 shrink-0" />
              <span className="hidden sm:inline">Boost</span>
            </button>
          )}
        {post.boostedUntil && new Date(post.boostedUntil) > new Date() && (
          <span className="app-chip app-chip-warn ml-auto shrink-0" title="Boosted">
            <Megaphone className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Boosted</span>
          </span>
        )}
        {post.isOwner && (
          <div className="ml-auto flex shrink-0 items-center">
            {/* Link clicks live INSIDE the stats panel now (tap this). As a
                separate counter they were one control too many for a narrow
                phone's row. */}
            <button
              onClick={() => setShowAnalytics((v) => !v)}
              aria-expanded={showAnalytics}
              aria-label="View post stats - views, reactions and link clicks"
              className="shrink-0 app-tap app-press inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 rounded-(--app-r-chip) text-sm text-(--app-ink-3) hover:text-white hover:bg-(--app-surface-2)"
              title="View stats"
            >
              <BarChart3 className="w-5 h-5 shrink-0" />
              <span className="tabular-nums text-sm font-bold">{post.viewsCount ?? 0}</span>
            </button>
          </div>
        )}
      </div>
      {/* Compact sponsor banner under the post. The caller decides WHICH posts
          get one (ads.under_post_interval); this only renders what it is told
          to. FEED_POST_BELOW declares maxHeightPx: 72 and the renderer
          enforces it.

          It used to sit above the reactions row, and that row is part of the
          post — so the banner ran between what somebody wrote and the buttons
          for reacting to it, splitting the card in two. "Under the post" means
          after the whole post, which is also where a reader expects the next
          thing in the feed to begin. */}
      {underPostBanner && (
        <div className="border-t border-(--app-line) px-(--app-pad) py-1.5">
          <AdRenderer placement="FEED_POST_BELOW" />
        </div>
      )}

      {showAnalytics && post.isOwner && (
        <PostAnalyticsPanel
          postId={post.id}
          hasLink={!!(post.linkPreview || findFirstUrl(post.content))}
        />
      )}

      {showComments && (
        <div className="animate-card-in">
          <CommentsSection
            postId={post.id}
            currentUserId={currentUserId}
            onCommentAdded={() => {
              onUpdated({ commentsCount: post.commentsCount + 1 });
              onBumpPost?.(post.id);
            }}
            onDraftChange={setHasDraft}
            onHide={() => setShowComments(false)}
          />
        </div>
      )}

      {/* Tapping a photo used to do nothing at all, even though this modal —
          multi-image, prev/next, Esc and arrow keys — already existed as a
          primitive and was only being used elsewhere. */}
      <ImageZoomModal
        open={zoomIndex >= 0}
        images={post.images.map((u) => mediaSrc(u))}
        index={Math.max(0, zoomIndex)}
        onClose={() => setZoomIndex(-1)}
        onIndexChange={setZoomIndex}
      />

      {/* Same story: SocialReport, /api/reports and the admin queue all already
          accepted POST — there was simply no way to report one. */}
      <ReportContent
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType="POST"
        targetId={post.id}
      />

      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        /* `/post/:id` is the PUBLIC page — it renders without a session, which
           is the whole point of a share link, and it carries the og:/twitter:
           tags that make it unfurl. The old value was `/social/:id`, a route
           that does not exist: every link this button has ever produced landed
           on a 404. */
        url={`${typeof window !== "undefined" ? window.location.origin : ""}/post/${post.id}`}
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

      {boostOpen && (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4"
          onClick={() => !busy && setBoostOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-(--app-line) bg-(--app-surface) p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-bold text-white inline-flex items-center gap-1.5">
              <Megaphone className="w-4 h-4 text-amber-400" /> Boost this post
            </p>
            <p className="text-xs text-(--app-ink-3) mt-1">
              Boosted posts recirculate near the top of the feed for the chosen
              period. Pick how long:
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { d: 1, label: "1 day", pts: 30 },
                { d: 7, label: "7 days", pts: 100 },
                { d: 30, label: "30 days", pts: 300 },
              ].map(({ d, label, pts }) => (
                <button
                  key={d}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await fetch(`/api/feed/${post.id}/boost`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "Idempotency-Key": newIdempotencyKey(),
                        },
                        body: JSON.stringify({ days: d }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
                      toast.success("Boosted! Your post will recirculate.");
                      onUpdated({ boostedUntil: data.boostedUntil ?? null });
                      setBoostOpen(false);
                    } catch (err) {
                      toast.error("Boost failed", {
                        description: err instanceof Error ? err.message : "Try again",
                      });
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="py-2.5 rounded-lg bg-(--app-surface-2) hover:bg-amber-500 hover:text-white text-sm font-semibold text-(--app-ink) disabled:opacity-50 flex flex-col items-center gap-0.5"
                >
                  <span>{label}</span>
                  <span className="text-[11px] font-bold text-amber-400">{pts} pts</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => !busy && setBoostOpen(false)}
              className="mt-3 w-full py-2 rounded-lg text-xs text-(--app-ink-3) hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
});
