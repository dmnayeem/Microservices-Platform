"use client";

import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  X,
  Send,
  Loader2,
  Megaphone,
  ListChecks,
  HandCoins,
  Type as TypeIcon,
  Plus,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Smile,
  Palette,
  Lock,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  POST_BACKGROUNDS,
  getPostBackground,
} from "@/lib/post-backgrounds";
import { compressImageToTarget } from "@/lib/image-compress";
import { ComposerToolBtn, EmojiPopover } from "./composer-bits";
import { LinkPreviewCard } from "./link-preview-card";
import { Avatar } from "@/components/user/primitives/avatar";
import {
  InlineVideoEmbed,
  isEmbeddableVideoUrl,
} from "@/components/user/primitives/inline-video-embed";
import type {
  SessionUser,
  FeedPost,
  ComposerMode,
  LinkPreviewData,
} from "./social-feed-view.types";

// First http(s) URL in text (client-safe). Mirrors feed-post-card's helper.
function firstUrlInText(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<]+/i);
  return m ? m[0].replace(/[.,;:!?)\]}'"]+$/, "") : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composer
// ─────────────────────────────────────────────────────────────────────────────

export function CreatePostComposer({
  user,
  onCreated,
  canShareLinks = false,
  canShareYouTube = false,
}: {
  user: SessionUser;
  onCreated: (post: FeedPost) => void;
  /** Admin-granted: may post plain links (else blocked + preview hidden). */
  canShareLinks?: boolean;
  /** Admin-granted: may post YouTube/video links. */
  canShareYouTube?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<ComposerMode>("text");
  const [content, setContent] = useState("");
  const [imageInput, setImageInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [bg, setBg] = useState<string>(""); // colored-background id ("" = none)
  const [uploading, setUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMore, setShowMore] = useState(false); // reveals formatting/bg/image-URL row
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollDuration, setPollDuration] = useState<24 | 48 | 72>(24);
  const [donationGoal, setDonationGoal] = useState<number>(1000);
  const [busy, setBusy] = useState(false);
  const [postAsAnnouncement, setPostAsAnnouncement] = useState(false);
  // Facebook-style link preview: auto-fetched for the first URL, dismissable.
  const [linkPreview, setLinkPreview] = useState<LinkPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const previewedUrlRef = useRef<string | null>(null);
  const dismissedUrlRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // A colored background only applies to text-only posts.
  const activeBg = images.length === 0 ? getPostBackground(bg) : null;

  // The URL (if any) we'd preview: text-only posts, no image (image wins).
  const currentUrl =
    mode === "text" && images.length === 0 ? firstUrlInText(content) : null;
  const previewSuppressed =
    previewDismissed && dismissedUrlRef.current === currentUrl;
  const currentUrlIsVideo = !!currentUrl && isEmbeddableVideoUrl(currentUrl);
  // Is the author allowed to share this URL? Video → shareYouTube, else shareLinks.
  const linkAllowed = !currentUrl
    ? true
    : currentUrlIsVideo
      ? canShareYouTube
      : canShareLinks;

  // Debounced link-preview fetch. All state writes live inside the timeout
  // callback (never synchronously in the effect body) so we don't trigger
  // react-hooks/set-state-in-effect, and so typing feels smooth.
  useEffect(() => {
    if (!currentUrl || previewSuppressed || currentUrlIsVideo || !linkAllowed) {
      const timer = setTimeout(() => {
        // Clear any stale card once the URL is gone / superseded.
        if (previewedUrlRef.current !== currentUrl) {
          previewedUrlRef.current = currentUrl;
          setLinkPreview(null);
          setPreviewLoading(false);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
    if (previewedUrlRef.current === currentUrl) return; // already have this one
    const timer = setTimeout(() => {
      previewedUrlRef.current = currentUrl;
      setPreviewLoading(true);
      setLinkPreview(null);
      fetch(`/api/link-preview?url=${encodeURIComponent(currentUrl)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setLinkPreview((d?.preview as LinkPreviewData) ?? null))
        .catch(() => setLinkPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 600);
    return () => clearTimeout(timer);
  }, [currentUrl, previewSuppressed, currentUrlIsVideo, linkAllowed]);

  const dismissPreview = () => {
    dismissedUrlRef.current = currentUrl;
    setPreviewDismissed(true);
    setLinkPreview(null);
    setPreviewLoading(false);
  };

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
    setLinkPreview(null);
    setPreviewLoading(false);
    setPreviewDismissed(false);
    previewedUrlRef.current = null;
    dismissedUrlRef.current = null;
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
    // Hard-block a link the user isn't allowed to share (mirrors the server gate).
    if (currentUrl && !linkAllowed) {
      toast.error(
        currentUrlIsVideo
          ? "Sharing YouTube/video links isn't enabled for your account"
          : "Sharing links isn't enabled for your account",
        { description: "Ask an admin to enable it for you." }
      );
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
          disableLinkPreview: previewDismissed,
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
      // Optimistic hand-off: show the poster the exact preview they just saw,
      // even if server-side capture didn't persist one (client-only display of
      // their own post; other viewers get the server-fetched/lazy version).
      if (
        data.post &&
        !data.post.linkPreview &&
        linkPreview &&
        !previewDismissed
      ) {
        data.post.linkPreview = linkPreview;
      }
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
          <Avatar
            src={user.avatar}
            name={user.name}
            size={44}
            className="shrink-0 ring-2 ring-indigo-500/30"
          />
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
        <Avatar
          src={user.avatar}
          name={user.name}
          size={40}
          className="shrink-0"
        />
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

          {/* Permission notice — a URL the user isn't allowed to share. */}
          {currentUrl && !linkAllowed && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {currentUrlIsVideo
                  ? "Sharing YouTube/video links isn't enabled for your account."
                  : "Sharing links isn't enabled for your account."}{" "}
                Ask an admin to enable it.
              </span>
            </div>
          )}

          {/* Link preview (Facebook-style) — video plays inline, else an OG
              card; both dismissable via ×. Hidden when an image is attached or
              the user lacks link-sharing permission. */}
          {currentUrl && linkAllowed && !previewSuppressed && (
            currentUrlIsVideo ? (
              <div className="relative mt-3">
                <InlineVideoEmbed url={currentUrl} />
                <button
                  type="button"
                  onClick={dismissPreview}
                  aria-label="Remove preview"
                  className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/70 hover:bg-red-500/80 text-white backdrop-blur-sm"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : linkPreview ? (
              <LinkPreviewCard preview={linkPreview} onRemove={dismissPreview} />
            ) : previewLoading ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/60 p-3 text-xs text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading preview…
              </div>
            ) : null
          )}

          {/* Progressive disclosure — secondary controls stay tucked away until
              the user asks for them, keeping the default composer uncluttered.
              State persists while hidden (no reset on collapse). */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-semibold transition-colors self-start",
              showMore ? "text-indigo-300" : "text-gray-400 hover:text-gray-200"
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {showMore ? "Fewer options" : "More options"}
          </button>

          {showMore && (
            <>
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
            <span className="ml-auto text-[11px] text-gray-500 hidden sm:inline">
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
          <span className="text-[11px] text-cyan-400/70 ml-auto">
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
