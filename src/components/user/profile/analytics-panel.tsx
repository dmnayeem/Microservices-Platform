"use client";

import {
  Loader2,
  BarChart3,
  Image as ImageIcon,
  Eye as EyeIcon,
  ThumbsUp,
  MessageSquare,
  Share2,
  TrendingUp,
  Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartImage } from "@/components/user/primitives/smart-image";

export interface AnalyticsResp {
  totals: {
    posts: number;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    earnings: number;
  };
  topPosts: Array<{
    id: string;
    content: string;
    thumbnail: string | null;
    viewsCount: number;
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    createdAt: string | Date;
  }>;
  viewsByDay: { date: string; views: number }[];
}

export function AnalyticsPanel({
  data,
  loading,
}: {
  data: AnalyticsResp | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm inline-flex items-center justify-center gap-2 w-full">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading analytics…
      </div>
    );
  }
  if (!data || data.totals.posts === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center">
        <BarChart3 className="w-10 h-10 text-gray-700 mx-auto mb-2" />
        <p className="text-sm text-gray-400 font-semibold">No analytics yet</p>
        <p className="text-xs text-gray-600 mt-1">
          Once posts are published, view + engagement insights will appear here.
        </p>
      </div>
    );
  }

  const { totals, topPosts, viewsByDay } = data;
  const maxViews = Math.max(1, ...viewsByDay.map((d) => d.views));
  const totalEngagement = totals.likes + totals.comments + totals.shares;
  const avgEngagement =
    totals.views > 0 ? ((totalEngagement / totals.views) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <AnalyticsTile
          icon={<Coins className="w-4 h-4" />}
          label="Earned"
          value={`${totals.earnings.toLocaleString()} pts`}
          tone="gold"
        />
        <AnalyticsTile
          icon={<ImageIcon className="w-4 h-4" />}
          label="Posts"
          value={totals.posts.toLocaleString()}
          tone="indigo"
        />
        <AnalyticsTile
          icon={<EyeIcon className="w-4 h-4" />}
          label="Views"
          value={totals.views.toLocaleString()}
          tone="sky"
        />
        <AnalyticsTile
          icon={<ThumbsUp className="w-4 h-4" />}
          label="Likes"
          value={totals.likes.toLocaleString()}
          tone="rose"
        />
        <AnalyticsTile
          icon={<MessageSquare className="w-4 h-4" />}
          label="Comments"
          value={totals.comments.toLocaleString()}
          tone="purple"
        />
        <AnalyticsTile
          icon={<Share2 className="w-4 h-4" />}
          label="Shares"
          value={totals.shares.toLocaleString()}
          tone="emerald"
        />
        <AnalyticsTile
          icon={<TrendingUp className="w-4 h-4" />}
          label="Engagement"
          value={`${avgEngagement}%`}
          tone="amber"
        />
      </div>

      <div className="glass rounded-xl p-4 sm:p-5 space-y-3">
        <h3 className="text-sm font-bold text-white">Daily views (last 14 days)</h3>
        <div className="flex items-end gap-1 h-32 sm:h-40">
          {viewsByDay.map((d) => {
            const heightPct = (d.views / maxViews) * 100;
            return (
              <div
                key={d.date}
                className="flex-1 group relative flex items-end"
                title={`${d.date}: ${d.views} views`}
              >
                <div
                  className="w-full rounded-t bg-linear-to-t from-indigo-600 to-purple-500 hover:from-indigo-400 hover:to-purple-300 transition-colors min-h-0.5"
                  style={{ height: `${Math.max(2, heightPct)}%` }}
                />
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-gray-800 text-[10px] text-white opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                  {d.views}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 font-mono">
          <span>{viewsByDay[0]?.date.slice(5)}</span>
          <span>{viewsByDay[viewsByDay.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      <div className="glass rounded-xl p-4 sm:p-5 space-y-3">
        <h3 className="text-sm font-bold text-white">Top performing posts</h3>
        {topPosts.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No posts yet.</p>
        ) : (
          <div className="space-y-2">
            {topPosts.map((p, idx) => (
              <div
                key={p.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-gray-950 border border-gray-800"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center justify-center shrink-0">
                  #{idx + 1}
                </div>
                {p.thumbnail && (
                  <SmartImage
                    src={p.thumbnail}
                    alt=""
                    width={48}
                    height={48}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                    className="w-12 h-12 rounded-lg object-cover bg-gray-800 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {p.content || (
                      <span className="italic text-gray-500">No caption</span>
                    )}
                  </p>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px] text-gray-500">
                    <span className="inline-flex items-center gap-0.5">
                      <EyeIcon className="w-3 h-3" />
                      {p.viewsCount.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <ThumbsUp className="w-3 h-3" />
                      {p.likesCount.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <MessageSquare className="w-3 h-3" />
                      {p.commentsCount.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <Share2 className="w-3 h-3" />
                      {p.sharesCount.toLocaleString()}
                    </span>
                    <span className="ml-auto text-gray-600">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyticsTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "indigo" | "sky" | "rose" | "purple" | "emerald" | "amber" | "gold";
}) {
  const tones: Record<typeof tone, string> = {
    indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    sky: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    rose: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    gold: "text-yellow-300 bg-yellow-400/10 border-yellow-400/25",
  };
  return (
    <div className="glass p-3 flex items-center gap-3 min-w-0">
      <div className={cn("p-2 rounded-lg border shrink-0", tones[tone])}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold truncate">
          {label}
        </p>
        <p className="text-base font-extrabold text-white tabular-nums truncate">
          {value}
        </p>
      </div>
    </div>
  );
}
