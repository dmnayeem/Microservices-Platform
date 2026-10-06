"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";
import { usd } from "@/lib/utils";

/**
 * Real ad measurement — the report the owner reads first.
 *
 * Reads /api/admin/ads/measurement (AdMeasureDaily). Every number is after
 * bot / invalid traffic was excluded, and the excluded traffic is shown beside
 * it with its reasons. Settings for the IVT rules are edited at the bottom.
 */

type Agg = {
  served: number;
  validViews: number;
  invalidViews: number;
  internalViews: number;
  validClicks: number;
  invalidClicks: number;
  internalClicks: number;
  estClicks: number;
  invalidEstClicks: number;
  scriptExecs: number;
  invalidScriptExecs: number;
  spend: number;
  invalidTotal: number;
  viewabilityPct: number | null;
  ctrPct: number | null;
};
type Report = {
  from: string;
  to: string;
  measuredSince: string | null;
  seesMoney: boolean;
  totals: Agg;
  perAd: (Agg & { adId: string; label: string; type: string; placement: string; network: string })[];
  perPlacement: (Agg & { placement: string })[];
  perNetwork: (Agg & { network: string; networkRevenueUsd?: number | null; ecpmUsd?: number | null })[];
  perDay: (Agg & { date: string })[];
  topReasons: { reason: string; label: string; count: number }[];
};
type IvtSettings = {
  enabled: boolean;
  rules: Record<string, boolean>;
  maxViewsPerMinute: number;
  maxClicksPerHourPerAd: number;
  burstPer10s: number;
  minClickAfterViewMs: number;
  rawRetentionDays: number;
};

const n = (x: number) => x.toLocaleString("en-US");
const pct = (x: number | null, dp = 1) => (x == null ? "—" : `${x.toFixed(dp)}%`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function MeasurementPanel() {
  const [to, setTo] = useState(() => ymd(new Date()));
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 13 * 86_400_000)));
  const [rep, setRep] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/ads/measurement?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => active && setRep(d))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [from, to, reloadKey]);

  const t = rep?.totals;
  const qs = `from=${from}&to=${to}`;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-900/60 bg-slate-900 p-4 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Real measurement
              <span className="ml-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold px-2 py-0.5">
                Bot/invalid traffic excluded
              </span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-2xl">
              An impression is counted only when the ad was at least half on screen for a full second
              (a third, for large ads) on a visible page — and for AdSense / Ad Manager only when the
              unit actually filled. A click is counted when the viewer passes through our click link.
              Totals refresh every 10 minutes.
              {rep?.measuredSince ? (
                <> Real measurement since <b className="text-slate-200">{rep.measuredSince}</b>; figures before that day (in the Performance section below) were counted when the ad was sent, not when it was seen.</>
              ) : (
                <> No measured traffic yet.</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => {
                if (!e.target.value) return;
                setLoading(true);
                setFrom(e.target.value);
              }}
              className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-slate-200"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => {
                if (!e.target.value) return;
                setLoading(true);
                setTo(e.target.value);
              }}
              className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-slate-200"
            />
            <span className="text-slate-500 ml-1">CSV</span>
            {(["ad", "placement", "network", "day", "reasons"] as const).map((s) => (
              <a
                key={s}
                href={`/api/admin/ads/measurement?${qs}&format=csv&scope=${s}`}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
              >
                {s}
              </a>
            ))}
          </div>
        </div>

        {loading && !rep ? (
          <div className="py-6 grid place-items-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
          </div>
        ) : t ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <Tile label="Served" value={n(t.served)} hint="Ads sent to a browser" />
            <Tile label="Viewable impressions" value={n(t.validViews)} hint="Valid, real viewers" />
            <Tile label="Viewability" value={pct(t.viewabilityPct)} hint="Viewable ÷ served" />
            <Tile label="Clicks" value={n(t.validClicks)} hint={`CTR ${pct(t.ctrPct, 2)}`} />
            <Tile label="Estimated clicks" value={n(t.estClicks)} hint="3rd-party ads (focus change)" />
            <Tile label="Script executions" value={n(t.scriptExecs)} hint="Page-script ads" />
            <Tile label="Invalid filtered" value={n(t.invalidTotal)} hint="Not in any number above" warn />
            <Tile label="Staff traffic" value={`${n(t.internalViews)} / ${n(t.internalClicks)}`} hint="Impr. / clicks — never billed" />
            {rep?.seesMoney && <Tile label="Spend (paid ads)" value={usd(t.spend)} hint="Valid billed clicks only" />}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Couldn&apos;t load the measurement report.</p>
        )}
      </div>

      {rep && (
        <>
          <div className="grid lg:grid-cols-2 gap-3">
            <Table
              title="By placement"
              cols={["Placement", "Served", "Viewable", "View %", "Clicks", "CTR", "Est. clicks", "Invalid"]}
              rows={rep.perPlacement.map((r) => [r.placement, n(r.served), n(r.validViews), pct(r.viewabilityPct), n(r.validClicks), pct(r.ctrPct, 2), n(r.estClicks), n(r.invalidTotal)])}
            />
            <Table
              title="By network"
              note="These are OUR measured viewable impressions for each network's units. Revenue is what the network's own dashboard reports — enter it below to see eCPM."
              cols={["Network", "Served", "Viewable", "View %", "Clicks", "Est. clicks", "Invalid", ...(rep.seesMoney ? ["Revenue", "eCPM"] : [])]}
              rows={rep.perNetwork.map((r) => [
                r.network,
                n(r.served),
                n(r.validViews),
                pct(r.viewabilityPct),
                n(r.validClicks),
                n(r.estClicks),
                n(r.invalidTotal),
                ...(rep.seesMoney
                  ? [r.networkRevenueUsd == null ? "—" : usd(r.networkRevenueUsd), r.ecpmUsd == null ? "—" : usd(r.ecpmUsd)]
                  : []),
              ])}
            />
          </div>
          <Table
            title="By ad"
            cols={["Ad", "Placement", "Network", "Served", "Viewable", "View %", "Clicks", "CTR", "Est. clicks", "Invalid", ...(rep.seesMoney ? ["Spend"] : [])]}
            rows={rep.perAd.slice(0, 100).map((r) => [
              r.label,
              r.placement,
              r.network,
              n(r.served),
              n(r.validViews),
              pct(r.viewabilityPct),
              n(r.validClicks),
              pct(r.ctrPct, 2),
              n(r.estClicks),
              n(r.invalidTotal),
              ...(rep.seesMoney ? [usd(r.spend)] : []),
            ])}
          />
          <div className="grid lg:grid-cols-2 gap-3">
            <Table
              title="By day (UTC)"
              cols={["Date", "Served", "Viewable", "View %", "Clicks", "Est. clicks", "Invalid"]}
              rows={rep.perDay.map((r) => [r.date, n(r.served), n(r.validViews), pct(r.viewabilityPct), n(r.validClicks), n(r.estClicks), n(r.invalidTotal)])}
            />
            <Table
              title="Invalid traffic — why it was filtered"
              cols={["Reason", "Events"]}
              rows={rep.topReasons.map((r) => [r.label, n(r.count)])}
              empty="Nothing filtered in this range."
            />
          </div>
        </>
      )}

      {rep?.seesMoney && <NetworkRevenueEditor onSaved={() => setReloadKey((k) => k + 1)} />}
      <IvtSettingsEditor />
    </div>
  );
}

