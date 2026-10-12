"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Plus, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, usd } from "@/lib/utils";
import { SeriesChart } from "@/components/admin/charts";

/* ── Types (mirror /api/admin/finance/platform-income) ─────────────────── */

interface PlatformRow {
  id: string;
  name: string;
  type: string;
  color: string | null;
  networkKey: string | null;
  isActive: boolean;
  avg30: number | null;
  entry: {
    id: string;
    amountUsd: number;
    note: string | null;
    status: string;
    voidReason: string | null;
    updatedAt: string;
  } | null;
}

interface DayData {
  date: string;
  latestDay: string;
  can: { enter: boolean; approve: boolean; settings: boolean };
  networks: { id: string; name: string }[];
  platforms: PlatformRow[];
}

interface MonthRow {
  platformId: string;
  name: string;
  days: number;
  estimatedUsd: number;
  actualUsd: number | null;
  adjustmentUsd: number | null;
  receivedAt: string | null;
  reference: string | null;
  note: string | null;
}

interface Report {
  from: string;
  to: string;
  own: { usd: number; streams: { key: string; label: string; usd: number; count: number; measured: boolean }[] };
  thirdParty: {
    usd: number;
    estimatedUsd: number;
    adjustmentUsd: number;
    entryCount: number;
    platforms: { id: string; name: string; type: string; estimatedUsd: number; adjustmentUsd: number; usd: number; days: number; isActive: boolean }[];
  };
  totalUsd: number;
  daily: {
    days: { date: string; usd: number }[];
    missing: { date: string; platforms: string[] }[];
  } | null;
}

