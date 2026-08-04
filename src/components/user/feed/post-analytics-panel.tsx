"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Coins,
  Loader2,
  Sparkles,
  MousePointerClick,
  Link2,
} from "lucide-react";

interface AnalyticsResp {
  post: {
    id: string;
    viewsCount: number;
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    linkClicksCount: number;
    uniqueLinkClicksCount: number;
    donationsCount: number;
    donationsCollected: number;
    socialEarnings: number;
  };
  sparkline: { date: string; count: number }[];
}

export function PostAnalyticsPanel({ postId }: { postId: string }) {
  const [data, setData] = useState<AnalyticsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/feed/${postId}/analytics`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => {
        if (!cancel) setData(d as AnalyticsResp);
      })
      .catch((err) => {
        if (!cancel) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [postId]);

  if (loading) {
    return (
      <div className="border-t border-gray-800 px-4 py-3 flex items-center gap-2 text-xs text-gray-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading analytics…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="border-t border-gray-800 px-4 py-3 text-xs text-red-400">
        Couldn&apos;t load analytics: {error ?? "unknown"}
      </div>
    );
  }

  const { post, sparkline } = data;
  const max = Math.max(1, ...sparkline.map((s) => s.count));

  return (
    <div className="border-t border-gray-800 px-4 py-3 bg-gray-950/40 space-y-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-gray-500">
        <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
        Post Analytics
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat
          icon={<Eye className="w-3.5 h-3.5 text-indigo-400" />}
          label="Views (unique)"
          value={post.viewsCount}
        />
        <Stat
          icon={<Heart className="w-3.5 h-3.5 text-rose-400" />}
          label="Likes"
          value={post.likesCount}
        />
        <Stat
          icon={<MessageCircle className="w-3.5 h-3.5 text-blue-400" />}
          label="Comments"
          value={post.commentsCount}
        />
        <Stat
          icon={<Share2 className="w-3.5 h-3.5 text-emerald-400" />}
          label="Shares"
          value={post.sharesCount}
        />
      </div>

      {(post.linkClicksCount > 0 || post.uniqueLinkClicksCount > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <Stat
            icon={<MousePointerClick className="w-3.5 h-3.5 text-amber-400" />}
            label="Link clicks"
            value={post.linkClicksCount}
          />
          <Stat
            icon={<Link2 className="w-3.5 h-3.5 text-amber-400" />}
            label="Unique clicks"
            value={post.uniqueLinkClicksCount}
          />
        </div>
      )}

      {(post.donationsCount > 0 || post.donationsCollected > 0) && (
        <div className="rounded-lg bg-pink-500/10 border border-pink-500/20 px-3 py-2 text-xs text-pink-200 inline-flex items-center gap-2">
          💝 {post.donationsCollected.toLocaleString()} pts donated by{" "}
          {post.donationsCount} {post.donationsCount === 1 ? "person" : "people"}
        </div>
      )}

      <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 inline-flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-bold text-amber-300">
          {post.socialEarnings.toLocaleString()} pts
        </span>
        <span className="text-[11px] text-amber-200/70">earned from this post</span>
      </div>

      {/* Sparkline */}
      {sparkline.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5">
            Last 7 days · views
          </p>
          <div className="flex items-end gap-1 h-12">
            {sparkline.map((s) => {
              const h = Math.max(2, Math.round((s.count / max) * 100));
              return (
                <div
                  key={s.date}
                  className="flex-1 bg-indigo-500/30 hover:bg-indigo-500/60 rounded-t transition-colors"
                  style={{ height: `${h}%` }}
                  title={`${s.date}: ${s.count}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-1 text-[9px] text-gray-600 tabular-nums">
            <span>{sparkline[0]?.date.slice(5)}</span>
            <span>{sparkline[sparkline.length - 1]?.date.slice(5)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800 p-2.5">
      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-gray-500 font-bold">
        {icon}
        {label}
      </div>
      <p className="text-sm font-bold text-white tabular-nums mt-0.5">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

// Tiny coin import-stub silencer (Coins is exported elsewhere already)
export const _coins = Coins;
