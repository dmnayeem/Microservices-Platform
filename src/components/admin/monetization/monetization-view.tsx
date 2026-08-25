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
  Coins,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { AD_PLACEMENTS } from "@/lib/ad-placements";
import { usd } from "@/lib/utils";

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
  // Google policy plumbing: certified CMP, auto ads, ads.txt.
  const [cmpEnabled, setCmpEnabled] = useState(false);
  const [autoAds, setAutoAds] = useState(false);
  const [adsTxt, setAdsTxt] = useState("");
  const [adsTxtBusy, setAdsTxtBusy] = useState(false);
  const [cpcBusy, setCpcBusy] = useState(false);
  const [bonusPct, setBonusPct] = useState(0);
  const [bonusBusy, setBonusBusy] = useState(false);
  // What goes at the top of an invoice, and whether tax applies.
  const [billing, setBilling] = useState({
    sellerName: "",
    sellerAddress: "",
    sellerEmail: "",
    sellerPhone: "",
    taxPct: 0,
    taxLabel: "VAT",
    taxId: "",
  });
  const [billingBusy, setBillingBusy] = useState(false);
  // Browse & Earn (passive CPM reward) config.
  const [beEnabled, setBeEnabled] = useState(true);
  const [bePoints, setBePoints] = useState(1);
  const [beSeconds, setBeSeconds] = useState(45);
  const [beCap, setBeCap] = useState(15);
  const [beBusy, setBeBusy] = useState(false);
  // Watch-to-earn video. OFF by default — it pays points out, so with only house
  // inventory it costs money and earns none.
  const [rvEnabled, setRvEnabled] = useState(false);
  const [rvCap, setRvCap] = useState(50);
  const [rvBusy, setRvBusy] = useState(false);
  // Full-screen ad pacing. Without a cap, a user claiming several rewards in a
  // row is queued that many back-to-back full-screen ads — see ad-frequency.ts.
  const [gapSec, setGapSec] = useState(60);
  const [dailyMax, setDailyMax] = useState(25);
  const [freqBusy, setFreqBusy] = useState(false);
  // What the ads actually earn. This page showed no money at all before — the
  // figures existed in AdDailyStat and AdCampaign.spentTotal and were surfaced
  // only inside the Ad Manager's Analytics tab.
  const [revenue, setRevenue] = useState<{
    windowSpend: number;
    lifetime: number;
    unspent: number;
    cashCollected: number;
    ecpm: number;
  } | null>(null);
  const [fillRate, setFillRate] = useState<number | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch("/api/admin/ads/placements")
      .then((r) => r.json())
      .then((d) => {
        if (cancel) return;
        setAdsenseClient(d.adsenseClient ?? "");
        setGamNetworkCode(d.gamNetworkCode ?? "");
        setCmpEnabled(!!d.googleCmpEnabled);
        setAutoAds(!!d.autoAdsEnabled);
        setAdsTxt(d.adsTxt ?? "");
        if (typeof d.cpcUsd === "number") setCpcUsd(d.cpcUsd);
        if (typeof d.creditBonusPct === "number") setBonusPct(d.creditBonusPct);
        if (d.billing) setBilling((b) => ({ ...b, ...d.billing }));
        setPlacements(Array.isArray(d.placements) ? d.placements : []);
        if (d.adFrequency) {
          setGapSec(d.adFrequency.minGapSeconds ?? 60);
          setDailyMax(d.adFrequency.dailyMax ?? 25);
        }
        if (d.rewarded) {
          setRvEnabled(d.rewarded.enabled === true);
          setRvCap(d.rewarded.dailyCap ?? 50);
        }
        if (d.browseEarn) {
          setBeEnabled(d.browseEarn.enabled !== false);
          setBePoints(d.browseEarn.pointsPerTick ?? 1);
          setBeSeconds(d.browseEarn.tickSeconds ?? 45);
          setBeCap(d.browseEarn.dailyCap ?? 15);
        }
      })
      .catch(() => {})
      .finally(() => !cancel && setLoading(false));

    // Revenue is a second, independent fetch: it must never delay or break the
    // settings form, which is what this page is actually for.
    fetch("/api/admin/ads/analytics?days=30")
      .then((r) => r.json())
      .then((d) => {
        if (cancel) return;
        if (d?.revenue) setRevenue(d.revenue);
        if (d?.fill) setFillRate(d.fill.rate ?? null);
      })
      .catch(() => {});

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
            "ads.google_cmp_enabled": cmpEnabled,
            "ads.auto_ads_enabled": autoAds,
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

  const saveRewarded = async () => {
    setRvBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "ads",
          settings: {
            "ads.rewarded_enabled": rvEnabled,
            "ads.rewarded_daily_cap": Math.max(0, Math.min(100000, rvCap || 0)),
          },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Watch & Earn saved");
    } catch {
      toast.error("Couldn't save Watch & Earn");
    } finally {
      setRvBusy(false);
    }
  };

  const saveAdsTxt = async () => {
    setAdsTxtBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "ads",
          settings: { "ads.txt_content": adsTxt.trim() },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("ads.txt saved");
    } catch {
      toast.error("Couldn't save ads.txt");
    } finally {
      setAdsTxtBusy(false);
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

  const saveBilling = async () => {
    setBillingBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "billing",
          settings: {
            "billing.seller_name": billing.sellerName.trim(),
            "billing.seller_address": billing.sellerAddress.trim(),
            "billing.seller_email": billing.sellerEmail.trim(),
            "billing.seller_phone": billing.sellerPhone.trim(),
            "billing.tax_pct": Math.min(100, Math.max(0, Number(billing.taxPct) || 0)),
            "billing.tax_label": billing.taxLabel.trim() || "VAT",
            "billing.tax_id": billing.taxId.trim(),
          },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Invoice details saved");
    } catch {
      toast.error("Couldn't save the invoice details");
    } finally {
      setBillingBusy(false);
    }
  };

  const saveCreditBonus = async (value: number) => {
    const v = Math.min(100, Math.max(0, Math.round(value) || 0));
    setBonusBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "ads",
          settings: { "ads.credit_bonus_pct": v },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(v > 0 ? `Bonus set to ${v}%` : "Bonus turned off");
    } catch {
      toast.error("Couldn't save the credit bonus");
    } finally {
      setBonusBusy(false);
    }
  };

  const saveFrequency = async () => {
    setFreqBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "ads",
          settings: {
            "ads.interstitial_min_gap_sec": Math.min(3600, Math.max(0, gapSec || 0)),
            "ads.interstitial_daily_max": Math.min(500, Math.max(0, dailyMax || 0)),
          },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Ad pacing saved");
    } catch {
      toast.error("Couldn't save ad pacing");
    } finally {
      setFreqBusy(false);
    }
  };

  const saveBrowseEarn = async () => {
    setBeBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "ads",
          settings: {
            "ads.browse_earn_enabled": beEnabled,
            "ads.browse_earn_points": Math.max(1, Math.min(1000, Number(bePoints) || 1)),
            "ads.browse_earn_seconds": Math.max(10, Math.min(600, Number(beSeconds) || 45)),
            "ads.browse_earn_daily_cap": Math.max(0, Math.min(100000, Number(beCap) || 0)),
          },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Browse & Earn settings saved");
    } catch {
      toast.error("Couldn't save Browse & Earn settings");
    } finally {
      setBeBusy(false);
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

      {/* What the ads earn — the reason the rest of this page exists. */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-bold text-white">Ad revenue</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Own and direct-sold inventory only. AdSense and Ad Manager revenue is
              reported in Google&apos;s console and this database never sees it.
            </p>
          </div>
          <Link
            href="/admin/ads"
            className="text-[11px] font-semibold text-blue-400 hover:text-blue-300"
          >
            Full breakdown →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Revenue (30d)", value: revenue ? usd(revenue.windowSpend) : "—", tone: "text-emerald-400" },
            { label: "Revenue (lifetime)", value: revenue ? usd(revenue.lifetime) : "—", tone: "text-white" },
            { label: "eCPM (30d)", value: revenue ? usd(revenue.ecpm) : "—", tone: "text-blue-400" },
            // A dash rather than 0% while nothing has been measured — the
            // counters only start from the day they shipped.
            { label: "Fill rate (30d)", value: fillRate === null ? "—" : `${fillRate.toFixed(0)}%`, tone: "text-amber-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{s.label}</p>
              <p className={`text-2xl font-extrabold tabular-nums mt-0.5 ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>
        {revenue && revenue.unspent > 0 && (
          <p className="text-[11px] text-slate-500">
            {usd(revenue.unspent)} of advertiser budget is funded but not yet spent —
            revenue you have been paid for and have not delivered.
          </p>
        )}
      </section>

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
        <label className="flex items-start gap-2.5 rounded-lg border border-slate-800 bg-slate-900/60 p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={cmpEnabled}
            disabled={!canManage}
            onChange={(e) => setCmpEnabled(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-blue-600"
          />
          <span>
            <span className="block text-xs font-semibold text-slate-200">
              Load Google&apos;s consent message (Privacy &amp; messaging)
            </span>
            <span className="block text-[11px] text-slate-500 mt-0.5">
              Required for visitors in the EEA, UK and Switzerland — Google stops
              serving there without a certified consent platform, and a hand-built
              banner can never be one. Turn this on after you create the message in
              your AdSense console; this only loads it.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoAds}
            disabled={!canManage}
            onChange={(e) => setAutoAds(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-amber-500"
          />
          <span>
            <span className="block text-xs font-semibold text-amber-200">
              Auto ads on the public marketing pages
            </span>
            <span className="block text-[11px] text-amber-200/70 mt-0.5">
              Google chooses the placements itself. We only switch it on for the
              public pages — never for the logged-in app.
            </span>
            <span className="block text-[11px] text-amber-300/90 mt-1.5 font-medium">
              Read this: turning it off here does not guarantee auto ads stay off
              the app. Auto ads run wherever the AdSense script loads, and it has
              to load in the app for your normal ad units to fill. The only real
              control is a <b>URL exclusion in your AdSense console</b> covering
              every logged-in page. Earning screens are incentivised, and Google
              ads are not allowed on those.
            </span>
          </span>
        </label>

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

      {/* ads.txt */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-white">ads.txt</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Served at <span className="text-slate-400">/ads.txt</span>. Buyers check
            it before bidding — without it most programmatic demand simply refuses
            to buy, and the space earns nothing. Leave empty and the AdSense line is
            written for you from the publisher id above; paste extra lines here when
            another network gives you one.
          </p>
        </div>
        <textarea
          value={adsTxt}
          onChange={(e) => setAdsTxt(e.target.value)}
          disabled={!canManage}
          rows={4}
          spellCheck={false}
          placeholder="google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs font-mono placeholder:text-slate-600 disabled:opacity-50"
        />
        {canManage && (
          <button
            onClick={saveAdsTxt}
            disabled={adsTxtBusy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {adsTxtBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save ads.txt
          </button>
        )}
      </section>

      {/* Watch & Earn (rewarded video) */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-white">Watch &amp; Earn (rewarded video)</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Users watch a video to the end and are paid points for it.
          </p>
        </div>

        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3">
          <p className="text-[11px] text-amber-200/90">
            <b>This costs you money until an advertiser is paying for it.</b> Every
            watch pays points out of your pocket. Right now the only inventory is
            your own house ads, which earn nothing back — so this is switched off,
            and should stay off until you have an offerwall/CPA feed or an
            advertiser buying these views. It is built and ready for that day.
          </p>
        </div>

        <label className="flex items-center gap-2.5 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={rvEnabled}
            disabled={!canManage}
            onChange={(e) => setRvEnabled(e.target.checked)}
            className="w-4 h-4 accent-emerald-600"
          />
          Enable Watch &amp; Earn
        </label>

        <div className="max-w-xs">
          <label className="block text-xs text-slate-400 mb-1">
            Daily points cap per user
          </label>
          <input
            type="number"
            min={0}
            max={100000}
            value={rvCap}
            disabled={!canManage}
            onChange={(e) => setRvCap(Math.max(0, Number(e.target.value) || 0))}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-50"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            0 turns it off as surely as the switch does. Enforced inside a row
            lock, so concurrent claims cannot get past it.
          </p>
        </div>

        {canManage && (
          <button
            onClick={saveRewarded}
            disabled={rvBusy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {rvBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Watch &amp; Earn
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

      {/* Invoice details */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-white">Invoice details</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            What appears at the top of every invoice and receipt you send.
            Invoices are issued from <b>Ads → Invoices</b>.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Your business name</label>
            <input
              value={billing.sellerName}
              onChange={(e) => setBilling((b) => ({ ...b, sellerName: e.target.value }))}
              disabled={!canManage}
              placeholder="EarnGPT"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder:text-slate-600 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Billing email</label>
            <input
              value={billing.sellerEmail}
              onChange={(e) => setBilling((b) => ({ ...b, sellerEmail: e.target.value }))}
              disabled={!canManage}
              placeholder="billing@yourdomain.com"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder:text-slate-600 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Phone</label>
            <input
              value={billing.sellerPhone}
              onChange={(e) => setBilling((b) => ({ ...b, sellerPhone: e.target.value }))}
              disabled={!canManage}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Your tax / BIN number
            </label>
            <input
              value={billing.taxId}
              onChange={(e) => setBilling((b) => ({ ...b, taxId: e.target.value }))}
              disabled={!canManage}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-50"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Address</label>
          <textarea
            value={billing.sellerAddress}
            onChange={(e) => setBilling((b) => ({ ...b, sellerAddress: e.target.value }))}
            disabled={!canManage}
            rows={3}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-50"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Tax rate (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={billing.taxPct}
              onChange={(e) => setBilling((b) => ({ ...b, taxPct: Number(e.target.value) }))}
              disabled={!canManage}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-50"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Leave at 0 and no tax line appears on the invoice at all.
            </p>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Tax label</label>
            <input
              value={billing.taxLabel}
              onChange={(e) => setBilling((b) => ({ ...b, taxLabel: e.target.value }))}
              disabled={!canManage}
              placeholder="VAT"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder:text-slate-600 disabled:opacity-50"
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          The rate is copied onto each invoice when it is issued, so changing it
          here never restates a document a client already has.
        </p>
        {canManage && (
          <button
            onClick={saveBilling}
            disabled={billingBusy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {billingBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save invoice details
          </button>
        )}
      </section>

      {/* Ad credit bonus */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-white">Ad credit bonus</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Extra credit on every top-up — your volume discount. At 10%, an
            advertiser paying $100 receives $110 of ad credit. This has worked
            since the credit system shipped and sat at 0 because nothing could set
            it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step={1}
            min={0}
            max={100}
            value={bonusPct}
            disabled={!canManage || bonusBusy}
            onChange={(e) => setBonusPct(Number(e.target.value))}
            onBlur={(e) => canManage && saveCreditBonus(Number(e.target.value))}
            className="w-24 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm text-center disabled:opacity-50"
          />
          <span className="text-slate-400 text-sm">%</span>
          {bonusPct > 0 && (
            <span className="text-[11px] text-slate-500">
              $100 paid → {usd(100 * (1 + bonusPct / 100))} of credit
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          Reporting knows the difference: &quot;Ad credit purchased&quot; counts
          the cash you were paid, not the credit you issued.
        </p>
      </section>

      {/* Full-screen ad pacing */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <div>
          <p className="text-sm font-bold text-white">Full-screen ad pacing</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            How often one user can be shown a full-screen ad before a reward.
            There was no limit at all, and reward ads queue — so claiming five
            things in a row meant five full-screen ads back to back, which is the
            fastest way to lose a user to an ad blocker. When a user is over
            their limit the ad is skipped and the reward is paid as normal;
            nothing is ever blocked. Games are exempt (they pace themselves, and
            their payout depends on ads being shown).
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Minimum gap between ads
              <span className="text-slate-600"> · 0 = no gap</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={3600}
                value={gapSec}
                disabled={!canManage || freqBusy}
                onChange={(e) => setGapSec(Number(e.target.value))}
                onBlur={() => canManage && saveFrequency()}
                className="w-24 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm text-center disabled:opacity-50"
              />
              <span className="text-xs text-slate-500">seconds</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Most full-screen ads per user per day
              <span className="text-slate-600"> · 0 = no cap</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={500}
                value={dailyMax}
                disabled={!canManage || freqBusy}
                onChange={(e) => setDailyMax(Number(e.target.value))}
                onBlur={() => canManage && saveFrequency()}
                className="w-24 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm text-center disabled:opacity-50"
              />
              <span className="text-xs text-slate-500">per day</span>
              {freqBusy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            </div>
          </div>
        </div>
      </section>

      {/* Browse & Earn — passive CPM reward */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-white inline-flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-400" /> Browse &amp; Earn (passive)
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              The <b>/watch-ads</b> page rewards users for keeping ads on screen —
              you earn CPM on the <b>Browse &amp; Earn</b> placement, they earn
              points. Add network ads to that slot below.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={beEnabled}
              disabled={!canManage}
              onChange={(e) => setBeEnabled(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
            />
            <span className="text-xs font-semibold text-slate-300">Enabled</span>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Points per interval</label>
            <input
              type="number"
              min={1}
              value={bePoints}
              disabled={!canManage}
              onChange={(e) => setBePoints(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Interval seconds</label>
            <input
              type="number"
              min={10}
              max={600}
              value={beSeconds}
              disabled={!canManage}
              onChange={(e) => setBeSeconds(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Daily cap (points)</label>
            <input
              type="number"
              min={0}
              value={beCap}
              disabled={!canManage}
              onChange={(e) => setBeCap(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm disabled:opacity-50"
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          A viewer earns up to{" "}
          <b className="text-amber-400">{beCap} pts/day</b> at{" "}
          {bePoints} pts every {beSeconds}s. Keep the payout below your real ad CPM
          so the surface stays profitable.
        </p>
        {canManage && (
          <button
            onClick={saveBrowseEarn}
            disabled={beBusy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {beBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Browse &amp; Earn
          </button>
        )}
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
