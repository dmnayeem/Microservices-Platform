"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Lock, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, usd } from "@/lib/utils";
import {
  AD_NETWORKS,
  EMPTY_NETWORK_ENTRY,
  adsTxtLineFor,
  normalizeNetworkSettings,
  type NetworkSettings,
  type NetworkSettingsEntry,
} from "@/lib/ad-networks/registry";

const inputCls =
  "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500";

const KIND_LABEL: Record<string, string> = {
  BANNER_IFRAME: "Banner",
  NATIVE_WIDGET: "Native",
  PAGE_SCRIPT: "Page script",
};

/** One network's numbers from /api/admin/ads/networks/stats. */
interface NetStats {
  ads: number;
  active: number;
  paused: number;
  served: number;
  validViews: number;
  invalidViews: number;
  clicks: number;
  /** Null when the viewer has no finance access. */
  revenueUsd: number | null;
}

const EMPTY_STATS: NetStats = {
  ads: 0,
  active: 0,
  paused: 0,
  served: 0,
  validViews: 0,
  invalidViews: 0,
  clicks: 0,
  revenueUsd: null,
};

type Health = { tone: "green" | "amber" | "red" | "slate"; text: string };

const HEALTH_CLS: Record<Health["tone"], string> = {
  green: "bg-emerald-500/15 text-emerald-300",
  amber: "bg-amber-500/15 text-amber-300",
  red: "bg-red-500/15 text-red-300",
  slate: "bg-slate-800 text-slate-400",
};

/** The one thing the owner should know about this network right now. */
function healthOf(opts: {
  google: boolean;
  configured: boolean;
  enabled: boolean;
  needsPubId: boolean;
  st: NetStats;
  days: number;
}): Health {
  const { st } = opts;
  if (opts.google) {
    if (st.ads > 0 && !opts.configured) return { tone: "red", text: `Not configured — its ${st.ads} ad(s) cannot show` };
    if (!opts.configured) return { tone: "slate", text: "Not set up" };
  } else {
    if (st.ads > 0 && !opts.enabled) return { tone: "red", text: `Switched off — its ${st.ads} ad(s) are not showing anywhere` };
    if (!opts.enabled) return { tone: "slate", text: "Off" };
    if (opts.needsPubId) return { tone: "amber", text: "Publisher id missing — its ads.txt line is not published" };
  }
  if (st.ads === 0) return { tone: "amber", text: "On, but no ad uses it — create an HTML ad and pick this network" };
  if (st.active === 0) return { tone: "amber", text: "All its ads are paused or not approved" };
  if (st.validViews === 0)
    return {
      tone: "amber",
      text:
        st.served > 0
          ? `Delivered ${st.served.toLocaleString()} times in ${opts.days}d but no viewable impression — the network is not filling, or it is blocked`
          : `Live, but nothing delivered in ${opts.days}d — check its ad spaces are on`,
    };
  return { tone: "green", text: "Running" };
}

