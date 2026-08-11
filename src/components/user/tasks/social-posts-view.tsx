"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Share2, Upload, Loader2 } from "lucide-react";
import { FilterChips } from "@/components/user/primitives/filter-chips";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { BottomSheet } from "@/components/user/primitives/bottom-sheet";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { toast } from "@/lib/toast";

type Tab = "available" | "submissions";

interface SocialPostTask {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  pointsReward: number;
  xpReward: number;
  shareUrl?: string;
  hashtag?: string;
  duration?: number | null;
}

export function SocialPostsView() {
  const [tab, setTab] = useState<Tab>("available");
  const [tasks, setTasks] = useState<SocialPostTask[]>([]);
  const [submissions, setSubmissions] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<SocialPostTask | null>(null);
  const [postUrl, setPostUrl] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        if (tab === "available") {
          const r = await fetch("/api/tasks?type=SOCIAL_POST", {
            cache: "no-store",
          });
          const d = await r.json();
          setTasks(d.tasks ?? []);
        } else {
          const r = await fetch("/api/submissions?type=SOCIAL_POST", {
            cache: "no-store",
          });
          const d = await r.json();
          setSubmissions(d.submissions ?? []);
        }
      } catch {
        if (!silent) {
          if (tab === "available") setTasks([]);
          else setSubmissions([]);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [tab]
  );

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(() => load(true));

  const submit = async () => {
    if (!submitting) return;
    if (!postUrl.trim()) {
      toast.error("Post URL is required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${submitting.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofUrl: postUrl, screenshotUrl }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Submitted!");
      setSubmitting(null);
      setPostUrl("");
      setScreenshotUrl("");
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const share = (t: SocialPostTask) => {
    if (!t.shareUrl) {
      toast.info("No share link configured");
      return;
    }
    const text = t.hashtag ? `${t.title} ${t.hashtag}` : t.title;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(t.shareUrl)}`,
      "_blank",
      "noopener"
    );
  };

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        📱 Social Post Tasks
      </h1>

      <FilterChips
        value={tab}
        onChange={setTab}
        options={[
          { value: "available", label: "Available" },
          { value: "submissions", label: "My Submissions" },
        ]}
      />

      {loading && <ListSkeleton rows={4} />}

      {!loading && tab === "available" && tasks.length === 0 && (
        <EmptyState
          icon={Megaphone}
          title="No social post tasks"
          description="Check back soon."
        />
      )}

      {!loading && tab === "available" &&
        tasks.map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-gray-800 bg-gray-900 p-3 space-y-2"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{t.title}</p>
                {t.instructions && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t.instructions}
                  </p>
                )}
                {t.hashtag && (
                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400">
                    {t.hashtag}
                  </span>
                )}
              </div>
              <span className="text-amber-400 font-bold text-sm tabular-nums shrink-0">
                +{t.pointsReward}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => share(t)}
                className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share Now
              </button>
              <button
                onClick={() => setSubmitting(t)}
                className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold"
              >
                <Upload className="w-3.5 h-3.5" />
                Submit Proof
              </button>
            </div>
          </div>
        ))}

      {!loading && tab === "submissions" && submissions.length === 0 && (
        <EmptyState
          icon={Megaphone}
          title="No submissions yet"
          description="Share a post and submit proof to see it here."
        />
      )}

      <BottomSheet
        open={!!submitting}
        onOpenChange={(o) => !o && setSubmitting(null)}
        title="Submit Proof"
        description={submitting?.title}
        footer={
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => setSubmitting(null)}
              className="flex-1 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-semibold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              onClick={submit}
              className="flex-1 py-2.5 rounded-lg bg-indigo-500 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Submit
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Post URL *
            </label>
            <input
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              placeholder="https://twitter.com/you/status/..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Screenshot URL (optional)
            </label>
            <input
              value={screenshotUrl}
              onChange={(e) => setScreenshotUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
