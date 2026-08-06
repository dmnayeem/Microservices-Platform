"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Plus,
  Eye,
  MousePointer2,
  Target,
  DollarSign,
  Trash2,
  Pause,
  Play,
} from "lucide-react";
import { StatCard } from "@/components/user/primitives/stat-card";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { toast } from "sonner";
import { promptDialog, confirmDialog } from "@/lib/confirm";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { CreateAdSheet } from "@/components/user/advertiser/create-ad-sheet";
import { SmartImage } from "@/components/user/primitives/smart-image";

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  status: string;
  remaining: number;
  spent: number;
  budget: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface AdRow {
  id: string;
  format: string;
  placement: string | null;
  status: string;
  rejectionReason?: string | null;
  brandName: string | null;
  headline: string | null;
  contentUrl: string | null;
  impressions: number;
  clicks: number;
  ctr: number;
  promotedPost: { id: string; content: string; image: string | null } | null;
}

interface DayStat {
  date: string;
  impressions: number;
  clicks: number;
  spendUsd: number;
}

export function CampaignDetailView({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [series, setSeries] = useState<DayStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      const [dRes, aRes] = await Promise.all([
        fetch(`/api/advertiser/campaigns/${campaignId}`),
        fetch(`/api/advertiser/campaigns/${campaignId}/analytics?days=14`),
      ]);
      if (!dRes.ok) throw new Error("Not found");
      const d = await dRes.json();
      setCampaign(d.campaign);
      setAds(d.ads ?? []);
      const a = await aRes.json().catch(() => ({ series: [] }));
      setSeries(a.series ?? []);
    } catch {
      setCampaign(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const fund = async () => {
    if (!campaign) return;
    const input = await promptDialog({
      title: "Add budget",
      description: `Add budget to "${campaign.title}" (USD, from your Ad Credit):`,
      tone: "info",
      defaultValue: "20",
      placeholder: "Amount in USD",
      confirmLabel: "Add budget",
    });
    if (input == null) return;
    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      const res = await fetch(`/api/advertiser/campaigns/${campaignId}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      toast.success(`$${amount.toFixed(2)} added`);
      load();
    } catch (err) {
      toast.error("Funding failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    }
  };

  const toggleAd = async (ad: AdRow) => {
    const next = ad.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await fetch(`/api/advertiser/ads/${ad.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      setAds((prev) =>
        prev.map((x) => (x.id === ad.id ? { ...x, status: next } : x))
      );
    } catch {
      toast.error("Couldn't update ad");
    }
  };

  const removeAd = async (ad: AdRow) => {
    if (
      !(await confirmDialog({
        title: "Delete this ad?",
        tone: "danger",
        confirmLabel: "Delete",
      }))
    )
      return;
    try {
      const res = await fetch(`/api/advertiser/ads/${ad.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      setAds((prev) => prev.filter((x) => x.id !== ad.id));
      toast.success("Ad deleted");
    } catch {
      toast.error("Couldn't delete ad");
    }
  };

  if (loading) return <ListSkeleton rows={4} />;
  if (!campaign) {
    return (
      <EmptyState
        icon={Target}
        title="Campaign not found"
        description="It may have been deleted."
      />
    );
  }

  const maxImp = Math.max(1, ...series.map((s) => s.impressions));

  return (
    <div className="space-y-4">
      <Link
        href="/advertiser"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
      >
        <ChevronLeft className="w-4 h-4" />
        All campaigns
      </Link>

      {/* Header */}
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white truncate">
              {campaign.title}
            </h1>
            {campaign.description && (
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                {campaign.description}
              </p>
            )}
            <span
              className={`inline-block mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                campaign.status === "ACTIVE"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : campaign.status === "PAUSED"
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-gray-700 text-gray-400"
              }`}
            >
              {campaign.status}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-sm text-gray-300 tabular-nums">
              ${campaign.spent.toFixed(2)} / ${campaign.budget.toFixed(2)}
            </span>
            {campaign.status !== "ENDED" && (
              <button
                onClick={fund}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-500/15 text-indigo-300 text-[11px] font-bold hover:bg-indigo-500/25"
              >
                <Plus className="w-3 h-3" />
                Fund
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Impressions" value={campaign.impressions} icon={<Eye className="w-4 h-4" />} tone="purple" />
        <StatCard label="Clicks" value={campaign.clicks} icon={<MousePointer2 className="w-4 h-4" />} tone="amber" />
        <StatCard label="CTR" value={`${campaign.ctr.toFixed(2)}%`} icon={<Target className="w-4 h-4" />} tone="green" />
        <StatCard label="Spent" value={`$${campaign.spent.toFixed(2)}`} icon={<DollarSign className="w-4 h-4" />} tone="blue" />
      </div>

      {/* 14-day impressions bar chart */}
      <div className="card p-4">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-3">
          Impressions · last 14 days
        </p>
        {series.every((s) => s.impressions === 0) ? (
          <p className="text-xs text-gray-600 py-4 text-center">
            No impressions yet.
          </p>
        ) : (
          <div className="flex items-end gap-1 h-24">
            {series.map((s) => (
              <div key={s.date} className="flex-1 flex flex-col items-center gap-1" title={`${s.date}: ${s.impressions} impressions, ${s.clicks} clicks`}>
                <div
                  className="w-full rounded-t bg-linear-to-t from-indigo-600 to-purple-500"
                  style={{ height: `${(s.impressions / maxImp) * 100}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ads */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
          Ads ({ads.length})
        </p>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-semibold"
        >
          <Plus className="w-4 h-4" />
          Create Ad
        </button>
      </div>

      {ads.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No ads yet"
          description="Create your first ad — a native feed post or a promoted post."
          action={{ label: "Create Ad", onClick: () => setCreating(true) }}
        />
      ) : (
        <div className="space-y-2">
          {ads.map((ad) => {
            const title =
              ad.brandName ||
              ad.headline ||
              ad.promotedPost?.content ||
              "Ad";
            const thumb = ad.contentUrl || ad.promotedPost?.image || null;
            return (
              <div
                key={ad.id}
                className="card p-3 flex items-center gap-3"
              >
                <div className="relative w-12 h-12 rounded-lg bg-gray-800 overflow-hidden shrink-0 flex items-center justify-center">
                  {thumb ? (
                    <SmartImage src={thumb} alt="" fill sizes="48px" className="object-cover" />
                  ) : (
                    <Target className="w-5 h-5 text-gray-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {title}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="text-[10px] px-1 py-0.5 rounded bg-gray-800 text-gray-400 font-bold uppercase">
                      {ad.format}
                    </span>
                    {ad.promotedPost && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-bold uppercase">
                        Promoted post
                      </span>
                    )}
                    <AdStatusBadge status={ad.status} rejectionReason={ad.rejectionReason} />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
                    {ad.impressions.toLocaleString()} impr · {ad.clicks.toLocaleString()} clicks · {ad.ctr.toFixed(1)}% CTR
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleAd(ad)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800"
                    title={ad.status === "ACTIVE" ? "Pause" : "Resume"}
                  >
                    {ad.status === "ACTIVE" ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => removeAd(ad)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateAdSheet
        open={creating}
        onOpenChange={setCreating}
        campaignId={campaignId}
        onCreated={() => {
          setCreating(false);
          load();
        }}
      />
    </div>
  );
}

function AdStatusBadge({
  status,
  rejectionReason,
}: {
  status: string;
  rejectionReason?: string | null;
}) {
  const s = status?.toUpperCase();
  if (s === "PENDING") {
    return (
      <span className="text-[10px] px-1 py-0.5 rounded font-bold uppercase bg-amber-500/10 text-amber-400">
        Pending review
      </span>
    );
  }
  if (s === "REJECTED") {
    return (
      <span
        title={rejectionReason || "Rejected"}
        className="text-[10px] px-1 py-0.5 rounded font-bold uppercase bg-red-500/10 text-red-400"
      >
        Rejected
      </span>
    );
  }
  return (
    <span
      className={`text-[10px] px-1 py-0.5 rounded font-bold uppercase ${
        s === "ACTIVE"
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-amber-500/10 text-amber-400"
      }`}
    >
      {status}
    </span>
  );
}