function Toggle({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40",
        on ? "bg-blue-600" : "bg-slate-700"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white transition-transform",
          on ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export function AdNetworksView({
  canManage,
  paidPrefixes,
}: {
  canManage: boolean;
  paidPrefixes: string[];
}) {
  const [settings, setSettings] = useState<NetworkSettings | null>(null);
  const [google, setGoogle] = useState<{ adsenseClient: string; gamNetworkCode: string } | null>(null);
  const [frameOrigin, setFrameOrigin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<Record<string, NetStats> | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const loadStats = useCallback(() => {
    fetch(`/api/admin/ads/networks/stats?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStats(d?.rows ?? {}))
      .catch(() => setStats({}));
  }, [days]);
  useEffect(() => loadStats(), [loadStats]);

  const setAllStatus = async (network: string, name: string, status: "ACTIVE" | "PAUSED") => {
    setBulkBusy(network);
    try {
      const res = await fetch("/api/admin/ads/networks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network, status }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed");
      if (d.total === 0) toast.info(status === "PAUSED" ? `No live ${name} ads to pause` : `No paused ${name} ads to resume`);
      else
        toast.success(`${d.changed} ${name} ad(s) ${status === "PAUSED" ? "paused" : "resumed"}`, {
          description: d.skipped ? `${d.skipped} never approved — approve them in the Ads Manager` : undefined,
        });
      loadStats();
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBulkBusy(null);
    }
  };

  useEffect(() => {
    fetch("/api/admin/ads/networks")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setSettings(normalizeNetworkSettings(d?.settings));
        setGoogle(d?.google ?? null);
        setFrameOrigin(d?.frameOrigin ?? null);
      })
      .catch(() => setSettings(normalizeNetworkSettings(null)));
  }, []);

  if (!settings) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const patch = (id: string, p: Partial<NetworkSettingsEntry>) =>
    setSettings((s) =>
      s
        ? {
            ...s,
            networks: {
              ...s.networks,
              [id]: { ...(s.networks[id] ?? EMPTY_NETWORK_ENTRY), ...p },
            },
          }
        : s
    );

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ads/networks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      const d = await res.json();
      setSettings(normalizeNetworkSettings(d.settings));
      toast.success("Network settings saved");
    } catch (err) {
      toast.error("Failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-2 text-sm">
        <p className="font-semibold text-white">Frame origin</p>
        {frameOrigin ? (
          <p className="text-slate-400">
            Network snippets run on <span className="text-white">{frameOrigin}</span> — they get
            their own cookies and storage, never the app&apos;s.
          </p>
        ) : (
          <p className="text-amber-400">
            AD_FRAME_ORIGIN is not set, so network snippets run in a locked-down frame with no
            cookies or storage. Many networks (Taboola, Outbrain, most push / native networks)
            fill poorly or not at all there. Point a subdomain such as ads.revtype.com at this
            app and set AD_FRAME_ORIGIN to it.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex items-start justify-between gap-4">
        <div className="text-sm">
          <p className="font-semibold text-white">Page scripts alongside Google</p>
          <p className="text-slate-400">
            Popunder / push / vignette networks are skipped on pages that also load AdSense or Ad
            Manager — a popunder next to AdSense breaks Google&apos;s policies. Only turn this on
            if you are not using Google.
          </p>
        </div>
        <Toggle
          label="Page scripts alongside Google"
          on={settings.pageScriptsWithGoogle}
          disabled={!canManage}
          onChange={(v) => setSettings({ ...settings, pageScriptsWithGoogle: v })}
        />
      </div>

      <NetworkSummary
        days={days}
        onDays={setDays}
        stats={stats}
        own={stats?.own ?? null}
      />

      <div className="space-y-2">
        {[...AD_NETWORKS]
          .map((n) => ({ n, st: stats?.[n.id] ?? EMPTY_STATS, on: n.google ? false : !!settings.networks[n.id]?.enabled }))
          // Networks in use first (live ads, then any ads, then switched on); the rest A→Z.
          .sort(
            (a, b) =>
              b.st.active - a.st.active ||
              b.st.ads - a.st.ads ||
              Number(b.on) - Number(a.on) ||
              a.n.name.localeCompare(b.n.name)
          )
          .filter(({ n, st, on }) => showAll || on || st.ads > 0 || st.served > 0 || (n.google && (n.id === "adsense" ? !!google?.adsenseClient : !!google?.gamNetworkCode)))
          .map(({ n, st }) => {
          const e = settings.networks[n.id] ?? EMPTY_NETWORK_ENTRY;
          const googleId =
            n.id === "adsense" ? google?.adsenseClient : n.id === "gam" ? google?.gamNetworkCode : "";
          const line = n.google
            ? n.id === "adsense" && googleId
              ? adsTxtLineFor(n, googleId)
              : null
            : adsTxtLineFor(n, e.publisherId);
          const expanded = open === n.id;
          return (
            <div key={n.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">
                    {n.name}
                    {n.adult && (
                      <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                        ADULT DEMAND
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {n.kinds.map((k) => KIND_LABEL[k]).join(" · ")}
                  </p>
                </div>
                {(() => {
                  const h = healthOf({
                    google: !!n.google,
                    configured: !!googleId,
                    enabled: e.enabled,
                    needsPubId: !!n.adsTxt && !e.publisherId.trim(),
                    st,
                    days,
                  });
                  return (
                    <span className={cn("order-last basis-full rounded-lg px-2.5 py-1 text-xs font-medium sm:order-none sm:basis-auto", HEALTH_CLS[h.tone])}>
                      {h.text}
                    </span>
                  );
                })()}
                {n.google ? (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Lock className="h-3.5 w-3.5" />
                    {googleId ? `Configured (${googleId})` : "Not configured"} ·{" "}
                    <Link href="/admin/monetization" className="text-blue-400 hover:underline">
                      Monetization
                    </Link>
                  </span>
                ) : (
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    Enabled
                    <Toggle
                      label={`Enable ${n.name}`}
                      on={e.enabled}
                      disabled={!canManage}
                      onChange={(v) => patch(n.id, { enabled: v })}
                    />
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : n.id)}
                  className="text-xs text-blue-400 hover:underline"
                >
                  {expanded ? "Close" : "Settings"}
                </button>
              </div>

              {(st.ads > 0 || st.served > 0) && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-800 pt-3 text-xs">
                  <Stat label="Ads" value={`${st.active} live / ${st.ads}`} />
                  <Stat label={`Delivered (${days}d)`} value={st.served.toLocaleString()} />
                  <Stat label="Viewable impressions" value={st.validViews.toLocaleString()} />
                  <Stat label="Clicks" value={st.clicks.toLocaleString()} />
                  {st.invalidViews > 0 && <Stat label="Filtered (bots/fraud)" value={st.invalidViews.toLocaleString()} />}
                  {st.revenueUsd !== null && (
                    <>
                      <Stat label="Earned (entered)" value={usd(st.revenueUsd)} />
                      <Stat
                        label="eCPM"
                        value={st.validViews > 0 && st.revenueUsd > 0 ? usd((st.revenueUsd / st.validViews) * 1000) : "—"}
                      />
                    </>
                  )}
                  {canManage && st.ads > 0 && (
                    <span className="ml-auto flex gap-1.5">
                      <button
                        type="button"
                        disabled={bulkBusy === n.id}
                        onClick={() => setAllStatus(n.id, n.name, "PAUSED")}
                        className="rounded-lg border border-slate-700 px-2.5 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                      >
                        Pause all
                      </button>
                      <button
                        type="button"
                        disabled={bulkBusy === n.id}
                        onClick={() => setAllStatus(n.id, n.name, "ACTIVE")}
                        className="rounded-lg border border-emerald-600/40 px-2.5 py-1 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                      >
                        Resume all
                      </button>
                    </span>
                  )}
                </div>
              )}

              {expanded && (
                <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
                  <p className="text-[11px] text-slate-400">{n.notes}</p>
                  {!n.google && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">{n.publisherIdLabel}</label>
                      <input
                        value={e.publisherId}
                        disabled={!canManage}
                        onChange={(ev) => patch(n.id, { publisherId: ev.target.value })}
                        className={inputCls}
                      />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-xs">
                      <p className="font-semibold text-slate-300">Allowed on paid pages</p>
                      <p className="text-slate-500">
                        {n.google
                          ? "Never — Google prohibits its ads on pages that reward users."
                          : "Task, earn, quiz, mission and reward screens. Off unless the network's terms allow incentivised traffic."}
                      </p>
                    </div>
                    <Toggle
                      label={`Allow ${n.name} on paid pages`}
                      on={!n.google && e.allowOnPaid}
                      disabled={!canManage || !!n.google}
                      onChange={(v) => patch(n.id, { allowOnPaid: v })}
                    />
                  </div>
                  {!n.google && (
                    <div className="flex items-start justify-between gap-4">
                      <div className="text-xs">
                        <p className="font-semibold text-slate-300">Allows refresh (rotation)</p>
                        <p className="text-slate-500">
                          Off: once shown, this network&apos;s ad stays in its space. Turn on only if {n.name}
                          &apos;s terms allow refreshing ads on a timer.
                        </p>
                      </div>
                      <Toggle
                        label={`Allow ${n.name} ads to be refreshed`}
                        on={e.allowRefresh}
                        disabled={!canManage}
                        onChange={(v) => patch(n.id, { allowRefresh: v })}
                      />
                    </div>
                  )}
                  {!n.google && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Extra ads.txt lines from {n.name} (one per line)
                      </label>
                      <textarea
                        value={e.adsTxt}
                        disabled={!canManage}
                        onChange={(ev) => patch(n.id, { adsTxt: ev.target.value })}
                        rows={3}
                        className={cn(inputCls, "font-mono text-xs")}
                      />
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">
                    ads.txt line:{" "}
                    <span className="font-mono text-slate-300">
                      {line ?? (n.adsTxt ? "— enter the publisher id" : "— this network has no standard line")}
                    </span>
                    {!n.google && !e.enabled && line ? " (added once enabled)" : ""}
                  </p>
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full rounded-xl border border-dashed border-slate-700 py-2.5 text-sm text-slate-400 hover:bg-slate-900"
        >
          {showAll ? "Show only networks in use" : `Show all ${AD_NETWORKS.length} networks`}
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm space-y-2">
        <p className="font-semibold text-white">AdSense Auto ads — URL exclusions</p>
        <p className="text-slate-400">
          The app keeps Google&apos;s script off these paths, but Auto ads are controlled in the
          AdSense console. Add each as a URL exclusion there (Ads → By site → Auto ads → Page
          exclusions):
        </p>
        <p className="font-mono text-xs text-slate-300 break-words">
          {paidPrefixes.map((p) => `${p}/*`).join("  ")}
        </p>
      </div>

      {canManage && (
        <div className="sticky bottom-4 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-slate-500">{label} </span>
      <span className="font-semibold tabular-nums text-white">{value}</span>
    </span>
  );
}

/** The whole picture first: how every network together did in the window. */
function NetworkSummary({
  days,
  onDays,
  stats,
  own,
}: {
  days: number;
  onDays: (d: number) => void;
  stats: Record<string, NetStats> | null;
  own: NetStats | null;
}) {
  const nets = Object.entries(stats ?? {}).filter(([id]) => id !== "own").map(([, v]) => v);
  const sum = (k: keyof NetStats) => nets.reduce((n, v) => n + (Number(v[k]) || 0), 0);
  const money = nets.some((v) => v.revenueUsd !== null);
  const views = sum("validViews");
  const revenue = sum("revenueUsd");
  return (
    <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-white">All networks — last {days} days</p>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDays(d)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                d === days ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      {!stats ? (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading numbers…
        </p>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Stat label="Network ads live" value={`${sum("active")} / ${sum("ads")}`} />
          <Stat label="Delivered" value={sum("served").toLocaleString()} />
          <Stat label="Viewable impressions" value={views.toLocaleString()} />
          <Stat label="Clicks" value={sum("clicks").toLocaleString()} />
          {money && <Stat label="Earned (entered)" value={usd(revenue)} />}
          {money && <Stat label="eCPM" value={views > 0 && revenue > 0 ? usd((revenue / views) * 1000) : "—"} />}
          {own && own.ads > 0 && (
            <Stat label="Your own ads" value={`${own.validViews.toLocaleString()} views · ${own.clicks.toLocaleString()} clicks`} />
          )}
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        Our count: an impression is counted when at least half the ad is on screen for 1 second, with bots
        and staff filtered out. Each network counts in its own dashboard and pays on its own count, so
        expect the numbers to differ. Earnings are what you enter per day in{" "}
        <Link href="/admin/ads?tab=analytics" className="text-blue-400 hover:underline">
          Ads Manager → Analytics
        </Link>
        .
      </p>
    </div>
  );
}
