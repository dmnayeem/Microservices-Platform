"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DollarSign,
  Loader2,
  Save,
  CheckCircle2,
  Circle,
  ExternalLink,
  Megaphone,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { AD_PLACEMENTS } from "@/lib/ad-placements";

/**
 * Monetization control surface — a first-class, discoverable home for the
 * platform's revenue setup, separate from the per-ad Ad Manager. It reuses the
 * SAME settings the Ad Manager writes (SystemSetting `ads.*` + the AdPlacement
 * table) so the two stay in sync:
 *   - publisher ad-network keys (AdSense client, GAM network code)
 *   - the platform click price (CPC) used to bill advertisers
 *   - a live coverage checklist of every ad placement across the app, so an
 *     admin can see at a glance which surfaces are actually earning.
 */

interface PlacementRow {
  id: string;
  name: string;
  isActive: boolean;
  stats: { impressions: number; clicks: number; activeAds: number; totalAds: number };
}

export function MonetizationView({ canManage }: { canManage: boolean }) {
  const [loading, setLoading] = useState(true);
  const [adsenseClient, setAdsenseClient] = useState("");
  const [gamNetworkCode, setGamNetworkCode] = useState("");
  const [cpcUsd, setCpcUsd] = useState(0.05);
  const [placements, setPlacements] = useState<PlacementRow[]>([]);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [cpcBusy, setCpcBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch("/api/admin/ads/placements")
      .then((r) => r.json())
      .then((d) => {
        if (cancel) return;
        setAdsenseClient(d.adsenseClient ?? "");
        setGamNetworkCode(d.gamNetworkCode ?? "");
        if (typeof d.cpcUsd === "number") setCpcUsd(d.cpcUsd);
        setPlacements(Array.isArray(d.placements) ? d.placements : []);
      })
      .catch(() => {})
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, []);

  const saveNetworks = async () => {
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

  const saveCpc = async (value: number) => {
    const v = Math.min(100, Math.max(0.001, value || 0.05));
    setCpcBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "ads", settings: { "ads.cpcUsd": v } }),
      });
      if (!res.ok) throw new Error();
      toast.success("Click price saved");
    } catch {
      toast.error("Couldn't save click price");
    } finally {
      setCpcBusy(false);
    }
  };

  // Match the canonical placement catalog against live AdPlacement stats.
  const statByName = new Map(placements.map((p) => [p.name, p]));
  const liveCount = AD_PLACEMENTS.filter(
    (p) => (statByName.get(p.name)?.stats.activeAds ?? 0) > 0
  ).length;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-1">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-500/15 text-emerald-400 grid place-items-center">
          <DollarSign className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">Monetization</h1>
          <p className="text-sm text-slate-400">
            Connect ad networks, set the click price, and see which surfaces are
            earning. Create individual ads in the{" "}
            <Link href="/admin/ads" className="text-emerald-400 hover:underline">
              Ad Manager
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Coverage summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Placements", value: AD_PLACEMENTS.length, tone: "text-white" },
          { label: "Live (has ads)", value: liveCount, tone: "text-emerald-400" },
          {
            label: "Empty slots",
            value: AD_PLACEMENTS.length - liveCount,
            tone: "text-amber-400",
          },
          {
            label: "Networks set",
            value: (adsenseClient ? 1 : 0) + (gamNetworkCode ? 1 : 0),
            tone: "text-blue-400",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-slate-800 bg-slate-900/50 p-3"
          >
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
              {s.label}
            </p>
            <p className={`text-2xl font-extrabold tabular-nums mt-0.5 ${s.tone}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Ad networks (publisher) */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-white inline-flex items-center gap-1.5">
            <Megaphone className="w-4 h-4 text-slate-400" /> Ad networks (publisher)
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Set once — per-ad you only enter the slot / ad-unit. Network ads are
            third-party (ad-blockable) and report in the network&apos;s own console.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              AdSense client (ca-pub-…)
            </label>
            <input
              value={adsenseClient}
              onChange={(e) => setAdsenseClient(e.target.value)}
              disabled={!canManage}
              placeholder="ca-pub-1234567890123456"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder:text-slate-600 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Ad Manager network code
            </label>
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
            onClick={saveNetworks}
            disabled={networkBusy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {networkBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save networks
          </button>
        )}
      </section>

      {/* Click price */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-white">Advertiser click price (CPC)</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            What an advertiser is billed per click on a first-party (LOCAL) ad.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-sm">$</span>
          <input
            type="number"
            step={0.01}
            min={0.001}
            value={cpcUsd}
            disabled={!canManage || cpcBusy}
            onChange={(e) => setCpcUsd(Number(e.target.value))}
            onBlur={(e) => canManage && saveCpc(Number(e.target.value))}
            className="w-28 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm text-center disabled:opacity-50"
          />
          <span className="text-xs text-slate-500">per click</span>
          {cpcBusy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>
      </section>

      {/* Placement coverage checklist */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-white">Placement coverage</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Every ad surface across the app. A slot with no active ad earns
            nothing — create an ad for it in the Ad Manager.
          </p>
        </div>
        <div className="divide-y divide-slate-800/70">
          {AD_PLACEMENTS.map((p) => {
            const stat = statByName.get(p.name)?.stats;
            const live = (stat?.activeAds ?? 0) > 0;
            return (
              <div
                key={p.name}
                className="flex items-center gap-3 py-2.5"
              >
                {live ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-600 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {p.label}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">{p.where}</p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`text-xs font-bold ${
                      live ? "text-emerald-400" : "text-slate-500"
                    }`}
                  >
                    {live ? `${stat?.activeAds} live` : "empty"}
                  </p>
                  <p className="text-[10px] text-slate-600 tabular-nums">
                    {(stat?.impressions ?? 0).toLocaleString()} impr ·{" "}
                    {(stat?.clicks ?? 0).toLocaleString()} clk
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <Link
          href="/admin/ads"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400 hover:underline"
        >
          Open Ad Manager <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </section>
    </div>
  );
}
