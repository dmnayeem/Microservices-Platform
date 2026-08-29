"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedComment } from "./social-feed-view.types";
import {
  MentionSuggestions,
  useMentionAutocomplete,
} from "./mention-autocomplete";
import { RenderedContent } from "./feed-content";
import { Avatar } from "@/components/user/primitives/avatar";

// ─────────────────────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────────────────────

/** How many comments show before "View all". */
const PREVIEW_COUNT = 2;

export function CommentsSection({
  postId,
  currentUserId,
  onCommentAdded,
  onDraftChange,
  onHide,
}: {
  postId: string;
  currentUserId: string;
  onCommentAdded: () => void;
  /** Told when the box goes from empty to non-empty. The card uses it to avoid
   *  collapsing on an outside click and throwing away a half-written comment. */
  onDraftChange?: (hasDraft: boolean) => void;
  /** Collapse from down here, rather than only from the button above. */
  onHide?: () => void;
}) {
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null);
  // Preview first. Every loaded comment rendering at once buries the post it
  // belongs to; two is enough to see the conversation is alive.
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onDraftChange?.(text.trim().length > 0);
  }, [text, onDraftChange]);

  const mention = useMentionAutocomplete({
    value: text,
    onChange: setText,
    fieldRef: inputRef,
  });

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
        <Avatar
          src={c.user?.avatar}
          name={c.user?.name}
          size={28}
          className="shrink-0"
        />
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
          <p className="text-sm text-gray-200 mt-0.5 break-words">
            <RenderedContent content={c.content} />
          </p>
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
      <div className="relative flex gap-2">
        {/* Opens UPWARD: the comment box sits at the bottom of the card, so a
            list below it would fall off the viewport. */}
        {mention.open && (
          <MentionSuggestions
            items={mention.items}
            active={mention.active}
            onPick={mention.insert}
            onHover={mention.setActive}
            className="bottom-full left-0 mb-1"
          />
        )}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // The picker gets first refusal on Enter — otherwise picking a name
            // would post the comment instead.
            if (mention.onKeyDown(e)) return;
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
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
        <ul className="space-y-2">
          {(showAll ? topLevel : topLevel.slice(0, PREVIEW_COUNT)).map((c) =>
            renderComment(c)
          )}
        </ul>
      )}

      {/* Outside the list on purpose: "Hide comments" has to be there even on a
          post with nothing to show, or the only way to close an empty section is
          to scroll back up to the button that opened it. */}
      {!loading && (
        <div className="flex items-center justify-between gap-3 mt-2">
          {!showAll && topLevel.length > PREVIEW_COUNT ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300"
            >
              View all {topLevel.length} comments
            </button>
          ) : (
            <span />
          )}
          {onHide && (
            <button
              type="button"
              onClick={onHide}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Hide comments
            </button>
          )}
        </div>
      )}
    </div>
  );
}
