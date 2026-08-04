"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
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
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";
import { profileHref } from "@/lib/user-href";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { getPostBackground } from "@/lib/post-backgrounds";
import { ShareModal } from "@/components/user/primitives/share-modal";
import { PostAnalyticsPanel } from "@/components/user/feed/post-analytics-panel";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { Avatar } from "@/components/user/primitives/avatar";
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
}: {
  post: FeedPost;
  currentUserId: string;
  currentUserRole: string | null;
  canBoost?: boolean;
  onUpdatePost: (id: string, patch: Partial<FeedPost>) => void;
  onDeletePost: (id: string) => void;
  /** Float this post to the top of the feed (viewer just commented on it). */
  onBumpPost?: (id: string) => void;
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
            "grid gap-px bg-gray-800",
            post.images.length === 1 && "grid-cols-1",
            post.images.length === 2 && "grid-cols-2",
            post.images.length >= 3 && "grid-cols-3"
          )}
        >
          {post.images.slice(0, 6).map((url, i) =>
            // A lone image keeps its natural shape (capped height); grids stay square.
            post.images.length === 1 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt=""
                onError={(e) => {
                  // Hide broken images so a bad URL doesn't leave a giant empty box.
                  e.currentTarget.style.display = "none";
                }}
                className="w-full bg-gray-950 max-h-[70vh] object-contain"
              />
            ) : (
              <div key={i} className="relative aspect-square overflow-hidden">
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
                  headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
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
        <CommentsSection postId={post.id} currentUserId={currentUserId} onCommentAdded={() => { onUpdated({ commentsCount: post.commentsCount + 1 }); onBumpPost?.(post.id); }} />
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
});