/**
 * Hand entry of what each network's dashboard says it paid for a day
 * (/api/admin/ads/network-revenue). Setting a day again replaces it.
 */
function NetworkRevenueEditor({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{
    canEdit: boolean;
    networks: { id: string; name: string }[];
    rows: { id: string; date: string; network: string; networkName: string; revenueUsd: number; note: string | null }[];
  } | null>(null);
  const [date, setDate] = useState(() => ymd(new Date(Date.now() - 86_400_000)));
  const [network, setNetwork] = useState("adsense");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/ads/network-revenue")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (open && !data) load();
  }, [open, data, load]);

  const save = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter the amount in USD (0 or more).");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/ads/network-revenue", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, network, revenueUsd: value, note: note.trim() || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Could not save.");
      toast.success("Network revenue saved.");
      setAmount("");
      setNote("");
      load();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const r = await fetch(`/api/admin/ads/network-revenue?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (r.ok) {
      load();
      onSaved();
    } else toast.error("Could not delete.");
  };

  const field = "rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-100";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-slate-200">
        {open ? "▾" : "▸"} Network revenue (from each network&apos;s dashboard)
      </button>
      {open && !data && <Loader2 className="w-4 h-4 animate-spin text-slate-500 mt-2" />}
      {open && data && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-slate-500">
            Copy the day&apos;s earnings from AdSense, Adsterra, etc. The report divides it by our valid viewable
            impressions to show eCPM. Entering the same day and network again replaces the old figure.
          </p>
          {data.canEdit ? (
            <div className="flex flex-wrap items-end gap-2">
              <input type="date" value={date} max={ymd(new Date())} onChange={(e) => setDate(e.target.value)} className={field} />
              <select value={network} onChange={(e) => setNetwork(e.target.value)} className={field}>
                {data.networks.map((nw) => (
                  <option key={nw.id} value={nw.id}>
                    {nw.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="USD"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${field} w-28 text-right`}
              />
              <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={`${field} w-48`} />
              <button
                type="button"
                onClick={save}
                disabled={saving || amount === ""}
                className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Read-only — entering revenue needs ads.manage.</p>
          )}
          {data.rows.length === 0 ? (
            <p className="text-[11px] text-slate-500">Nothing entered in the last 30 days.</p>
          ) : (
            <div className="max-h-64 overflow-auto divide-y divide-slate-800 text-xs">
              {data.rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-slate-300">
                    {r.date} · {r.networkName}
                    {r.note && <span className="text-slate-500"> · {r.note}</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums text-emerald-400">{usd(r.revenueUsd)}</span>
                    {data.canEdit && (
                      <button type="button" onClick={() => remove(r.id)} className="text-[11px] text-red-400 hover:text-red-300">
                        Delete
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5 min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${warn ? "text-amber-300" : "text-white"}`}>{value}</p>
      {hint && <p className="text-[10px] text-slate-500 truncate">{hint}</p>}
    </div>
  );
}

function Table({
  title,
  cols,
  rows,
  note,
  empty = "No measured traffic in this range.",
}: {
  title: string;
  cols: string[];
  rows: (string | number)[][];
  note?: string;
  empty?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">{title}</p>
      {note && <p className="text-[11px] text-slate-500 mb-2">{note}</p>}
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                {cols.map((c, i) => (
                  <th key={c} className={`pb-1.5 whitespace-nowrap ${i === 0 ? "text-left" : "text-right pl-3"}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-800/60">
                  {r.map((c, j) => (
                    <td
                      key={j}
                      className={`py-1.5 ${j === 0 ? "text-left text-slate-200 max-w-[16rem] truncate" : "text-right pl-3 tabular-nums text-slate-300 whitespace-nowrap"}`}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IvtSettingsEditor() {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<IvtSettings | null>(null);
  const [rules, setRules] = useState<{ id: string; label: string }[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/ads/measurement/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setS(d.settings);
        setRules(d.rules ?? []);
        setCanEdit(!!d.canEdit);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open && !s) load();
  }, [open, s, load]);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/ads/measurement/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't save");
      setS(d.settings);
      toast.success("Invalid-traffic rules saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const num = (key: keyof IvtSettings, label: string, unit: string) =>
    s && (
      <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
        <span>{label}</span>
        <span className="inline-flex items-center gap-1">
          <input
            type="number"
            disabled={!canEdit}
            value={s[key] as number}
            onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })}
            className="w-20 rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-right text-slate-100"
          />
          <span className="text-slate-500 w-14">{unit}</span>
        </span>
      </label>
    );

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-slate-200">
        {open ? "▾" : "▸"} Measurement settings — invalid-traffic rules
      </button>
      {open && !s && <Loader2 className="w-4 h-4 animate-spin text-slate-500 mt-2" />}
      {open && s && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-slate-500">
            Forged, expired and replayed tokens are always rejected. Everything else below can be
            switched off. Filtered events are kept with their reason (never deleted silently) until
            the raw-event retention period ends; daily totals are kept forever.
          </p>
          <label className="flex items-center gap-2 text-xs text-slate-200 font-semibold">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={s.enabled}
              onChange={(e) => setS({ ...s, enabled: e.target.checked })}
            />
            Invalid-traffic filtering on
          </label>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {rules.map((r) => (
              <label key={r.id} className={`flex items-start gap-2 text-xs ${s.enabled ? "text-slate-300" : "text-slate-600"}`}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  disabled={!canEdit || !s.enabled}
                  checked={s.rules[r.id] !== false}
                  onChange={(e) => setS({ ...s, rules: { ...s.rules, [r.id]: e.target.checked } })}
                />
                {r.label}
              </label>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 max-w-3xl">
            {num("maxViewsPerMinute", "Max impressions per viewer per minute", "/ min")}
            {num("maxClicksPerHourPerAd", "Max clicks per viewer per ad per hour", "/ hour")}
            {num("burstPer10s", "Max events from one IP + browser in 10s", "/ 10s")}
            {num("minClickAfterViewMs", "Fastest believable click after the ad appears", "ms")}
            {num("rawRetentionDays", "Keep raw events for", "days")}
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5"
            >
              {saving ? "Saving…" : "Save rules"}
            </button>
          ) : (
            <p className="text-[11px] text-slate-500">Read-only — editing needs the ads.manage permission.</p>
          )}
        </div>
      )}
    </div>
  );
}
