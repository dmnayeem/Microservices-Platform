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
  MousePointerClick,
  CheckCircle,
  Bookmark,
  Flag,
  X,
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
import { ReactionBreakdown } from "./reaction-breakdown";
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

// First http(s) URL in text (client-safe; server lib pulls node:dns so not imported here).
function firstUrlInText(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<]+/i);
  return m ? m[0].replace(/[.,;:!?)\]}'"]+$/, "") : null;
}

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
  const lastTapRef = useRef(0);
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

  /** Double-tap a photo to like — the gesture people already expect. */
  const onImageTap = (index: number) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (!post.isLiked) void react(DEFAULT_REACTION);
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
      return;
    }
    lastTapRef.current = now;
    setTimeout(() => {
      // Still a single tap after the double-tap window → open the viewer.
      if (lastTapRef.current === now) {
        lastTapRef.current = 0;
        setZoomIndex(index);
      }
    }, 300);
  };

  return (
    <article
      ref={articleRef}
      className={cn(
        "relative rounded-xl border bg-gray-900 overflow-hidden animate-card-in",
        "transition-colors duration-200 hover:border-gray-700",
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
            <Avatar
              src={post.user?.avatar}
              size={40}
              name={post.user?.name}
              fallbackText={initial}
            />
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
                  {/* Available to everyone, own post or not. */}
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      void toggleSave();
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-900 inline-flex items-center gap-2"
                  >
                    <Bookmark
                      className={cn(
                        "w-3.5 h-3.5",
                        post.isSaved ? "text-amber-400 fill-amber-400" : "text-amber-400"
                      )}
                    />
                    {post.isSaved ? "Remove from saved" : "Save post"}
                  </button>
                  {!post.isOwner && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setReportOpen(true);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-900 inline-flex items-center gap-2"
                    >
                      <Flag className="w-3.5 h-3.5 text-rose-400" />
                      Report post
                    </button>
                  )}
                  <div className="border-t border-gray-800" />
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
                <RenderedContent content={post.content} postId={post.id} />
              </p>
            </div>
          ) : (
            <ExpandableContent
              content={post.content}
              postId={post.id}
              wrapperClassName="mt-3"
              pClassName="text-[15px] text-gray-200 leading-relaxed"
            />
          ))}

        {/* Link preview — only for text posts (no uploaded images / colored bg),
            so it doesn't compete with post media. A YouTube/Vimeo/video URL plays
            inline; any other URL gets an OpenGraph card. */}
        {!postBg && post.images.length === 0 && (() => {
          const url = firstUrlInText(post.content);
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
            "relative grid gap-px bg-gray-800",
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
                onClick={() => onImageTap(i)}
                onError={(e) => {
                  // Hide broken images so a bad URL doesn't leave a giant empty box.
                  e.currentTarget.style.display = "none";
                }}
                className="w-full bg-gray-950 max-h-[70vh] object-contain cursor-zoom-in select-none"
              />
            ) : (
              <div
                key={i}
                onClick={() => onImageTap(i)}
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
                  className="object-cover bg-gray-950"
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

      {/* Compact sponsor banner under the post, above the reactions row. The
          caller decides WHICH posts get one (ads.under_post_interval); this only
          renders what it is told to. The old `[&_*]:max-h-16` clamp is gone —
          FEED_POST_BELOW declares maxHeightPx: 72 and the renderer enforces it,
          so the two were fighting over a different number. */}
      {underPostBanner && (
        <div className="px-4 pb-1">
          <AdRenderer placement="FEED_POST_BELOW" />
        </div>
      )}

      {/* Reactions row */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-t border-gray-800 [&>button]:px-2 [&>button]:py-2 [&>button]:rounded-lg [&>button]:hover:bg-gray-800/60 [&>button]:transition-colors">
        <ReactionButton
          reacted={post.isLiked}
          reaction={post.myReaction}
          disabled={busy}
          onToggle={toggleLike}
          onPick={react}
        />
        {/* The number sits outside the button on purpose — tapping it opens the
            per-emoji split instead of liking. */}
        <ReactionBreakdown
          count={post.likesCount}
          counts={post.reactionCounts}
        />
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
        <button
          onClick={toggleSave}
          aria-label={post.isSaved ? "Remove from saved" : "Save post"}
          title={post.isSaved ? "Saved" : "Save"}
          className={cn(
            "inline-flex items-center gap-1.5 text-sm transition-colors",
            post.isSaved ? "text-amber-400" : "text-gray-400 hover:text-amber-400"
          )}
        >
          <Bookmark className={cn("w-4 h-4", post.isSaved && "fill-current")} />
        </button>
        {post.isOwner &&
          canBoost &&
          !(post.boostedUntil && new Date(post.boostedUntil) > new Date()) && (
            <button
              onClick={() => setBoostOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-amber-400 ml-auto"
            >
              <Megaphone className="w-4 h-4" />
              Boost
            </button>
          )}
        {post.boostedUntil && new Date(post.boostedUntil) > new Date() && (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-bold">
            <Megaphone className="w-3.5 h-3.5" />
            Boosted
          </span>
        )}
        {post.isOwner && (
          <div className="ml-auto flex items-center gap-3">
            {!!(post.linkPreview || firstUrlInText(post.content)) && (
              <span
                className="inline-flex items-center gap-1.5 text-sm text-amber-400"
                title="Link clicks (total)"
              >
                <MousePointerClick className="w-4 h-4" />
                <span className="tabular-nums text-xs">{post.linkClicksCount ?? 0}</span>
              </span>
            )}
            <button
              onClick={() => setShowAnalytics((v) => !v)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-indigo-400"
              title="View analytics"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="tabular-nums text-xs">{post.viewsCount ?? 0}</span>
            </button>
          </div>
        )}
      </div>

      {showAnalytics && post.isOwner && (
        <PostAnalyticsPanel postId={post.id} />
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

      {boostOpen && (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4"
          onClick={() => !busy && setBoostOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-bold text-white inline-flex items-center gap-1.5">
              <Megaphone className="w-4 h-4 text-amber-400" /> Boost this post
            </p>
            <p className="text-xs text-gray-400 mt-1">
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
                  className="py-2.5 rounded-lg bg-gray-800 hover:bg-amber-500 hover:text-white text-sm font-semibold text-gray-200 disabled:opacity-50 flex flex-col items-center gap-0.5"
                >
                  <span>{label}</span>
                  <span className="text-[11px] font-bold text-amber-400">{pts} pts</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => !busy && setBoostOpen(false)}
              className="mt-3 w-full py-2 rounded-lg text-xs text-gray-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
});
