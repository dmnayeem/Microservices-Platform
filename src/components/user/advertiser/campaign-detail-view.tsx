"use client";

import { useCallback, useEffect, useState } from "react";
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
  Pencil,
  RotateCw,
  StopCircle,
  CalendarClock,
} from "lucide-react";
import { StatCard } from "@/components/user/primitives/stat-card";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { toast } from "@/lib/toast";
import { promptDialog, confirmDialog } from "@/lib/confirm";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { AdSheet, type EditableAd } from "@/components/user/advertiser/ad-sheet";
import { SmartImage } from "@/components/user/primitives/smart-image";
import type { AdTargeting } from "@/lib/ad-targeting";

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  status: string;
  remaining: number;
  spent: number;
  budget: number;
  startAt: string | null;
  endAt: string | null;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface AdRow {
  id: string;
  format: string;
  placement: string | null;
  placementLabel: string | null;
  status: string;
  rejectionReason?: string | null;
  brandName: string | null;
  brandLogo: string | null;
  headline: string | null;
  contentUrl: string | null;
  videoUrl: string | null;
  ctaLabel: string | null;
  targetUrl: string | null;
  size: string | null;
  targeting: AdTargeting | null;
  submittedAt: string | null;
  approvedAt: string | null;
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

const RANGES = [7, 14, 30, 90] as const;

export function CampaignDetailView({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [ads, setAds] = useState<AdRow[]>([]);
  const [series, setSeries] = useState<DayStat[]>([]);
  const [days, setDays] = useState<(typeof RANGES)[number]>(14);
  const [metric, setMetric] = useState<"impressions" | "clicks" | "spendUsd">("impressions");
  const [loading, setLoading] = useState(true);
  const [sheetAd, setSheetAd] = useState<EditableAd | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dRes, aRes] = await Promise.all([
        fetch(`/api/advertiser/campaigns/${campaignId}`),
        fetch(`/api/advertiser/campaigns/${campaignId}/analytics?days=${days}`),
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
  }, [campaignId, days]);

  useEffect(() => {
    void load();
  }, [load]);

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

  /** Advertiser-owned campaign controls (pause / resume / reschedule). */
  const patchCampaign = async (body: Record<string, unknown>, okMsg: string) => {
    try {
      const res = await fetch(`/api/advertiser/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't update the campaign");
      toast.success(okMsg);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the campaign");
    }
  };

  const endCampaign = async () => {
    if (!campaign) return;
    const ok = await confirmDialog({
      title: "End this campaign?",
      description: `Its ads stop running and the unspent $${campaign.remaining.toFixed(2)} goes back to your Ad Credit. This can't be undone.`,
      tone: "danger",
      confirmLabel: "End campaign",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/advertiser/campaigns/${campaignId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": newIdempotencyKey() },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't end the campaign");
      toast.success(
        d.refunded > 0
          ? `Campaign ended — $${Number(d.refunded).toFixed(2)} returned to your Ad Credit`
          : "Campaign ended"
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't end the campaign");
    }
  };

  const editSchedule = async () => {
    const input = await promptDialog({
      title: "End date",
      description: "When should this campaign stop running? Leave empty to run until the budget is gone (YYYY-MM-DD).",
      tone: "info",
      defaultValue: campaign?.endAt ? campaign.endAt.slice(0, 10) : "",
      placeholder: "YYYY-MM-DD",
      confirmLabel: "Save",
    });
    if (input == null) return;
    const trimmed = input.trim();
    if (trimmed && Number.isNaN(new Date(trimmed).getTime())) {
      toast.error("Use the YYYY-MM-DD format");
      return;
    }
    await patchCampaign(
      { endAt: trimmed ? new Date(`${trimmed}T23:59:59`).toISOString() : null },
      trimmed ? "End date saved" : "End date cleared"
    );
  };

  // Pause/resume is only ever offered on an ad that cleared review — the server
  // rejects anything else, and offering the button would just be a trap.
  const toggleAd = async (ad: AdRow) => {
    if (ad.status !== "ACTIVE" && ad.status !== "PAUSED") return;
    const next = ad.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await fetch(`/api/advertiser/ads/${ad.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't update ad");
      setAds((prev) =>
        prev.map((x) => (x.id === ad.id ? { ...x, status: d.status ?? next } : x))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update ad");
    }
  };

  const resubmit = async (ad: AdRow) => {
    try {
      const res = await fetch(`/api/advertiser/ads/${ad.id}/resubmit`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't resubmit");
      toast.success("Sent back for review");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't resubmit");
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
      const res = await fetch(`/api/advertiser/ads/${ad.id}`, { method: "DELETE" });
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

  const metricMax = Math.max(1, ...series.map((s) => Number(s[metric]) || 0));
  const live = campaign.status !== "ENDED";

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
            <h1 className="text-lg font-bold text-white truncate">{campaign.title}</h1>
            {campaign.description && (
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{campaign.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                  campaign.status === "ACTIVE"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : campaign.status === "PAUSED"
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-gray-700 text-gray-400"
                }`}
              >
                {campaign.status}
              </span>
              {(campaign.startAt || campaign.endAt) && (
                <span className="text-[10px] text-gray-500">
                  {campaign.startAt ? new Date(campaign.startAt).toLocaleDateString() : "now"} →{" "}
                  {campaign.endAt ? new Date(campaign.endAt).toLocaleDateString() : "no end date"}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-sm text-gray-300 tabular-nums">
              ${campaign.spent.toFixed(2)} / ${campaign.budget.toFixed(2)}
            </span>
            <span className="text-[10px] text-gray-500 tabular-nums">
              ${campaign.remaining.toFixed(2)} left
            </span>
          </div>
        </div>

        {/* Campaign controls. Previously there were none — only an admin could
            pause or end a campaign, so a funded budget was unrecoverable. */}
        {live && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            <button
              onClick={fund}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-indigo-500/15 text-indigo-300 text-[11px] font-bold hover:bg-indigo-500/25"
            >
              <Plus className="w-3 h-3" /> Fund
            </button>
            <button
              onClick={() =>
                patchCampaign(
                  { status: campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE" },
                  campaign.status === "ACTIVE" ? "Campaign paused" : "Campaign resumed"
                )
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-800 text-gray-200 text-[11px] font-bold hover:bg-gray-700"
            >
              {campaign.status === "ACTIVE" ? (
                <>
                  <Pause className="w-3 h-3" /> Pause
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" /> Resume
                </>
              )}
            </button>
            <button
              onClick={editSchedule}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-gray-800 text-gray-200 text-[11px] font-bold hover:bg-gray-700"
            >
              <CalendarClock className="w-3 h-3" /> End date
            </button>
            <button
              onClick={endCampaign}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-red-500/10 text-red-300 text-[11px] font-bold hover:bg-red-500/20"
            >
              <StopCircle className="w-3 h-3" /> End &amp; refund
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Impressions" value={campaign.impressions} icon={<Eye className="w-4 h-4" />} tone="purple" />
        <StatCard label="Clicks" value={campaign.clicks} icon={<MousePointer2 className="w-4 h-4" />} tone="amber" />
        <StatCard label="CTR" value={`${campaign.ctr.toFixed(2)}%`} icon={<Target className="w-4 h-4" />} tone="green" />
        <StatCard label="Spent" value={`$${campaign.spent.toFixed(2)}`} icon={<DollarSign className="w-4 h-4" />} tone="blue" />
      </div>

      {/* Daily chart — the API always returned clicks and spend too; the UI used
          to throw both away and hardcode 14 days. */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden text-[10px]">
            {(
              [
                { id: "impressions", label: "Impressions" },
                { id: "clicks", label: "Clicks" },
                { id: "spendUsd", label: "Spend" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => setMetric(m.id)}
                className={`px-2.5 py-1 font-bold ${
                  metric === m.id ? "bg-indigo-500 text-white" : "bg-gray-800 text-gray-400"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden text-[10px]">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDays(r)}
                className={`px-2.5 py-1 font-bold ${
                  days === r ? "bg-indigo-500 text-white" : "bg-gray-800 text-gray-400"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
        {series.every((s) => (Number(s[metric]) || 0) === 0) ? (
          <p className="text-xs text-gray-600 py-4 text-center">No data yet.</p>
        ) : (
          <div className="flex items-end gap-1 h-24">
            {series.map((s) => (
              <div
                key={s.date}
                className="flex-1 flex flex-col items-center gap-1"
                title={`${s.date}: ${s.impressions} impressions · ${s.clicks} clicks · $${Number(s.spendUsd ?? 0).toFixed(2)}`}
              >
                <div
                  className="w-full rounded-t bg-linear-to-t from-indigo-600 to-purple-500"
                  style={{ height: `${((Number(s[metric]) || 0) / metricMax) * 100}%` }}
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
          onClick={() => {
            setSheetAd(null);
            setCreating(true);
          }}
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
          action={{
            label: "Create Ad",
            onClick: () => {
              setSheetAd(null);
              setCreating(true);
            },
          }}
        />
      ) : (
        <div className="space-y-2">
          {ads.map((ad) => {
            const title = ad.brandName || ad.headline || ad.promotedPost?.content || "Ad";
            const thumb = ad.contentUrl || ad.promotedPost?.image || null;
            const needsFix = ad.status === "REJECTED" || ad.status === "CHANGES_REQUESTED";
            return (
              <div key={ad.id} className="card p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="relative w-12 h-12 rounded-lg bg-gray-800 overflow-hidden shrink-0 flex items-center justify-center">
                    {thumb ? (
                      <SmartImage src={thumb} alt="" fill sizes="48px" className="object-cover" />
                    ) : (
                      <Target className="w-5 h-5 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{title}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="text-[10px] px-1 py-0.5 rounded bg-gray-800 text-gray-400 font-bold uppercase">
                        {ad.format === "NATIVE" ? "Feed" : "Banner"}
                      </span>
                      {ad.placementLabel && (
                        <span className="text-[10px] text-gray-500">{ad.placementLabel}</span>
                      )}
                      {ad.promotedPost && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-bold uppercase">
                          Promoted post
                        </span>
                      )}
                      <AdStatusBadge status={ad.status} />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
                      {ad.impressions.toLocaleString()} impr · {ad.clicks.toLocaleString()} clicks ·{" "}
                      {ad.ctr.toFixed(1)}% CTR
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(ad.status === "ACTIVE" || ad.status === "PAUSED") && (
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
                    )}
                    <button
                      onClick={() => {
                        setSheetAd(ad);
                        setCreating(true);
                      }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
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

                {/* Review state, spelled out. The reason used to live only in a
                    hover tooltip that was never populated — invisible on mobile
                    and empty everywhere else. */}
                {ad.status === "PENDING" && (
                  <p className="rounded-lg bg-amber-500/10 text-amber-200/90 text-[11px] p-2">
                    In review{ad.submittedAt ? ` since ${new Date(ad.submittedAt).toLocaleString()}` : ""}. It
                    starts running as soon as an admin approves it.
                  </p>
                )}
                {needsFix && (
                  <div className="rounded-lg bg-red-500/10 p-2 space-y-2">
                    <p className="text-[11px] text-red-200/90 whitespace-pre-wrap">
                      {ad.rejectionReason || "This ad wasn't approved."}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSheetAd(ad);
                          setCreating(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-500 text-white text-[11px] font-bold"
                      >
                        <Pencil className="w-3 h-3" /> Fix &amp; resubmit
                      </button>
                      <button
                        onClick={() => resubmit(ad)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-800 text-gray-200 text-[11px] font-bold"
                      >
                        <RotateCw className="w-3 h-3" /> Resubmit as-is
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AdSheet
        open={creating}
        onOpenChange={(v) => {
          setCreating(v);
          if (!v) setSheetAd(null);
        }}
        campaignId={campaignId}
        ad={sheetAd}
        onSaved={() => {
          setCreating(false);
          setSheetAd(null);
          load();
        }}
      />
    </div>
  );
}

function AdStatusBadge({ status }: { status: string }) {
  const s = status?.toUpperCase();
  const map: Record<string, { label: string; cls: string }> = {
    PENDING: { label: "Pending review", cls: "bg-amber-500/10 text-amber-400" },
    CHANGES_REQUESTED: { label: "Changes requested", cls: "bg-orange-500/10 text-orange-400" },
    REJECTED: { label: "Rejected", cls: "bg-red-500/10 text-red-400" },
    ACTIVE: { label: "Active", cls: "bg-emerald-500/10 text-emerald-400" },
    PAUSED: { label: "Paused", cls: "bg-amber-500/10 text-amber-400" },
    INACTIVE: { label: "Off", cls: "bg-gray-700 text-gray-400" },
  };
  const m = map[s] ?? { label: s, cls: "bg-gray-700 text-gray-400" };
  return (
    <span className={`text-[10px] px-1 py-0.5 rounded font-bold uppercase ${m.cls}`}>
      {m.label}
    </span>
  );
}
