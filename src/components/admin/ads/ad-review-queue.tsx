"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, Rss, Newspaper, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartImage } from "@/components/user/primitives/smart-image";
import {
  PLACEMENT_LABELS,
  StatusPill,
  targetingSummary,
  timeAgo,
} from "@/components/admin/ads/ad-ui";
import { AdReviewPanel } from "@/components/admin/ads/ad-review-panel";
import { ADVERTISER_PLACEMENTS } from "@/lib/ad-placements";
import type { AdTargeting } from "@/lib/ad-targeting";

interface QueueAd {
  id: string;
  status: string;
  format: string;
  headline: string | null;
  brandName: string | null;
  brandLogo: string | null;
  contentUrl: string | null;
  videoUrl: string | null;
  targetUrl: string | null;
  targeting: AdTargeting | null;
  submittedAt: string | null;
  createdAt: string;
  rejectionReason: string | null;
  placement: { name: string };
  campaign: {
    title: string;
    status: string;
    advertiser: { id: string; name: string | null; username: string | null } | null;
  };
}

const STATES = [
  { id: "pending", label: "Pending", countKey: "pending" },
  { id: "changes", label: "Changes requested", countKey: "changes" },
  { id: "rejected", label: "Rejected", countKey: "rejected" },
  { id: "approved", label: "Recently approved", countKey: "approved" },
] as const;

type StateId = (typeof STATES)[number]["id"];

/**
 * The approvals tab. Server-driven: the old version client-filtered a 200-row
 * payload, so an older pending ad simply never appeared. Decided ads stay
 * visible with their reasons so a decision can be reviewed — and reopened.
 */
export function AdReviewQueue({
  canManage,
  onChanged,
}: {
  canManage: boolean;
  onChanged?: () => void;
}) {
  const [state, setState] = useState<StateId>("pending");
  const [q, setQ] = useState("");
  const [placement, setPlacement] = useState("");
  const [ads, setAds] = useState<QueueAd[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(
    async (append = false, cur: string | null = null) => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({ state, limit: "25" });
        if (q.trim()) sp.set("q", q.trim());
        if (placement) sp.set("placement", placement);
        if (cur) sp.set("cursor", cur);
        const res = await fetch(`/api/admin/ads/pending?${sp}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Failed to load");
        setAds((prev) => (append ? [...prev, ...(d.ads ?? [])] : d.ads ?? []));
        setCounts(d.counts ?? {});
        setCursor(d.nextCursor ?? null);
      } catch {
        if (!append) setAds([]);
      } finally {
        setLoading(false);
      }
    },
    [state, q, placement]
  );

  useEffect(() => {
    const t = setTimeout(() => void load(false, null), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const oldest = ads.length ? ads[0] : null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100/90">
        <b className="text-white">Approval queue.</b> Advertiser submissions land here and don&apos;t
        serve until approved. Open one to see its destination URL, creative, audience and the
        advertiser&apos;s history before deciding.
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATES.map((s) => (
          <button
            key={s.id}
            onClick={() => setState(s.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold",
              state === s.id
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            )}
          >
            {s.label}
            {counts[s.countKey] > 0 && (
              <span
                className={cn(
                  "min-w-4 px-1 rounded-full text-[10px] font-bold",
                  state === s.id ? "bg-white/20" : "bg-slate-700 text-slate-200"
                )}
              >
                {counts[s.countKey]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search headline, brand, destination or campaign"
            className="w-full pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={placement}
          onChange={(e) => setPlacement(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
        >
          <option value="">All ad spaces</option>
          {ADVERTISER_PLACEMENTS.map((p) => (
            <option key={p.name} value={p.name}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {state === "pending" && oldest && (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Clock className="w-3.5 h-3.5" />
          {counts.pending ?? ads.length} waiting · oldest has been in the queue{" "}
          {timeAgo(oldest.submittedAt ?? oldest.createdAt)}
        </p>
      )}

      {loading && ads.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </div>
      ) : ads.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">Nothing here.</p>
      ) : (
        <div className="space-y-2">
          {ads.map((ad) => {
            const thumb = ad.contentUrl || ad.brandLogo;
            const title = ad.brandName || ad.headline || ad.campaign.title;
            const advertiser =
              ad.campaign.advertiser?.name ?? ad.campaign.advertiser?.username ?? "House";
            const isFeed = ad.format === "NATIVE";
            const tgt = targetingSummary(ad.targeting);
            return (
              <button
                key={ad.id}
                onClick={() => setOpenId(ad.id)}
                className="w-full text-left flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {thumb ? (
                    <SmartImage
                      src={thumb}
                      alt=""
                      width={56}
                      height={56}
                      className="w-14 h-14 rounded-lg object-cover bg-slate-950 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-slate-950 grid place-items-center text-slate-600 shrink-0">
                      {isFeed ? <Rss className="w-5 h-5" /> : <Newspaper className="w-5 h-5" />}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {ad.campaign.title} · by <span className="text-slate-300">{advertiser}</span>
                    </p>
                    {/* Destination host up front: it is the field a reviewer
                        judges first, and the old queue never showed it. */}
                    <p className="text-[11px] text-sky-300 mt-0.5 truncate">
                      {hostOf(ad.targetUrl) || "no destination URL"}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      <StatusPill status={ad.status} />
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                          isFeed ? "bg-indigo-500/15 text-indigo-300" : "bg-slate-800 text-slate-400"
                        )}
                      >
                        {isFeed ? "Feed" : "Banner"}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {PLACEMENT_LABELS[ad.placement.name] ?? ad.placement.name}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {timeAgo(ad.submittedAt ?? ad.createdAt)} ago
                      </span>
                      {tgt && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-800 text-slate-300">
                          🎯 {tgt}
                        </span>
                      )}
                    </div>
                    {ad.rejectionReason && (
                      <p className="text-[11px] text-red-300/80 mt-1 line-clamp-2">
                        {ad.rejectionReason}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs font-semibold text-blue-400 shrink-0">Review →</span>
              </button>
            );
          })}

          {cursor && (
            <button
              onClick={() => void load(true, cursor)}
              disabled={loading}
              className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold"
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}

      {openId && (
        <AdReviewPanel
          adId={openId}
          canManage={canManage}
          onClose={() => setOpenId(null)}
          onDecided={() => {
            void load(false, null);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
