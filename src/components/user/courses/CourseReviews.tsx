"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Star, Loader2, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Avatar } from "@/components/user/primitives/avatar";

interface Review {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; avatar: string | null };
}

interface Props {
  courseId: string;
  avgRating: number;
  totalReviews: number;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
  reviews: Review[];
  canReview: boolean;
  myReview: { id: string; rating: number; title: string | null; comment: string | null } | null;
}

export function CourseReviews({
  courseId,
  avgRating,
  totalReviews,
  breakdown,
  reviews,
  canReview,
  myReview,
}: Props) {
  return (
    <section className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-white">Student reviews</h2>
        <p className="text-xs text-(--app-ink-3)">
          {totalReviews} review{totalReviews === 1 ? "" : "s"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4">
        <div className="text-center">
          <p className="text-5xl font-extrabold text-white tabular-nums">
            {avgRating > 0 ? avgRating.toFixed(1) : "—"}
          </p>
          <div className="flex justify-center gap-0.5 mt-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={
                  n <= Math.round(avgRating)
                    ? "w-4 h-4 fill-amber-300 text-amber-300"
                    : "w-4 h-4 text-(--app-ink-3)"
                }
              />
            ))}
          </div>
          <p className="text-xs text-(--app-ink-3) mt-1">
            Course rating
          </p>
        </div>
        <div className="space-y-1.5">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = breakdown[n as 1 | 2 | 3 | 4 | 5] ?? 0;
            const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
            return (
              <div key={n} className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-0.5 w-10 text-(--app-ink-2) tabular-nums">
                  {n}
                  <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                </span>
                <div className="flex-1 h-1.5 bg-(--app-surface-2) rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 text-right text-(--app-ink-3) tabular-nums">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {canReview && <ReviewComposer courseId={courseId} existing={myReview} />}

      {reviews.length === 0 ? (
        <p className="text-sm text-(--app-ink-3) italic">
          No written reviews yet. Be the first to share what you thought.
        </p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-(--app-line) bg-(--app-page) p-3"
            >
              <div className="flex items-center gap-2">
                <Avatar
                  src={r.user.avatar}
                  size={28}
                  fallbackStyle="solid-gray"
                  fallbackText={(r.user.name ?? "?").slice(0, 1).toUpperCase()}
                />
                <p className="text-sm text-white font-bold">{r.user.name ?? "—"}</p>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={
                        n <= r.rating
                          ? "w-3 h-3 fill-amber-300 text-amber-300"
                          : "w-3 h-3 text-(--app-ink-3)"
                      }
                    />
                  ))}
                </div>
                <span className="ml-auto text-[11px] text-(--app-ink-3)">
                  {formatDistanceToNow(r.createdAt, { addSuffix: true })}
                </span>
              </div>
              {r.title && (
                <p className="text-sm font-bold text-white mt-2">{r.title}</p>
              )}
              {r.comment && (
                <p className="text-sm text-(--app-ink-2) mt-1 whitespace-pre-wrap">
                  {r.comment}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewComposer({
  courseId,
  existing,
}: {
  courseId: string;
  existing: { id: string; rating: number; title: string | null; comment: string | null } | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState<number>(existing?.rating ?? 5);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!rating || rating < 1 || rating > 5) {
      toast.error("Pick a rating");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          title: title.trim() || null,
          comment: comment.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(existing ? "Review updated" : "Review posted");
      router.refresh();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-(--app-accent-edge)/30 bg-(--app-cta)/5 p-3 space-y-2">
      <p className="text-sm font-bold text-white">
        {existing ? "Update your review" : "Leave a review"}
      </p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className="p-0.5"
            aria-label={`${n} stars`}
          >
            <Star
              className={
                n <= rating
                  ? "w-6 h-6 fill-amber-300 text-amber-300"
                  : "w-6 h-6 text-(--app-ink-3)"
              }
            />
          </button>
        ))}
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Headline (optional)"
        className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-(--app-accent-edge)"
      />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="What did you think? (optional)"
        className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-(--app-accent-edge) resize-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-sm font-bold disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        {existing ? "Update review" : "Post review"}
      </button>
    </div>
  );
}
