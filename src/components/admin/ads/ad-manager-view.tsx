"use client";

import { confirmDialog } from "@/lib/confirm";

import { useEffect, useState } from "react";
import {
  Newspaper,
  Megaphone,
  Layers,
  BarChart3,
  Plus,
  Pencil,
  Trash2,
  Eye,
  MousePointer,
  Loader2,
  Save,
  ListChecks,
  PlayCircle,
  Film,
  CheckCircle2,
  Rss,
  LayoutDashboard,
  Sparkles,
  Wallet,
  ShoppingBag,
  User as UserIcon,
  ShieldCheck,
  Pause,
  Play,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, usd } from "@/lib/utils";
import { AdWizard } from "@/components/admin/ads/ad-wizard";
import { SmartImage } from "@/components/user/primitives/smart-image";
import { AudienceBuilder } from "@/components/admin/ads/audience-builder";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";
import { AD_PLACEMENTS, placementSizeKey } from "@/lib/ad-placements";
import { AD_SIZES, resolveAdSize } from "@/lib/ad-sizes";
import { SandboxedAdFrame } from "@/components/user/primitives/sandboxed-ad-frame";
import { AdReviewQueue } from "@/components/admin/ads/ad-review-queue";
import { AdReviewPanel } from "@/components/admin/ads/ad-review-panel";
import { ModalShell } from "@/components/admin/ads/modal-shell";
// Shared presentation so this view and the review console can't drift apart.
import { StatusPill, targetingSummary } from "@/components/admin/ads/ad-ui";
import { type AdTargeting } from "@/lib/ad-targeting";
import { DateField } from "@/components/ui/date-field";

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  budget: number;
  status: string;
  startAt?: string | null;
  endAt?: string | null;
  _count?: { ads: number };
}
interface PlacementStats {
  impressions: number;
  clicks: number;
  activeAds: number;
  totalAds: number;
}
interface Placement {
  id: string;
  name: string;
  isActive: boolean;
  rotationSeconds?: number | null;
  interstitialSeconds?: number | null;
  _count?: { ads: number };
  stats?: PlacementStats;
}
interface Ad {
  id: string;
  type: string;
  format: string;
  contentUrl: string | null;
  videoUrl: string | null;
  targetUrl: string | null;
  htmlContent: string | null;
  adSlot?: string | null;
  adUnitPath?: string | null;
  adClient?: string | null;
  impressionPixel?: string | null;
  clickTracker?: string | null;
  size: string | null;
  width: number | null;
  height: number | null;
  weight: number;
  status: string;
  impressions: number;
  clicks: number;
  rewardPoints: number;
  rewardCooldownSec: number;
  watchSeconds: number;
  headline: string | null;
  brandName: string | null;
  brandLogo: string | null;
  ctaLabel: string | null;
  targeting: AdTargeting | null;
  // Review state — the API always returned these; the client just dropped them,
  // which is why a rejection reason was never visible anywhere in the admin.
  rejectionReason?: string | null;
  rejectionCodes?: string[];
  reviewNote?: string | null;
  submittedById?: string | null;
  submittedAt?: string | null;
  reviewedById?: string | null;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  creativeGroupId?: string | null;
  createdAt?: string;
  allowSameOrigin?: boolean;
  campaign: {
    id: string;
    title: string;
    status?: string | null;
    budget?: number | null;
    startAt?: string | null;
    endAt?: string | null;
    advertiser?: { id: string; name: string | null; username: string | null } | null;
  };
  placement: { id: string; name: string };
}

const TABS = [
  { id: "ads", label: "Ads", icon: Newspaper },
  { id: "approvals", label: "Approvals", icon: ShieldCheck },
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
  { id: "placements", label: "Ad Spaces", icon: Layers },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
] as const;
type TabId = (typeof TABS)[number]["id"];

const PLACEMENT_LABEL = Object.fromEntries(AD_PLACEMENTS.map((p) => [p.name, p.label]));
const PLACEMENT_DESC = Object.fromEntries(AD_PLACEMENTS.map((p) => [p.name, p.description]));
const PLACEMENT_WHERE = Object.fromEntries(AD_PLACEMENTS.map((p) => [p.name, p.where]));
const CANONICAL_NAMES = new Set<string>(AD_PLACEMENTS.map((p) => p.name));

// Per-space icon for the Ad Spaces cards.
const PLACEMENT_ICON: Record<string, LucideIcon> = {
  TASK_LIST: ListChecks,
  TASK_START: PlayCircle,
  VIDEO_ABOVE: Film,
  VIDEO_BELOW: Film,
  TASK_COMPLETE: CheckCircle2,
  IN_FEED: Rss,
  FEED_SIDEBAR: Rss,
  DASHBOARD: LayoutDashboard,
  EARN_HUB: Sparkles,
  WALLET_TOP: Wallet,
  MARKETPLACE_TOP: ShoppingBag,
  PROFILE_BOTTOM: UserIcon,
  GAME_INTERSTITIAL: PlayCircle,
  VIDEO_INTERSTITIAL: Film,
};