const TABS = [
  { id: "entry", label: "Daily entry" },
  { id: "month", label: "Month-end payout" },
  { id: "report", label: "Report" },
  { id: "platforms", label: "Platforms" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const TYPES = ["Ad network", "Affiliate", "Sponsorship", "Offerwall network", "Other"];
const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50";

/* ── Date helpers (UTC days, like the server) ──────────────────────────── */

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const todayUtc = () => new Date().toISOString().slice(0, 10);
const monthOf = (day: string) => day.slice(0, 7);

function presetRange(id: string): { from: string; to: string } {
  const t = todayUtc();
  const d = new Date(`${t}T00:00:00.000Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  switch (id) {
    case "today":
      return { from: t, to: t };
    case "yesterday":
      return { from: addDays(t, -1), to: addDays(t, -1) };
    case "week": {
      // Monday-based week.
      const dow = (d.getUTCDay() + 6) % 7;
      return { from: addDays(t, -dow), to: t };
    }
    case "7d":
      return { from: addDays(t, -6), to: t };
    case "month":
      return { from: iso(new Date(Date.UTC(y, m, 1))), to: t };
    case "lastmonth":
      return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
    case "year":
      return { from: iso(new Date(Date.UTC(y, 0, 1))), to: t };
    default:
      return { from: addDays(t, -29), to: t };
  }
}

/* ── Root ──────────────────────────────────────────────────────────────── */

export function PlatformIncomeView() {
  const [tab, setTab] = useState<Tab>("entry");
  const [day, setDay] = useState(todayUtc());
  const [data, setData] = useState<DayData | null>(null);

  const loadDay = useCallback(async (d: string) => {
    const r = await fetch(`/api/admin/finance/platform-income?view=day&date=${d}`);
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      toast.error("Could not load", { description: j?.error ?? "Try again" });
      return;
    }
    setData(j as DayData);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set only after the fetch resolves
    void loadDay(day);
  }, [day, loadDay]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold",
              tab === t.id ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : tab === "entry" ? (
        <EntryTab data={data} day={day} setDay={setDay} reload={() => loadDay(day)} goPlatforms={() => setTab("platforms")} />
      ) : tab === "month" ? (
        <MonthTab />
      ) : tab === "report" ? (
        <ReportTab />
      ) : (
        <PlatformsTab data={data} reload={() => loadDay(day)} />
      )}
    </div>
  );
}

/* ── Daily entry ───────────────────────────────────────────────────────── */

function EntryTab({
  data,
  day,
  setDay,
  reload,
  goPlatforms,
}: {
  data: DayData;
  day: string;
  setDay: (d: string) => void;
  reload: () => Promise<void> | void;
  goPlatforms: () => void;
}) {
  const active = data.platforms.filter((p) => p.isActive);
  // What is typed, per platform. Seeded from the saved figure for the day.
  const [vals, setVals] = useState<Record<string, { amount: string; note: string }>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string[] | null>(null);

  useEffect(() => {
    const next: Record<string, { amount: string; note: string }> = {};
    for (const p of data.platforms) {
      next[p.id] = {
        amount: p.entry && p.entry.status === "ACTIVE" ? String(p.entry.amountUsd) : "",
        note: p.entry?.note ?? "",
      };
    }
    setVals(next);
  }, [data]);

  const changed = active.filter((p) => {
    const v = vals[p.id];
    if (!v || v.amount.trim() === "") return false;
    const saved = p.entry && p.entry.status === "ACTIVE" ? p.entry : null;
    return !saved || Number(v.amount) !== saved.amountUsd || (v.note.trim() || null) !== (saved.note ?? null);
  });
  const dayTotal = active.reduce((n, p) => n + (Number(vals[p.id]?.amount) || 0), 0);

  const save = async (confirmLarge = false) => {
    setBusy(true);
    try {
      const rows = changed.map((p) => ({ platformId: p.id, amountUsd: vals[p.id].amount.trim(), note: vals[p.id].note }));
      const r = await fetch("/api/admin/finance/platform-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "entries.save", date: day, rows, confirmLarge }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409 && j.needsConfirm) {
        setConfirm(j.warnings as string[]);
        return;
      }
      if (!r.ok) throw new Error(j.error ?? "Save failed");
      setConfirm(null);
      toast.success(`Saved ${day}`, { description: `${j.changed} figure(s) changed` });
      await reload();
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : "Try again" });
    } finally {
      setBusy(false);
    }
  };

  const voidEntry = async (p: PlatformRow) => {
    const reason = window.prompt(`Void ${p.name}'s figure for ${day}? Say why (kept on record):`);
    if (!reason?.trim()) return;
    const r = await fetch("/api/admin/finance/platform-income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "entry.void", id: p.entry!.id, reason }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error("Not voided", { description: j.error ?? "Try again" });
    toast.success("Voided — it no longer counts anywhere");
    await reload();
  };

  if (active.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
        No platforms yet. Add Google AdSense, Adsterra and the other companies that pay you first.
        <div>
          <button type="button" onClick={goPlatforms} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            Add a platform
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setDay(addDays(day, -1))} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800" aria-label="Previous day">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="date"
          value={day}
          max={data.latestDay}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
        />
        <button
          type="button"
          onClick={() => setDay(addDays(day, 1))}
          disabled={day >= data.latestDay}
          className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          aria-label="Next day"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="ml-auto text-sm text-slate-400">
          Day total: <b className="text-white tabular-nums">{usd(dayTotal)}</b>
        </span>
      </div>

      <p className="rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2 text-xs text-sky-200">
        Type what each company&apos;s dashboard shows for this day, in <b>US dollars</b>. If a company pays in another
        currency, convert it to dollars first. Saving a day again <b>replaces</b> that day&apos;s figure — it never adds
        to it. Leave a box empty to skip a company.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2">Platform</th>
              <th className="px-3 py-2">Amount (USD)</th>
              <th className="px-3 py-2">Note (optional)</th>
              <th className="px-3 py-2">Saved</th>
            </tr>
          </thead>
          <tbody>
            {active.map((p) => {
              const v = vals[p.id] ?? { amount: "", note: "" };
              const voided = p.entry?.status === "VOID";
              return (
                <tr key={p.id} className="border-t border-slate-800 align-top">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2 font-semibold text-white">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color ?? "#64748b" }} />
                      {p.name}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {p.type}
                      {p.avg30 !== null ? ` · 30-day avg ${usd(p.avg30)}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">$</span>
                      <input
                        inputMode="decimal"
                        value={v.amount}
                        disabled={!data.can.enter}
                        onChange={(e) =>
                          setVals((s) => ({ ...s, [p.id]: { ...v, amount: e.target.value.replace(/[^0-9.]/g, "") } }))
                        }
                        placeholder="0.00"
                        className={cn(inputCls, "w-32 tabular-nums")}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={v.note}
                      disabled={!data.can.enter}
                      maxLength={300}
                      onChange={(e) => setVals((s) => ({ ...s, [p.id]: { ...v, note: e.target.value } }))}
                      className={inputCls}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {!p.entry ? (
                      <span className="text-amber-300">Not entered</span>
                    ) : voided ? (
                      <span className="text-red-300">Voided — {p.entry.voidReason}</span>
                    ) : (
                      <span className="text-emerald-300">
                        {usd(p.entry.amountUsd)}
                        {data.can.approve && (
                          <button type="button" onClick={() => voidEntry(p)} className="ml-2 text-slate-400 underline hover:text-red-300">
                            Void
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.can.enter ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy || changed.length === 0}
            onClick={() => save(false)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save {changed.length > 0 ? `${changed.length} figure(s)` : ""}
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">You can view these figures; entering them needs the &ldquo;Record entries&rdquo; permission.</p>
      )}

      {confirm && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">These look unusually large — please check for an extra zero:</p>
          <ul className="mt-1 list-disc pl-5">
            {confirm.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setConfirm(null)} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs">
              Let me fix it
            </button>
            <button type="button" onClick={() => save(true)} disabled={busy} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black">
              Yes, the amounts are right
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Month-end payout ──────────────────────────────────────────────────── */

function MonthTab() {
  const [period, setPeriod] = useState(monthOf(addDays(todayUtc().slice(0, 8) + "01", -1)));
  const [rows, setRows] = useState<MonthRow[] | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  const [edit, setEdit] = useState<Record<string, { actual: string; received: string; reference: string }>>({});

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/finance/platform-income?view=month&period=${period}`);
    const j = await r.json().catch(() => null);
    if (!r.ok) return toast.error("Could not load", { description: j?.error ?? "Try again" });
    setRows(j.rows as MonthRow[]);
    setCanApprove(!!j.canApprove);
    const e: Record<string, { actual: string; received: string; reference: string }> = {};
    for (const x of j.rows as MonthRow[]) {
      e[x.platformId] = {
        actual: x.actualUsd === null ? "" : String(x.actualUsd),
        received: x.receivedAt?.slice(0, 10) ?? "",
        reference: x.reference ?? "",
      };
    }
    setEdit(e);
  }, [period]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set only after the fetch resolves
    void load();
  }, [load]);

  const save = async (row: MonthRow) => {
    const e = edit[row.platformId];
    const r = await fetch("/api/admin/finance/platform-income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "payout.save",
        platformId: row.platformId,
        period,
        actualUsd: e.actual.trim(),
        receivedAt: e.received || null,
        reference: e.reference,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error("Not saved", { description: j.error ?? "Try again" });
    toast.success(`${row.name} — ${period} payout saved`);
    await load();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={period}
          max={monthOf(todayUtc())}
          onChange={(e) => e.target.value && setPeriod(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
        />
      </div>
      <p className="rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2 text-xs text-sky-200">
        Daily figures are each company&apos;s estimate. When the month&apos;s real payment arrives, enter it here (in
        dollars). The difference becomes a <b>month-end adjustment</b> on the month&apos;s last day, so that month
        totals exactly what was paid in every report.
      </p>
      {!rows ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">No platforms.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60 text-left text-xs text-slate-400">
              <tr>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2 text-right">Daily total</th>
                <th className="px-3 py-2">Actually paid (USD)</th>
                <th className="px-3 py-2">Received on</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2 text-right">Adjustment</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const e = edit[row.platformId] ?? { actual: "", received: "", reference: "" };
                return (
                  <tr key={row.platformId} className="border-t border-slate-800">
                    <td className="px-3 py-2 font-semibold text-white">
                      {row.name}
                      <span className="block text-xs font-normal text-slate-500">{row.days} day(s) entered</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-200">{usd(row.estimatedUsd)}</td>
                    <td className="px-3 py-2">
                      <input
                        inputMode="decimal"
                        value={e.actual}
                        disabled={!canApprove}
                        onChange={(ev) =>
                          setEdit((s) => ({ ...s, [row.platformId]: { ...e, actual: ev.target.value.replace(/[^0-9.]/g, "") } }))
                        }
                        placeholder="not received yet"
                        className={cn(inputCls, "w-36 tabular-nums")}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={e.received}
                        disabled={!canApprove}
                        onChange={(ev) => setEdit((s) => ({ ...s, [row.platformId]: { ...e, received: ev.target.value } }))}
                        className={cn(inputCls, "w-40")}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={e.reference}
                        disabled={!canApprove}
                        maxLength={120}
                        onChange={(ev) => setEdit((s) => ({ ...s, [row.platformId]: { ...e, reference: ev.target.value } }))}
                        placeholder="bank / payment id"
                        className={cn(inputCls, "w-40")}
                      />
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        row.adjustmentUsd === null ? "text-slate-500" : row.adjustmentUsd < 0 ? "text-red-300" : "text-emerald-300"
                      )}
                    >
                      {row.adjustmentUsd === null ? "—" : `${row.adjustmentUsd > 0 ? "+" : ""}${usd(row.adjustmentUsd)}`}
                    </td>
                    <td className="px-3 py-2">
                      {canApprove && (
                        <button
                          type="button"
                          disabled={e.actual.trim() === ""}
                          onClick={() => save(row)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          Save
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!canApprove && <p className="text-xs text-slate-500">Recording a payout needs the &ldquo;Approve &amp; pay&rdquo; permission.</p>}
    </div>
  );
}

/* ── Report ────────────────────────────────────────────────────────────── */

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This week" },
  { id: "7d", label: "Last 7 days" },
  { id: "month", label: "This month" },
  { id: "lastmonth", label: "Last month" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom" },
];

function ReportTab() {
  const [preset, setPreset] = useState("month");
  const [range, setRange] = useState(presetRange("month"));
  const [rep, setRep] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fetch's loading flag
    setLoading(true);
    fetch(`/api/admin/finance/platform-income?view=report&from=${range.from}&to=${range.to}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (cancelled) return;
        if (!r.ok) {
          toast.error("Could not load", { description: j?.error ?? "Try again" });
          return;
        }
        setRep(j as Report);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const chart = useMemo(() => {
    if (!rep?.daily) return [];
    const days = rep.daily.days;
    // Long ranges are shown per month so the bars stay readable.
    if (days.length <= 62) return days.map((d) => ({ date: d.date.slice(5), usd: Math.round(d.usd * 100) / 100 }));
    const byMonth = new Map<string, number>();
    for (const d of days) byMonth.set(d.date.slice(0, 7), (byMonth.get(d.date.slice(0, 7)) ?? 0) + d.usd);
    return [...byMonth.entries()].map(([date, v]) => ({ date, usd: Math.round(v * 100) / 100 }));
  }, [rep]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPreset(p.id);
              if (p.id !== "custom") setRange(presetRange(p.id));
            }}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              preset === p.id ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            )}
          >
            {p.label}
          </button>
        ))}
        {preset === "custom" && (
          <span className="flex items-center gap-1.5">
            <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white" />
            <span className="text-slate-500">→</span>
            <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white" />
          </span>
        )}
        <a
          href={`/api/admin/finance/platform-income?view=csv&from=${range.from}&to=${range.to}`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </a>
      </div>

      {!rep || loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {rep.from} → {rep.to}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card title="Platform's own income" value={rep.own.usd} hint="Ads, marketplace, courses, subscriptions… counted automatically" />
            <Card title="Third-party platforms" value={rep.thirdParty.usd} hint="AdSense, Adsterra… entered daily (+ month-end payouts)" />
            <Card title="Total income" value={rep.totalUsd} hint="Own + third-party — the figure every finance report uses" strong />
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="mb-2 text-sm font-semibold text-white">Third-party income {chart.length > 0 && rep.daily && rep.daily.days.length > 62 ? "by month" : "by day"}</p>
            <SeriesChart
              data={chart}
              series={[{ key: "usd", label: "Third-party income", color: "#22c55e" }]}
              kind="bar"
              money
              legend={false}
              height={220}
              emptyLabel="Nothing entered in this range."
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="mb-2 text-sm font-semibold text-white">Third-party platforms</p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-1">Platform</th>
                    <th className="py-1 text-right">Daily</th>
                    <th className="py-1 text-right">Adjust.</th>
                    <th className="py-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rep.thirdParty.platforms
                    .filter((p) => p.usd !== 0 || p.days > 0 || p.isActive)
                    .map((p) => (
                      <tr key={p.id} className="border-t border-slate-800">
                        <td className="py-1.5 text-white">
                          {p.name}
                          <span className="block text-xs text-slate-500">
                            {p.type} · {p.days} day(s)
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-300">{usd(p.estimatedUsd)}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">{p.adjustmentUsd ? usd(p.adjustmentUsd) : "—"}</td>
                        <td className="py-1.5 text-right tabular-nums font-semibold text-emerald-300">{usd(p.usd)}</td>
                      </tr>
                    ))}
                  <tr className="border-t-2 border-slate-700 font-bold">
                    <td className="py-1.5 text-white">Total</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-200">{usd(rep.thirdParty.estimatedUsd)}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-300">{rep.thirdParty.adjustmentUsd ? usd(rep.thirdParty.adjustmentUsd) : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-emerald-300">{usd(rep.thirdParty.usd)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="mb-2 text-sm font-semibold text-white">Platform&apos;s own income</p>
              <table className="w-full text-sm">
                <tbody>
                  {rep.own.streams.map((s) => (
                    <tr key={s.key} className="border-t border-slate-800 first:border-t-0">
                      <td className="py-1.5 text-white">{s.label}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-300">
                        {s.measured ? usd(s.usd) : <span className="text-slate-600">no activity</span>}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-700 font-bold">
                    <td className="py-1.5 text-white">Total</td>
                    <td className="py-1.5 text-right tabular-nums text-emerald-300">{usd(rep.own.usd)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {rep.daily && rep.daily.missing.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-semibold text-amber-200">
                Days with no figure entered ({rep.daily.missing.length}) — the totals above are missing these
              </p>
              <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs text-amber-100/90">
                {rep.daily.missing
                  .slice()
                  .reverse()
                  .map((m) => (
                    <li key={m.date}>
                      <b className="tabular-nums">{m.date}</b> — {m.platforms.join(", ")}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Card({ title, value, hint, strong }: { title: string; value: number; hint: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4", strong ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-800 bg-slate-900/40")}>
      <p className="text-xs font-semibold text-slate-400">{title}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", strong ? "text-emerald-300" : "text-white")}>{usd(value)}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

/* ── Platforms ─────────────────────────────────────────────────────────── */

function PlatformsTab({ data, reload }: { data: DayData; reload: () => Promise<void> | void }) {
  const [form, setForm] = useState({ name: "", type: "Ad network", color: "#22c55e", networkKey: "" });
  const [busy, setBusy] = useState(false);
  const can = data.can.settings;

  const post = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/finance/platform-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Failed");
      toast.success(ok);
      await reload();
      return true;
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : "Try again" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const taken = new Set(data.platforms.map((p) => p.networkKey).filter(Boolean));

  return (
    <div className="space-y-4">
      {can && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <p className="text-sm font-semibold text-white">Add a platform</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-slate-400">
              Company name
              <input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Google AdSense" className={cn(inputCls, "mt-1")} />
            </label>
            <label className="text-xs text-slate-400">
              Type
              <input value={form.type} list="pi-types" maxLength={40} onChange={(e) => setForm({ ...form, type: e.target.value })} className={cn(inputCls, "mt-1")} />
              <datalist id="pi-types">
                {TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="text-xs text-slate-400">
              Linked ad network (optional)
              <select value={form.networkKey} onChange={(e) => setForm({ ...form, networkKey: e.target.value })} className={cn(inputCls, "mt-1")}>
                <option value="">— none —</option>
                {data.networks.map((n) => (
                  <option key={n.id} value={n.id} disabled={taken.has(n.id)}>
                    {n.name}
                    {taken.has(n.id) ? " (linked)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Colour
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-800" />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Only outside companies. The platform&apos;s own income (ads you sell, marketplace, courses, subscriptions,
            badges, boosts) is counted automatically — adding it here would count it twice, so it is refused.
            Linking a network lets Ad Manager show its eCPM.
          </p>
          <button
            type="button"
            disabled={busy || form.name.trim().length < 2}
            onClick={async () => {
              const ok = await post(
                { action: "platform.create", name: form.name, type: form.type, color: form.color, networkKey: form.networkKey || null },
                `${form.name} added`
              );
              if (ok) setForm({ name: "", type: "Ad network", color: "#22c55e", networkKey: "" });
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add platform
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2">Platform</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Linked network</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.platforms.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                  No platforms yet.
                </td>
              </tr>
            )}
            {data.platforms.map((p) => (
              <tr key={p.id} className="border-t border-slate-800">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2 font-semibold text-white">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color ?? "#64748b" }} />
                    {p.name}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-300">{p.type}</td>
                <td className="px-3 py-2">
                  {can ? (
                    <select
                      value={p.networkKey ?? ""}
                      disabled={busy}
                      onChange={(e) => post({ action: "platform.update", id: p.id, networkKey: e.target.value || null }, "Link saved")}
                      className={cn(inputCls, "w-48 py-1")}
                    >
                      <option value="">— none —</option>
                      {data.networks.map((n) => (
                        <option key={n.id} value={n.id} disabled={taken.has(n.id) && n.id !== p.networkKey}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-slate-400">{data.networks.find((n) => n.id === p.networkKey)?.name ?? "—"}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {can ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => post({ action: "platform.update", id: p.id, isActive: !p.isActive }, p.isActive ? `${p.name} switched off` : `${p.name} switched on`)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold",
                        p.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"
                      )}
                    >
                      {p.isActive ? "Active" : "Off"}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">{p.isActive ? "Active" : "Off"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        A platform is never deleted — its income rows are the record. Switch it off to stop entering income for it;
        its past income stays in every report.
      </p>
    </div>
  );
}