export function AdManagerView({ canManage }: { canManage: boolean }) {
  const [tab, setTab] = useState<TabId>("ads");
  const [ads, setAds] = useState<Ad[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [adModal, setAdModal] = useState<Ad | "new" | null>(null);
  const [adWizard, setAdWizard] = useState(false);
  const [reviewAdId, setReviewAdId] = useState<string | null>(null);
  const [adFilter, setAdFilter] = useState({ status: "", placement: "", q: "" });
  const [campModal, setCampModal] = useState<Campaign | "new" | null>(null);
  const [newPlacement, setNewPlacement] = useState("");
  const [demoBusy, setDemoBusy] = useState(false);
  const [rotationSeconds, setRotationSeconds] = useState(12);
  const [rotationBusy, setRotationBusy] = useState(false);
  const [cpcUsd, setCpcUsd] = useState(0.01);
  const [cpcBusy, setCpcBusy] = useState(false);
  const [adsenseClient, setAdsenseClient] = useState("");
  const [gamNetworkCode, setGamNetworkCode] = useState("");
  const [networkBusy, setNetworkBusy] = useState(false);
  const [feedAdInterval, setFeedAdInterval] = useState(2);
  const [feedPromoInterval, setFeedPromoInterval] = useState(4);
  const [underPostBanner, setUnderPostBanner] = useState(true);
  const [underPostInterval, setUnderPostInterval] = useState(3);
  const [boostMaxPerUser, setBoostMaxPerUser] = useState(20);
  const [densityBusy, setDensityBusy] = useState(false);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantAmount, setGrantAmount] = useState(10);
  const [grantBusy, setGrantBusy] = useState(false);

  const grantAdCredit = async () => {
    if (!grantEmail.trim() || !Number.isFinite(grantAmount) || grantAmount === 0) {
      toast.error("Email + non-zero amount required");
      return;
    }
    setGrantBusy(true);
    try {
      const res = await fetch("/api/admin/ads/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: grantEmail.trim(), amountUsd: grantAmount }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      toast.success(`Ad credit updated — balance ${usd((d.adCreditBalance ?? 0))}`);
      setGrantEmail("");
      setGrantAmount(10);
    } catch (err) {
      toast.error("Grant failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setGrantBusy(false);
    }
  };

  const saveDensity = async () => {
    setDensityBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "ads",
          settings: {
            "ads.feed_ad_interval": Math.max(1, feedAdInterval),
            "ads.feed_promo_interval": Math.max(1, feedPromoInterval),
            "ads.under_post_banner": underPostBanner,
            "ads.under_post_interval": Math.max(1, underPostInterval),
            "feed.boost_max_per_user": Math.max(0, boostMaxPerUser),
          },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Feed ad density saved");
    } catch {
      toast.error("Couldn't save density");
    } finally {
      setDensityBusy(false);
    }
  };

  const saveNetworkGlobals = async () => {
    setNetworkBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "ads",
          settings: {
            "ads.adsense_client": adsenseClient.trim(),
            "ads.gam_network_code": gamNetworkCode.trim(),
          },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Ad-network settings saved");
    } catch {
      toast.error("Couldn't save ad-network settings");
    } finally {
      setNetworkBusy(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (adFilter.status) sp.set("status", adFilter.status);
      if (adFilter.placement) sp.set("placement", adFilter.placement);
      if (adFilter.q.trim()) sp.set("q", adFilter.q.trim());
      const [a, c, p] = await Promise.all([
        fetch(`/api/admin/ads?${sp}`).then((r) => r.json()),
        fetch("/api/admin/ads/campaigns").then((r) => r.json()),
        fetch("/api/admin/ads/placements").then((r) => r.json()),
      ]);
      setAds(a.ads ?? []);
      setCampaigns(c.campaigns ?? []);
      setPlacements(p.placements ?? []);
      if (typeof p.rotationSeconds === "number") setRotationSeconds(p.rotationSeconds);
      if (typeof p.cpcUsd === "number") setCpcUsd(p.cpcUsd);
      if (typeof p.adsenseClient === "string") setAdsenseClient(p.adsenseClient);
      if (typeof p.gamNetworkCode === "string") setGamNetworkCode(p.gamNetworkCode);
      if (p.density) {
        setFeedAdInterval(p.density.feedAdInterval ?? 2);
        setFeedPromoInterval(p.density.feedPromoInterval ?? 4);
        setUnderPostBanner(!!p.density.underPostBanner);
        setUnderPostInterval(p.density.underPostInterval ?? 3);
        if (typeof p.density.boostMaxPerUser === "number")
          setBoostMaxPerUser(p.density.boostMaxPerUser);
      }
    } catch {
      toast.error("Failed to load ad data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/admin/ads").then((r) => r.json()),
      fetch("/api/admin/ads/campaigns").then((r) => r.json()),
      fetch("/api/admin/ads/placements").then((r) => r.json()),
    ])
      .then(([a, c, p]) => {
        if (!active) return;
        setAds(a.ads ?? []);
        setCampaigns(c.campaigns ?? []);
        setPlacements(p.placements ?? []);
        if (typeof p.rotationSeconds === "number") setRotationSeconds(p.rotationSeconds);
        if (typeof p.cpcUsd === "number") setCpcUsd(p.cpcUsd);
        if (typeof p.adsenseClient === "string") setAdsenseClient(p.adsenseClient);
        if (typeof p.gamNetworkCode === "string") setGamNetworkCode(p.gamNetworkCode);
        if (p.density) {
          setFeedAdInterval(p.density.feedAdInterval ?? 2);
          setFeedPromoInterval(p.density.feedPromoInterval ?? 4);
          setUnderPostBanner(!!p.density.underPostBanner);
          setUnderPostInterval(p.density.underPostInterval ?? 3);
        }
      })
      .catch(() => active && toast.error("Failed to load ad data"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const saveRotationSeconds = async (secs: number) => {
    const clamped = Math.min(60, Math.max(5, Math.round(secs) || 12));
    setRotationSeconds(clamped);
    setRotationBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "ads",
          settings: { "ads.rotation_seconds": clamped },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Ads rotate every ${clamped}s`);
    } catch {
      toast.error("Couldn't save rotation interval");
    } finally {
      setRotationBusy(false);
    }
  };

  const saveCpc = async (value: number) => {
    const clamped = Math.max(0.001, Number.isFinite(value) ? value : 0.01);
    setCpcUsd(clamped);
    setCpcBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "ads",
          settings: { "ads.cpcUsd": clamped },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Cost per click set to $${clamped}`);
    } catch {
      toast.error("Couldn't save cost per click");
    } finally {
      setCpcBusy(false);
    }
  };

  const totalImpr = ads.reduce((s, a) => s + a.impressions, 0);
  const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);
  const ctr = totalImpr > 0 ? ((totalClicks / totalImpr) * 100).toFixed(2) : "0.00";
  // Badge hint only — the queue itself counts server-side (this list is capped).
  const pendingCount = ads.filter((a) => a.status?.toUpperCase() === "PENDING").length;

  const deletePlacement = async (id: string) => {
    if (!(await confirmDialog({ title: "Delete this placement?", tone: "danger", confirmLabel: "Delete" }))) return;
    const res = await fetch(`/api/admin/ads/placements/${id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(d.error ?? "Failed");
    toast.success("Deleted");
    loadAll();
  };
  const togglePlacement = async (p: Placement) => {
    await fetch(`/api/admin/ads/placements/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    loadAll();
  };
  // Per-space rotation override. `secs === null` clears it (→ global default).
  const setPlacementRotation = async (p: Placement, secs: number | null) => {
    await fetch(`/api/admin/ads/placements/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotationSeconds: secs }),
    });
    loadAll();
  };
  // Per-space interstitial ad duration. `secs === null` clears it (→ default 5s).
  const setPlacementInterstitial = async (p: Placement, secs: number | null) => {
    await fetch(`/api/admin/ads/placements/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interstitialSeconds: secs }),
    });
    loadAll();
  };
  const addPlacement = async () => {
    if (!newPlacement.trim()) return;
    const res = await fetch("/api/admin/ads/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPlacement }),
    });
    if (!res.ok) return toast.error("Failed");
    setNewPlacement("");
    toast.success("Placement added");
    loadAll();
  };
  const deleteAd = async (id: string) => {
    if (!(await confirmDialog({ title: "Delete this ad?", tone: "danger", confirmLabel: "Delete" }))) return;
    await fetch(`/api/admin/ads/${id}`, { method: "DELETE" });
    toast.success("Deleted");
    loadAll();
  };
  // Approve/reject now live in the review panel (AdReviewQueue), which shows the
  // destination URL, creative and advertiser history a decision actually needs.
  // Pause/resume of an ALREADY-approved ad stays here — it isn't a review action.
  const setAdStatus = async (ad: Ad, status: string) => {
    const res = await fetch(`/api/admin/ads/${ad.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(d.error ?? "Couldn't update the ad");
    toast.success(status === "ACTIVE" ? "Ad resumed" : "Ad paused");
    loadAll();
  };
  const deleteCampaign = async (id: string) => {
    if (!(await confirmDialog({ title: "Delete campaign and all its ads?", tone: "danger", confirmLabel: "Delete" }))) return;
    await fetch(`/api/admin/ads/campaigns/${id}`, { method: "DELETE" });
    toast.success("Deleted");
    loadAll();
  };
  const generateDemoAds = async () => {
    setDemoBusy(true);
    try {
      const res = await fetch("/api/admin/ads/demo", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      toast.success(
        d.created > 0
          ? `Created ${d.created} demo ad(s) across ${d.total} ad spaces`
          : "Demo ads already exist for every ad space"
      );
      loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setDemoBusy(false);
    }
  };
  const removeDemoAds = async () => {
    if (!(await confirmDialog({ title: "Remove all demo ads?", tone: "danger", confirmLabel: "Remove" }))) return;
    setDemoBusy(true);
    try {
      const res = await fetch("/api/admin/ads/demo", { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      toast.success("Demo ads removed");
      loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <Newspaper className="w-6 h-6 text-amber-400" />
            Ads Manager
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage ads, campaigns, and placement slots across the platform.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={generateDemoAds}
              disabled={demoBusy}
              title="Create one labeled demo ad in every ad space so you can see where each renders"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              Generate demo ads
            </button>
            <button
              onClick={removeDemoAds}
              disabled={demoBusy}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-400 text-sm font-semibold disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Remove demo
            </button>
            {tab === "ads" && (
              <button
                onClick={() => setAdWizard(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" /> New Ad
              </button>
            )}
            {tab === "campaigns" && (
              <button
                onClick={() => setCampModal("new")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" /> New Campaign
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Eye className="w-5 h-5" />} value={totalImpr.toLocaleString()} label="Impressions" tone="purple" />
        <StatCard icon={<MousePointer className="w-5 h-5" />} value={totalClicks.toLocaleString()} label="Clicks" tone="amber" />
        <StatCard icon={<BarChart3 className="w-5 h-5" />} value={`${ctr}%`} label="CTR" tone="emerald" />
        <StatCard icon={<Newspaper className="w-5 h-5" />} value={String(ads.length)} label="Ads" tone="blue" />
      </div>

      <div className="flex gap-1 border-b border-slate-800 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap ${
              tab === t.id
                ? "border-blue-500 text-white"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.id === "approvals" && pendingCount > 0 && (
              <span className="ml-0.5 min-w-4.5 px-1 h-4.5 grid place-items-center rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </div>
      ) : (
        <>
          {tab === "ads" && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Only ACTIVE ads in a funded, in-schedule campaign serve. Targeted ads show only to matching users — check the audience size. Use &quot;Remove demo&quot; to see only your own ads.</p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={adFilter.q}
                  onChange={(e) => setAdFilter((f) => ({ ...f, q: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && loadAll()}
                  placeholder="Search headline, brand, destination, campaign"
                  className="flex-1 min-w-52 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <select
                  value={adFilter.status}
                  onChange={(e) => setAdFilter((f) => ({ ...f, status: e.target.value }))}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                >
                  <option value="">Any status</option>
                  {["ACTIVE", "PAUSED", "PENDING", "CHANGES_REQUESTED", "REJECTED", "INACTIVE"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value={adFilter.placement}
                  onChange={(e) => setAdFilter((f) => ({ ...f, placement: e.target.value }))}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                >
                  <option value="">All ad spaces</option>
                  {AD_PLACEMENTS.map((p) => (
                    <option key={p.name} value={p.name}>{p.label}</option>
                  ))}
                </select>
                <button
                  onClick={loadAll}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold"
                >
                  Apply
                </button>
              </div>
              {ads.length === 0 && <Empty text="No ads match." />}
              {ads.map((ad) => {
                const thumb = ad.contentUrl || ad.brandLogo;
                const title = ad.brandName || ad.headline || ad.campaign.title;
                const tgt = targetingSummary(ad.targeting);
                const isFeed = ad.format === "NATIVE";
                return (
                  <div key={ad.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3 hover:border-slate-700 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      {thumb ? (
                        <SmartImage src={thumb} alt="" width={56} height={56} className="w-14 h-14 rounded-lg object-cover bg-slate-950 shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-slate-950 grid place-items-center text-slate-600 shrink-0">
                          {isFeed ? <Rss className="w-5 h-5" /> : <Newspaper className="w-5 h-5" />}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{title}</p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider", isFeed ? "bg-indigo-500/15 text-indigo-300" : "bg-slate-800 text-slate-400")}>
                            {isFeed ? "Feed" : "Banner"}
                          </span>
                          <StatusPill status={ad.status} />
                          <ServingPill ad={ad} cpc={cpcUsd} />
                          <span className="text-[10px] text-slate-500">{PLACEMENT_LABEL[ad.placement.name] ?? ad.placement.name}</span>
                          {ad.rewardPoints > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400">+{ad.rewardPoints}pts</span>
                          )}
                          {tgt && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-800 text-slate-300">🎯 {tgt}</span>
                          )}
                        </div>
                        {/* Where the ad actually sends people — previously
                            invisible anywhere in the admin. */}
                        {ad.targetUrl && (
                          <p className="text-[11px] text-sky-300/90 mt-0.5 truncate">{hostOf(ad.targetUrl)}</p>
                        )}
                        <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                          {ad.impressions.toLocaleString()} impr · {ad.clicks.toLocaleString()} billed clicks · w{ad.weight}
                        </p>
                        {ad.rejectionReason && (
                          <p className="text-[11px] text-red-300/80 mt-0.5 line-clamp-2">{ad.rejectionReason}</p>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex gap-1">
                        {(ad.status === "ACTIVE" || ad.status === "PAUSED") && (
                          <IconBtn
                            onClick={() => setAdStatus(ad, ad.status === "ACTIVE" ? "PAUSED" : "ACTIVE")}
                            title={ad.status === "ACTIVE" ? "Pause" : "Resume"}
                          >
                            {ad.status === "ACTIVE" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </IconBtn>
                        )}
                        <IconBtn onClick={() => setReviewAdId(ad.id)} title="Review"><ShieldCheck className="w-4 h-4" /></IconBtn>
                        <IconBtn onClick={() => setAdModal(ad)} title="Edit"><Pencil className="w-4 h-4" /></IconBtn>
                        <IconBtn onClick={() => deleteAd(ad.id)} title="Delete" danger><Trash2 className="w-4 h-4" /></IconBtn>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === "approvals" && (
            <AdReviewQueue canManage={canManage} onChanged={loadAll} />
          )}

          {tab === "campaigns" && (
            <div className="space-y-2">
              <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-sm text-blue-100/90">
                <b className="text-white">What is a campaign?</b> A campaign is a <b>budget pool</b>. Its ads
                spend from the budget on each click; when the budget runs out the campaign auto-pauses. Pause a
                campaign to pause all of its ads at once. Create a campaign first, then add ads to it.
              </div>
              {campaigns.length === 0 && <Empty text="No campaigns yet." />}
              {campaigns.map((c) => (
                <div key={c.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5 hover:border-slate-700 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{c.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <StatusPill status={c.status} />
                        <span className="text-[11px] text-slate-500">{c._count?.ads ?? 0} ads</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-white tabular-nums">{usd(c.budget)}</span>
                      {canManage && (
                        <div className="flex gap-1">
                          <IconBtn onClick={() => setCampModal(c)} title="Edit"><Pencil className="w-4 h-4" /></IconBtn>
                          <IconBtn onClick={() => deleteCampaign(c.id)} title="Delete" danger><Trash2 className="w-4 h-4" /></IconBtn>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "placements" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-sm text-blue-100/90">
                <b className="text-white">What is an ad space?</b> Each space is a fixed slot on a page
                (see “Appears on” under each). Assign an ad to a space via the ad&apos;s <b>Placement</b>.
                Put several active ads in one space and they <b>rotate automatically</b> — on reload and
                every {rotationSeconds}s by default. Each space can set its own rotation time below.
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-400">
                  Toggle a space off to stop showing ads there. Stats are aggregated from all ads in each space.
                </p>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400 whitespace-nowrap" title="Applies to spaces that don't set their own interval">Default rotate every</label>
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={rotationSeconds}
                      disabled={!canManage || rotationBusy}
                      onChange={(e) => setRotationSeconds(Number(e.target.value))}
                      onBlur={(e) => saveRotationSeconds(Number(e.target.value))}
                      className="w-16 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm text-center disabled:opacity-50"
                    />
                    <span className="text-xs text-slate-400">seconds</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400 whitespace-nowrap">Cost per click ($)</label>
                    <input
                      type="number"
                      step={0.01}
                      min={0.001}
                      value={cpcUsd}
                      disabled={!canManage || cpcBusy}
                      onChange={(e) => setCpcUsd(Number(e.target.value))}
                      onBlur={(e) => saveCpc(Number(e.target.value))}
                      className="w-20 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm text-center disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              {/* Global ad-network (publisher) config */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Ad networks (publisher)</p>
                <p className="text-[11px] text-slate-500 -mt-1">Set once — per-ad you only enter the slot / ad-unit. Network ads are third-party (ad-blockable) and report in the network&apos;s own console.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">AdSense client (ca-pub-…)</label>
                    <input
                      value={adsenseClient}
                      onChange={(e) => setAdsenseClient(e.target.value)}
                      disabled={!canManage}
                      placeholder="ca-pub-1234567890123456"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder:text-slate-600 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Ad Manager network code</label>
                    <input
                      value={gamNetworkCode}
                      onChange={(e) => setGamNetworkCode(e.target.value)}
                      disabled={!canManage}
                      placeholder="22106938064"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder:text-slate-600 disabled:opacity-50"
                    />
                  </div>
                </div>
                {canManage && (
                  <button
                    onClick={saveNetworkGlobals}
                    disabled={networkBusy}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {networkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save networks
                  </button>
                )}
              </div>

              {/* Feed ad density */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Feed ad density</p>
                <p className="text-[11px] text-slate-500 -mt-1">Each space with 2+ active ads auto-rotates every N seconds and on reload.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Native ad — every N posts</label>
                    <input type="number" min={1} max={20} value={feedAdInterval} disabled={!canManage} onChange={(e) => setFeedAdInterval(Math.max(1, Number(e.target.value) || 2))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Promoted post — every N entries</label>
                    <input type="number" min={1} max={20} value={feedPromoInterval} disabled={!canManage} onChange={(e) => setFeedPromoInterval(Math.max(1, Number(e.target.value) || 4))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-50" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input type="checkbox" checked={underPostBanner} disabled={!canManage} onChange={(e) => setUnderPostBanner(e.target.checked)} />
                  Show a compact banner under <b className="mx-1">every</b> post, above its like/comment/share row (placement <span className="font-mono text-xs text-slate-400">FEED_POST_BELOW</span>)
                </label>
                <div className="max-w-xs">
                  <label className="block text-xs text-slate-400 mb-1">Boosted post — max times shown per user (0 = unlimited)</label>
                  <input type="number" min={0} max={1000} value={boostMaxPerUser} disabled={!canManage} onChange={(e) => setBoostMaxPerUser(Math.max(0, Number(e.target.value) || 0))} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-50" />
                </div>
                {canManage && (
                  <button onClick={saveDensity} disabled={densityBusy} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                    {densityBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save density
                  </button>
                )}
              </div>

              {/* Grant ad credit */}
              {canManage && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Grant ad credit</p>
                  <p className="text-[11px] text-slate-500 -mt-1">Give an advertiser Ad Credit (USD, non-withdrawable). Negative amount deducts.</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-48">
                      <label className="block text-xs text-slate-400 mb-1">Advertiser email</label>
                      <input value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="advertiser@email.com" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder:text-slate-600" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Amount ($)</label>
                      <input type="number" step={5} value={grantAmount} onChange={(e) => setGrantAmount(Number(e.target.value))} className="w-28 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm" />
                    </div>
                    <button onClick={grantAdCredit} disabled={grantBusy} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                      {grantBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Grant
                    </button>
                  </div>
                </div>
              )}

              {canManage && (
                <div className="flex gap-2 max-w-md">
                  <input
                    value={newPlacement}
                    onChange={(e) => setNewPlacement(e.target.value)}
                    placeholder="ADD CUSTOM SPACE (e.g. HOME_HERO)"
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder:text-slate-600"
                  />
                  <button onClick={addPlacement} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {placements.map((p) => (
                  <AdSpaceCard
                    key={p.id}
                    placement={p}
                    canManage={canManage}
                    rotationSeconds={rotationSeconds}
                    onToggle={() => togglePlacement(p)}
                    onSetRotation={(secs) => setPlacementRotation(p, secs)}
                    onSetInterstitial={(secs) => setPlacementInterstitial(p, secs)}
                    onDelete={() => deletePlacement(p.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {tab === "analytics" && <AnalyticsTab />}
        </>
      )}

      {reviewAdId && (
        <AdReviewPanel
          adId={reviewAdId}
          canManage={canManage}
          onClose={() => setReviewAdId(null)}
          onDecided={loadAll}
        />
      )}
      {adWizard && (
        <AdWizard
          campaigns={campaigns}
          placements={placements}
          onClose={() => setAdWizard(false)}
          onSaved={() => {
            setAdWizard(false);
            loadAll();
          }}
        />
      )}
      {adModal && (
        <AdModal
          ad={adModal === "new" ? null : adModal}
          campaigns={campaigns}
          placements={placements}
          onClose={() => setAdModal(null)}
          onSaved={() => {
            setAdModal(null);
            loadAll();
          }}
        />
      )}
      {campModal && (
        <CampaignModal
          campaign={campModal === "new" ? null : campModal}
          onClose={() => setCampModal(null)}
          onSaved={() => {
            setCampModal(null);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

const STAT_TONES: Record<string, string> = {
  indigo: "bg-indigo-500/15 text-indigo-400",
  purple: "bg-purple-500/15 text-purple-400",
  amber: "bg-amber-500/15 text-amber-400",
  emerald: "bg-emerald-500/15 text-emerald-400",
  blue: "bg-blue-500/15 text-blue-400",
};
function StatCard({
  icon,
  value,
  label,
  tone = "blue",
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  tone?: keyof typeof STAT_TONES;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 flex items-center gap-3 hover:border-slate-700 transition-colors">
      <div className={cn("w-10 h-10 rounded-xl grid place-items-center shrink-0", STAT_TONES[tone])}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-white tabular-nums leading-tight">{value}</p>
        <p className="text-[11px] text-slate-500 truncate">{label}</p>
      </div>
    </div>
  );
}
/** Hostname of an ad's destination — the reviewer-relevant part of the URL. */
function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-slate-500 py-8 text-center">{text}</p>;
}


type ServingTone = "amber" | "red" | "slate" | "sky" | "emerald";

const SERVING_TONE_CLS: Record<ServingTone, string> = {
  amber: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
  slate: "bg-slate-800 text-slate-400",
  sky: "bg-sky-500/15 text-sky-400",
  emerald: "bg-emerald-500/15 text-emerald-400",
};

/**
 * Whether (and why) an ad is actually serving to users — folds the ad's own
 * status together with its campaign's status/budget/schedule so admins can see
 * at a glance why an "ACTIVE" ad might not be showing.
 */
function servingState(ad: Ad, cpc: number): { label: string; tone: ServingTone } {
  const s = ad.status?.toUpperCase();
  if (s === "PENDING") return { label: "Pending review", tone: "amber" };
  if (s === "REJECTED") return { label: "Rejected", tone: "red" };
  if (s === "PAUSED") return { label: "Paused", tone: "slate" };
  if (s === "INACTIVE") return { label: "Inactive", tone: "slate" };
  if (ad.campaign?.status !== "ACTIVE") return { label: "Campaign paused", tone: "amber" };
  if ((ad.campaign?.budget ?? 0) < cpc) return { label: "Out of budget", tone: "amber" };
  if (ad.campaign?.startAt && new Date(ad.campaign.startAt) > new Date())
    return { label: "Scheduled", tone: "sky" };
  if (ad.campaign?.endAt && new Date(ad.campaign.endAt) < new Date())
    return { label: "Ended", tone: "slate" };
  const targeted =
    !!ad.targeting && typeof ad.targeting === "object" && Object.keys(ad.targeting).length > 0;
  return { label: targeted ? "Live · targeted" : "Live", tone: "emerald" };
}

function ServingPill({ ad, cpc }: { ad: Ad; cpc: number }) {
  const { label, tone } = servingState(ad, cpc);
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider", SERVING_TONE_CLS[tone])}>
      {label}
    </span>
  );
}

function AdSpaceCard({
  placement: p,
  canManage,
  rotationSeconds,
  onToggle,
  onSetRotation,
  onSetInterstitial,
  onDelete,
}: {
  placement: Placement;
  canManage: boolean;
  rotationSeconds: number;
  onToggle: () => void;
  onSetRotation: (secs: number | null) => void;
  onSetInterstitial: (secs: number | null) => void;
  onDelete: () => void;
}) {
  // Effective interval for this space: its own override, else the global default.
  const effectiveRotation = p.rotationSeconds ?? rotationSeconds;
  // Interstitial spaces show a full-screen ad for a fixed duration instead of
  // rotating a banner — expose the duration control for those instead.
  const isInterstitial = p.name.endsWith("_INTERSTITIAL");
  const Icon = PLACEMENT_ICON[p.name] ?? Layers;
  const isFeed = p.name === "IN_FEED";
  const stats = p.stats ?? { impressions: 0, clicks: 0, activeAds: 0, totalAds: 0 };
  const ctr = stats.impressions > 0 ? ((stats.clicks / stats.impressions) * 100).toFixed(2) : "0.00";
  const isCustom = !CANONICAL_NAMES.has(p.name);
  const where = PLACEMENT_WHERE[p.name];

  return (
    <div
      className={cn(
        "rounded-2xl border bg-slate-900 p-4 flex flex-col gap-3 transition-colors",
        p.isActive ? "border-slate-800 hover:border-slate-700" : "border-slate-800/60 opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl grid place-items-center shrink-0",
            isFeed ? "bg-indigo-500/15 text-indigo-400" : "bg-slate-800 text-slate-300"
          )}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-bold text-white">{PLACEMENT_LABEL[p.name] ?? p.name}</p>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                isFeed ? "bg-indigo-500/15 text-indigo-300" : "bg-slate-800 text-slate-400"
              )}
            >
              {isFeed ? "Native feed" : "Banner"}
            </span>
            {isCustom && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400">
                Custom
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
            {PLACEMENT_DESC[p.name] ?? p.name}
          </p>
          {where ? (
            <p className="text-[11px] text-slate-400 mt-1">
              <span className="text-slate-500">Appears on:</span> {where}
            </p>
          ) : (
            isCustom && (
              <p className="text-[11px] text-amber-400/80 mt-1">
                Custom space — only renders where you mount &lt;AdRenderer placement=&quot;{p.name}&quot;&gt; in code.
              </p>
            )
          )}
          {stats.activeAds > 1 && (
            <p className="text-[10px] text-emerald-400/80 mt-1">
              {stats.activeAds} active ads · rotate every {effectiveRotation}s &amp; on reload
            </p>
          )}
        </div>
      </div>

      {/* Live preview + size */}
      <SpacePreview placement={p.name} isFeed={isFeed} />
      <p className="text-[10px] text-slate-500 -mt-1">
        Recommended size: <span className="text-slate-300 font-mono">{spaceSizeLabel(p.name)}</span>
      </p>

      {/* Live stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-sm font-bold text-white tabular-nums">{stats.impressions.toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Impr</p>
        </div>
        <div>
          <p className="text-sm font-bold text-white tabular-nums">{stats.clicks.toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Clicks</p>
        </div>
        <div>
          <p className="text-sm font-bold text-white tabular-nums">{ctr}%</p>
          <p className="text-[9px] uppercase tracking-wider text-slate-500">CTR</p>
        </div>
      </div>

      {canManage && isInterstitial && (
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <label className="whitespace-nowrap">Ad shows for</label>
          <input
            type="number"
            min={3}
            max={60}
            defaultValue={p.interstitialSeconds ?? ""}
            placeholder="5"
            onBlur={(e) => {
              const v = e.target.value.trim();
              const next =
                v === "" ? null : Math.min(60, Math.max(3, Math.round(Number(v) || 5)));
              if ((p.interstitialSeconds ?? null) !== next) onSetInterstitial(next);
            }}
            className="w-14 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-center"
          />
          <span className="whitespace-nowrap">
            sec{p.interstitialSeconds == null && " · default 5"}
          </span>
        </div>
      )}
      {canManage && !isInterstitial && (
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <label className="whitespace-nowrap">Rotate every</label>
          <input
            type="number"
            min={5}
            max={60}
            defaultValue={p.rotationSeconds ?? ""}
            placeholder={String(rotationSeconds)}
            onBlur={(e) => {
              const v = e.target.value.trim();
              const next =
                v === ""
                  ? null
                  : Math.min(60, Math.max(5, Math.round(Number(v) || rotationSeconds)));
              if ((p.rotationSeconds ?? null) !== next) onSetRotation(next);
            }}
            className="w-14 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-center"
          />
          <span className="whitespace-nowrap">
            sec{p.rotationSeconds == null && ` · default ${rotationSeconds}`}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
        <span className="text-[11px] text-slate-400">
          <span className="text-emerald-400 font-bold">{stats.activeAds}</span> active ·{" "}
          {stats.totalAds} total ads
        </span>
        {canManage && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggle}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-semibold",
                p.isActive
                  ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              )}
            >
              {p.isActive ? "Active" : "Off"}
            </button>
            {isCustom && (
              <button
                onClick={onDelete}
                title="Delete custom space"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface DayStat { date: string; impressions: number; clicks: number; spendUsd: number }
interface ReportRow { impressions: number; clicks: number; spend: number; ctr: number }
interface AdRow extends ReportRow { type: string; campaign: string; placement: string }
interface PlacementRow extends ReportRow { name: string }
interface CampaignRow extends ReportRow { title: string }
const RANGES = [7, 14, 30, 90];
const isNetworkType = (t: string) => t === "ADSENSE" || t === "GAM";

function AnalyticsTab() {
  const [days, setDays] = useState(14);
  const [series, setSeries] = useState<DayStat[]>([]);
  const [totals, setTotals] = useState({ impressions: 0, clicks: 0, ctr: 0 });
  const [perAd, setPerAd] = useState<AdRow[]>([]);
  const [perPlacement, setPerPlacement] = useState<PlacementRow[]>([]);
  const [perCampaign, setPerCampaign] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/admin/ads/analytics?days=${days}`).then((r) => r.json()),
      fetch(`/api/admin/ads/report?days=${days}`).then((r) => r.json()),
    ])
      .then(([a, rep]) => {
        if (!active) return;
        setSeries(a.series ?? []);
        setTotals(a.totals ?? { impressions: 0, clicks: 0, ctr: 0 });
        setPerAd(rep.perAd ?? []);
        setPerPlacement(rep.perPlacement ?? []);
        setPerCampaign(rep.perCampaign ?? []);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [days]);

  const maxImp = Math.max(1, ...series.map((s) => s.impressions));
  const spend = series.reduce((s, d) => s + d.spendUsd, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-white">Performance</p>
        <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => {
                setLoading(true);
                setDays(d);
              }}
              className={`px-3 py-1.5 text-xs font-semibold ${days === d ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Eye className="w-5 h-5" />} value={totals.impressions.toLocaleString()} label="Impressions (all time)" tone="purple" />
        <StatCard icon={<MousePointer className="w-5 h-5" />} value={totals.clicks.toLocaleString()} label="Clicks (all time)" tone="amber" />
        <StatCard icon={<BarChart3 className="w-5 h-5" />} value={`${totals.ctr.toFixed(2)}%`} label="CTR" tone="emerald" />
        <StatCard icon={<BarChart3 className="w-5 h-5" />} value={`${usd(spend)}`} label={`Spend (${days}d)`} tone="indigo" />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3">Impressions · last {days} days</p>
        {loading ? (
          <p className="text-xs text-slate-500 py-6 text-center">Loading…</p>
        ) : series.every((s) => s.impressions === 0) ? (
          <p className="text-xs text-slate-500 py-6 text-center">No impressions in this window yet.</p>
        ) : (
          <div className="flex items-end gap-1 h-28">
            {series.map((s) => (
              <div key={s.date} className="flex-1" title={`${s.date}: ${s.impressions} impr, ${s.clicks} clicks, ${usd(s.spendUsd)}`}>
                <div className="w-full rounded-t bg-linear-to-t from-blue-600 to-indigo-500" style={{ height: `${(s.impressions / maxImp) * 100}%` }} />
              </div>
            ))}
          </div>
        )}
      </div>

      <ReportTable title="Top ads" cols={["Ad", "Impr", "Clicks", "CTR", "Spend"]}>
        {perAd.map((r, i) => {
          const net = isNetworkType(r.type);
          return (
            <tr key={i} className="border-t border-slate-800">
              <td className="py-1.5 pr-2 text-white truncate max-w-52">
                {r.campaign} <span className="text-[10px] text-slate-500">· {r.placement}{net ? ` · ${r.type}` : ""}</span>
              </td>
              <td className="py-1.5 text-right tabular-nums text-slate-300">{r.impressions.toLocaleString()}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-300">{net ? "—" : r.clicks.toLocaleString()}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-300">{net ? "—" : `${r.ctr.toFixed(2)}%`}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-300">{net ? "network" : `${usd(r.spend)}`}</td>
            </tr>
          );
        })}
      </ReportTable>

      <div className="grid gap-3 lg:grid-cols-2">
        <ReportTable title="By placement" cols={["Placement", "Impr", "Clicks", "CTR"]}>
          {perPlacement.map((r, i) => (
            <tr key={i} className="border-t border-slate-800">
              <td className="py-1.5 pr-2 text-white truncate max-w-40">{PLACEMENT_LABEL[r.name] ?? r.name}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-300">{r.impressions.toLocaleString()}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-300">{r.clicks.toLocaleString()}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-300">{r.ctr.toFixed(2)}%</td>
            </tr>
          ))}
        </ReportTable>
        <ReportTable title="By campaign" cols={["Campaign", "Impr", "Clicks", "Spend"]}>
          {perCampaign.map((r, i) => (
            <tr key={i} className="border-t border-slate-800">
              <td className="py-1.5 pr-2 text-white truncate max-w-40">{r.title}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-300">{r.impressions.toLocaleString()}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-300">{r.clicks.toLocaleString()}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-300">{usd(r.spend)}</td>
            </tr>
          ))}
        </ReportTable>
      </div>
      <p className="text-[10px] text-slate-500">
        Network (AdSense / Ad Manager) ads show served impressions only — their clicks &amp; revenue are in the network&apos;s own console.
      </p>
    </div>
  );
}

function ReportTable({ title, cols, children }: { title: string; cols: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">{title}</p>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left pb-1.5">{cols[0]}</th>
              {cols.slice(1).map((c) => (
                <th key={c} className="text-right pb-1.5">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}
function spaceSizeLabel(name: string): string {
  const s = AD_SIZES.find((x) => x.key === placementSizeKey(name));
  if (!s || s.w == null || s.h == null) return "Responsive (full width)";
  return `${s.w}×${s.h}`;
}

interface PreviewAd { html?: string; videoUrl?: string; imageUrl?: string; title?: string }

/** Live, side-effect-free preview of a real served creative for a placement. */
function SpacePreview({ placement, isFeed }: { placement: string; isFeed: boolean }) {
  const [ad, setAd] = useState<PreviewAd | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/admin/ads/preview?placement=${encodeURIComponent(placement)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setAd(d?.ad ?? null))
      .catch(() => {})
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [placement]);

  const dim = resolveAdSize(placementSizeKey(placement));
  const ratio = dim ? `${dim.w} / ${dim.h}` : undefined;

  if (!loaded) {
    return <div className="rounded-lg bg-slate-950 border border-slate-800 animate-pulse" style={{ aspectRatio: ratio, minHeight: 56 }} />;
  }
  if (!ad) {
    return (
      <div
        className="rounded-lg bg-slate-950 border border-dashed border-slate-800 grid place-items-center text-[10px] text-slate-600 p-3 text-center"
        style={{ aspectRatio: ratio, minHeight: 56 }}
      >
        No active ad — {isFeed ? "native" : "banner"} space
      </div>
    );
  }
  return (
    <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950 mx-auto w-full" style={{ aspectRatio: ratio, maxWidth: dim?.w }}>
      {ad.html ? (
        <SandboxedAdFrame html={ad.html} height={dim?.h ?? 120} badge={false} />
      ) : ad.videoUrl ? (
        <video src={ad.videoUrl} muted autoPlay loop playsInline className="w-full h-full object-cover" />
      ) : ad.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ad.imageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="p-3 text-xs text-slate-300 truncate">{ad.title ?? "Ad"}</div>
      )}
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title} className={`p-2 rounded-lg bg-slate-800 hover:bg-slate-700 ${danger ? "text-red-400" : "text-slate-300"}`}>
      {children}
    </button>
  );
}

const inputCls = "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500";

function AdModal({
  ad,
  campaigns,
  placements,
  onClose,
  onSaved,
}: {
  ad: Ad | null;
  campaigns: Campaign[];
  placements: Placement[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [campaignId, setCampaignId] = useState(ad?.campaign.id ?? campaigns[0]?.id ?? "");
  const [placementId, setPlacementId] = useState(ad?.placement.id ?? placements[0]?.id ?? "");
  const [contentUrl, setContentUrl] = useState(ad?.contentUrl ?? "");
  const [videoUrl, setVideoUrl] = useState(ad?.videoUrl ?? "");
  const [targetUrl, setTargetUrl] = useState(ad?.targetUrl ?? "");
  const [htmlContent, setHtmlContent] = useState(ad?.htmlContent ?? "");
  // Creative kind: IMAGE (incl. GIF) | VIDEO | HTML | NETWORK. Drives the DB `type`.
  const [creative, setCreative] = useState<"IMAGE" | "VIDEO" | "HTML" | "NETWORK">(
    ad?.type === "ADSENSE" || ad?.type === "GAM"
      ? "NETWORK"
      : ad?.type === "HTML"
      ? "HTML"
      : ad?.videoUrl
      ? "VIDEO"
      : "IMAGE"
  );
  // Ad-network config (creative NETWORK): provider + AdSense slot / GAM ad-unit.
  const [provider, setProvider] = useState<"adsense" | "gam" | "custom">(
    ad?.type === "ADSENSE" ? "adsense" : ad?.type === "GAM" ? "gam" : "custom"
  );
  const [adSlot, setAdSlot] = useState(ad?.adSlot ?? "");
  const [adUnitPath, setAdUnitPath] = useState(ad?.adUnitPath ?? "");
  const [adClient, setAdClient] = useState(ad?.adClient ?? "");
  // Optional third-party tracking pixels (any type).
  const [impressionPixel, setImpressionPixel] = useState(ad?.impressionPixel ?? "");
  const [clickTracker, setClickTracker] = useState(ad?.clickTracker ?? "");
  const [size, setSize] = useState(
    ad?.size ??
      placementSizeKey(
        placements.find((pl) => pl.id === (ad?.placement.id ?? placements[0]?.id))?.name ?? ""
      )
  );
  const [width, setWidth] = useState(String(ad?.width ?? ""));
  const [height, setHeight] = useState(String(ad?.height ?? ""));
  const [weight, setWeight] = useState(String(ad?.weight ?? 10));
  // Display-only: the review state machine owns Ad.status (see ad-review.ts).
  const status = ad?.status ?? "ACTIVE";
  const isReviewState = ["PENDING", "REJECTED", "CHANGES_REQUESTED"].includes(status);
  const [rewardPoints, setRewardPoints] = useState(String(ad?.rewardPoints ?? 0));
  const [watchSeconds, setWatchSeconds] = useState(String(ad?.watchSeconds ?? 15));
  // Native (post-like feed ad) fields
  const [format, setFormat] = useState(ad?.format ?? "BANNER");
  const [headline, setHeadline] = useState(ad?.headline ?? "");
  const [brandName, setBrandName] = useState(ad?.brandName ?? "");
  const [brandLogo, setBrandLogo] = useState(ad?.brandLogo ?? "");
  const [ctaLabel, setCtaLabel] = useState(ad?.ctaLabel ?? "");
  // Targeting (audience filters) — single AdTargeting object owned by AudienceBuilder
  const [targeting, setTargeting] = useState<AdTargeting>(ad?.targeting ?? {});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!campaignId || !placementId) {
      toast.error("Pick a campaign and placement");
      return;
    }
    setBusy(true);
    try {
      const type =
        creative === "NETWORK"
          ? provider === "adsense"
            ? "ADSENSE"
            : provider === "gam"
            ? "GAM"
            : "HTML"
          : creative === "HTML"
          ? "HTML"
          : "LOCAL";
      const payload = {
        campaignId,
        placementId,
        type,
        format,
        contentUrl: creative === "IMAGE" ? contentUrl : "",
        videoUrl: creative === "VIDEO" ? videoUrl : "",
        targetUrl,
        htmlContent:
          creative === "HTML" || (creative === "NETWORK" && provider === "custom")
            ? htmlContent
            : "",
        adSlot: type === "ADSENSE" ? adSlot : "",
        adUnitPath: type === "GAM" ? adUnitPath : "",
        adClient: type === "ADSENSE" ? adClient : "",
        impressionPixel,
        clickTracker,
        size,
        width: size === "custom" ? Number(width) || null : null,
        height: size === "custom" ? Number(height) || null : null,
        weight: Number(weight) || 10,
        // No `status` — an edit must never change review state. New admin ads are
        // auto-approved server-side (the admin IS the reviewer).
        rewardPoints: Number(rewardPoints) || 0,
        watchSeconds: Number(watchSeconds) || 15,
        headline,
        brandName,
        brandLogo,
        ctaLabel,
        targeting,
      };
      const res = await fetch(ad ? `/api/admin/ads/${ad.id}` : "/api/admin/ads", {
        method: ad ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success(ad ? "Ad updated" : "Ad created");
      onSaved();
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={ad ? "Edit Ad" : "New Ad"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Campaign</label>
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={inputCls}>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Placement</label>
            <select value={placementId} onChange={(e) => setPlacementId(e.target.value)} className={inputCls}>
              {placements.map((p) => <option key={p.id} value={p.id}>{PLACEMENT_LABEL[p.name] ?? p.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Creative</label>
          <div className="flex gap-2">
            {(["IMAGE", "VIDEO", "HTML", "NETWORK"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCreative(c)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold ${creative === c ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"}`}
              >
                {c === "IMAGE" ? "Image / GIF" : c === "VIDEO" ? "Video" : c === "HTML" ? "HTML / Script" : "Ad Network"}
              </button>
            ))}
          </div>
        </div>

        {creative === "NETWORK" ? (
          <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ad network</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)} className={inputCls}>
                <option value="adsense">Google AdSense</option>
                <option value="gam">Google Ad Manager (GPT)</option>
                <option value="custom">Other network (paste script)</option>
              </select>
            </div>
            {provider === "adsense" ? (
              <>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Ad slot id (data-ad-slot)</label>
                  <input value={adSlot} onChange={(e) => setAdSlot(e.target.value)} className={inputCls} placeholder="1234567890" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Client override (optional)</label>
                  <input value={adClient} onChange={(e) => setAdClient(e.target.value)} className={inputCls} placeholder="ca-pub-… (defaults to global)" />
                </div>
              </>
            ) : provider === "gam" ? (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Ad-unit path</label>
                <input value={adUnitPath} onChange={(e) => setAdUnitPath(e.target.value)} className={inputCls} placeholder="/22106938064/my_banner or my_banner" />
                <p className="text-[10px] text-slate-500 mt-1">Bare name uses the global network code. Set size below (default 300×250).</p>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Network snippet (HTML / script)</label>
                <textarea value={htmlContent} onChange={(e) => setHtmlContent(e.target.value)} rows={4} className={inputCls} placeholder="<script>…</script> from any ad network" />
              </div>
            )}
          </div>
        ) : creative === "HTML" ? (
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              HTML content (scripts / ad-network tags run in a sandboxed frame)
            </label>
            <textarea value={htmlContent} onChange={(e) => setHtmlContent(e.target.value)} rows={4} className={inputCls} placeholder="<div>...</div> or <script>…</script>" />
          </div>
        ) : creative === "VIDEO" ? (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ad video (MP4 / WebM)</label>
            <ImageUploadField value={videoUrl} onChange={setVideoUrl} previewSize="md" fileType="VIDEO" />
          </div>
        ) : (
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ad image or GIF</label>
            <ImageUploadField value={contentUrl} onChange={setContentUrl} previewSize="md" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Impression pixel URL (optional)</label>
            <input value={impressionPixel} onChange={(e) => setImpressionPixel(e.target.value)} className={inputCls} placeholder="https://…/imp.gif" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Click-tracker URL (optional)</label>
            <input value={clickTracker} onChange={(e) => setClickTracker(e.target.value)} className={inputCls} placeholder="https://…/click" />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Size</label>
          <select value={size} onChange={(e) => setSize(e.target.value)} className={inputCls}>
            {AD_SIZES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          {size === "custom" && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <input type="number" min={1} value={width} onChange={(e) => setWidth(e.target.value)} placeholder="Width (px)" className={inputCls} />
              <input type="number" min={1} value={height} onChange={(e) => setHeight(e.target.value)} placeholder="Height (px)" className={inputCls} />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Target URL (click destination)</label>
          <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://..." className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Weight</label>
            <input type="number" min={1} value={weight} onChange={(e) => setWeight(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Status</label>
            {/* Read-only here on purpose. A pending ad rendered a blank select,
                and one touch flipped it to ACTIVE with no reviewer stamp, no
                notification and no audit entry — the second half of the
                self-approval bug. Status now moves only through the review
                actions (approve / reject / request changes / pause). */}
            <div className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/60 text-sm text-slate-300">
              {status}
            </div>
            {isReviewState && (
              <p className="mt-1 text-[10px] text-amber-400">
                Decide this ad from the Approvals tab.
              </p>
            )}
          </div>
        </div>

        {/* Format — Banner vs Native (post-like feed ad) */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Format</label>
          <div className="flex gap-2">
            {["BANNER", "NATIVE"].map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold ${format === f ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"}`}
              >
                {f === "BANNER" ? "Banner" : "Native (feed)"}
              </button>
            ))}
          </div>
          {format === "NATIVE" && (
            <p className="text-[11px] text-slate-500 mt-1">
              Native ads render as post-like cards in the social feed (placement IN_FEED).
            </p>
          )}
        </div>

        {format === "NATIVE" && (
          <div className="rounded-lg border border-slate-800 p-3 space-y-2.5">
            <p className="text-xs font-bold text-slate-400">Native creative</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Brand name</label>
                <input value={brandName} onChange={(e) => setBrandName(e.target.value)} className={inputCls} placeholder="e.g. NordVPN" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">CTA label</label>
                <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} className={inputCls} placeholder="Learn More" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Brand logo</label>
              <ImageUploadField value={brandLogo} onChange={setBrandLogo} previewSize="square" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Headline / ad copy</label>
              <textarea value={headline} onChange={(e) => setHeadline(e.target.value)} rows={3} className={inputCls} placeholder="What are you promoting?" />
            </div>
          </div>
        )}

        {/* Audience targeting */}
        <AudienceBuilder value={targeting} onChange={setTargeting} />

        <div className="rounded-lg border border-slate-800 p-3">
          <p className="text-xs font-bold text-slate-400 mb-2">Reward (Watch &amp; Earn — optional)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Reward points</label>
              <input type="number" min={0} value={rewardPoints} onChange={(e) => setRewardPoints(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Watch seconds</label>
              <input type="number" min={1} value={watchSeconds} onChange={(e) => setWatchSeconds(e.target.value)} className={inputCls} />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Set reward points &gt; 0 to make this ad appear on the &quot;Watch &amp; Earn&quot; page.</p>
        </div>

        <button onClick={save} disabled={busy} className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {ad ? "Save changes" : "Create ad"}
        </button>
      </div>
    </ModalShell>
  );
}

function CampaignModal({ campaign, onClose, onSaved }: { campaign: Campaign | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(campaign?.title ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [budget, setBudget] = useState(String(campaign?.budget ?? 0));
  const [status, setStatus] = useState(campaign?.status ?? "ACTIVE");
  const toDateInput = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");
  const [startAt, setStartAt] = useState(toDateInput(campaign?.startAt));
  const [endAt, setEndAt] = useState(toDateInput(campaign?.endAt));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (title.trim().length < 2) {
      toast.error("Enter a title");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(campaign ? `/api/admin/ads/campaigns/${campaign.id}` : "/api/admin/ads/campaigns", {
        method: campaign ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          budget: Number(budget) || 0,
          status,
          startAt: startAt ? new Date(startAt).toISOString() : null,
          endAt: endAt ? new Date(endAt).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success(campaign ? "Campaign updated" : "Campaign created");
      onSaved();
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={campaign ? "Edit Campaign" : "New Campaign"} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Budget ($)</label>
            <input type="number" min={1} value={budget} onChange={(e) => setBudget(e.target.value)} className={inputCls} />
            <p className="text-[11px] text-slate-500 mt-1">Budget must be ≥ the per-click cost for ads to serve.</p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="ENDED">Ended</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Start date (optional)</label>
            <DateField type="date" value={startAt} onChange={(v) => setStartAt(v)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">End date (optional)</label>
            <DateField type="date" value={endAt} onChange={(v) => setEndAt(v)} className={inputCls} />
          </div>
        </div>
        <button onClick={save} disabled={busy} className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {campaign ? "Save changes" : "Create campaign"}
        </button>
      </div>
    </ModalShell>
  );
}
