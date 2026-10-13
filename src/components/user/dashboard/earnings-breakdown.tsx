"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { cn, usd } from "@/lib/utils";
import type { BreakdownRange, EarningsBreakdown } from "@/lib/dashboard-earnings";

/**
 * "Where my points came from" for the signed-in member: a range picker
 * (Today / 7 days / 30 days / Custom), a donut of sources, a trend line and a
 * table. The first paint is the server's 30-day figure; every other range is a
 * request to /api/me/earnings, which reads the member's own ledger only.
 *
 * Charts are plain CSS/SVG — the admin chart library is not shipped to members.
 */

/** Swatch class (from POINT_SOURCE_META) → a colour usable in CSS/SVG. */
const SWATCH_HEX: Record<string, string> = {
  "bg-indigo-500": "#6366f1",
  "bg-violet-500": "#8b5cf6",
  "bg-amber-500": "#f59e0b",
  "bg-teal-500": "#14b8a6",
  "bg-cyan-500": "#06b6d4",
  "bg-sky-500": "#0ea5e9",
  "bg-blue-500": "#3b82f6",
  "bg-fuchsia-500": "#d946ef",
  "bg-purple-500": "#a855f7",
  "bg-pink-500": "#ec4899",
  "bg-lime-500": "#84cc16",
  "bg-rose-500": "#f43f5e",
  "bg-emerald-500": "#10b981",
  "bg-green-500": "#22c55e",
  "bg-yellow-500": "#eab308",
  "bg-orange-500": "#f97316",
  "bg-red-500": "#ef4444",
  "bg-lime-600": "#65a30d",
  "bg-stone-400": "#a8a29e",
  "bg-slate-400": "#94a3b8",
  "bg-emerald-600": "#059669",
  "bg-red-600": "#dc2626",
  "bg-slate-600": "#475569",
};
const colorOf = (swatch: string) => SWATCH_HEX[swatch] ?? "#64748b";

const RANGES: Array<{ key: BreakdownRange; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "custom", label: "Custom" },
];

const fmt = (n: number) => n.toLocaleString("en-US");

export function EarningsBreakdownCard({
  initial,
  pointsPerUsd,
}: {
  initial: EarningsBreakdown;
  pointsPerUsd: number;
}) {
  const [data, setData] = useState(initial);
  const [rate, setRate] = useState(pointsPerUsd || 1);
  const [range, setRange] = useState<BreakdownRange>(initial.range);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the newest request may write — a slow "30 days" must not overwrite a
  // quick "Today" the member tapped after it.
  const seq = useRef(0);
  // The server's "today" (UTC): the latest day a custom range may end on.
  const maxDay = initial.to;

  async function load(r: BreakdownRange, f?: string, t?: string) {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ range: r });
    if (r === "custom" && f && t) {
      qs.set("from", f);
      qs.set("to", t);
    }
    try {
      const res = await fetch(`/api/me/earnings?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | (EarningsBreakdown & { pointsPerUsd?: number; error?: string })
        | null;
      if (id !== seq.current) return;
      if (!res.ok || !json || json.error) {
        setError(json?.error ?? "Could not load your earnings. Try again.");
        return;
      }
      setData(json);
      if (json.pointsPerUsd) setRate(json.pointsPerUsd);
    } catch {
      if (id === seq.current) setError("Could not load your earnings. Check your connection.");
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }

  function pick(r: BreakdownRange) {
    setRange(r);
    if (r !== "custom") void load(r);
  }

  const $ = (p: number) => usd(p / rate);
  const periodLabel =
    data.from === data.to ? data.from : `${data.from} → ${data.to}`;

  return (
    <section className="app-card min-w-0" aria-busy={loading}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="t-section text-white">Earnings by source</h2>
        <Link
          href="/wallet"
          className="app-press app-tap-row inline-flex items-center px-2.5 -mr-2 rounded-(--app-r-chip) t-meta font-extrabold text-(--app-accent-ink) hover:bg-(--app-nav-wash)"
        >
          Wallet
        </Link>
      </div>

      {/* Range picker */}
      <div role="tablist" aria-label="Date range" className="grid grid-cols-4 gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={range === r.key}
            onClick={() => pick(r.key)}
            className={cn(
              "app-press min-h-11 rounded-(--app-r-control) px-2 text-xs font-bold sm:text-sm",
              range === r.key
                ? "bg-(--app-nav-wash) text-(--app-ink) ring-1 ring-(--app-accent-edge)"
                : "bg-(--app-surface-2) text-(--app-ink-2) hover:text-(--app-ink)"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {range === "custom" && (
        <form
          className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (from && to && from <= to) void load("custom", from, to);
            else setError("The start date must be on or before the end date.");
          }}
        >
          <label className="min-w-0 text-xs font-semibold text-(--app-ink-3)">
            From
            <input
              type="date"
              value={from}
              max={to || maxDay}
              onChange={(ev) => setFrom(ev.target.value)}
              className="mt-1 block min-h-11 w-full rounded-(--app-r-control) bg-(--app-field-bg) px-2 text-sm text-(--app-ink)"
            />
          </label>
          <label className="min-w-0 text-xs font-semibold text-(--app-ink-3)">
            To
            <input
              type="date"
              value={to}
              min={from}
              max={maxDay}
              onChange={(ev) => setTo(ev.target.value)}
              className="mt-1 block min-h-11 w-full rounded-(--app-r-control) bg-(--app-field-bg) px-2 text-sm text-(--app-ink)"
            />
          </label>
          <button
            type="submit"
            className="app-press col-span-2 min-h-11 rounded-(--app-r-control) bg-(--app-cta) px-4 text-sm font-bold text-(--app-on-cta) hover:bg-(--app-cta-hover) sm:col-span-1"
          >
            Show
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-red-400">
          {error}
        </p>
      )}

      <div className={cn("transition-opacity", loading && "opacity-50")}>
        {/* Total */}
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="t-meta text-(--app-ink-3)">{periodLabel} · UTC</p>
          <p className="t-figure-sm text-white">
            {fmt(data.totalPoints)} <span className="text-xs font-semibold text-(--app-ink-3)">pts</span>
            <span className="ml-2 text-xs font-semibold text-(--app-ink-3)">≈ {$(data.totalPoints)}</span>
          </p>
        </div>

        {data.totalPoints === 0 ? (
          <div className="mt-4 rounded-(--app-r-control) bg-(--app-surface-2) p-4 text-center">
            <p className="text-sm font-semibold text-(--app-ink-2)">No earnings in this range</p>
            <p className="mt-1 text-xs text-(--app-ink-3)">
              Points are paid when your task work is approved.
            </p>
            <Link
              href="/tasks"
              className="app-press app-tap-row mt-2 inline-flex items-center rounded-(--app-r-chip) px-3 text-sm font-bold text-(--app-accent-ink) hover:bg-(--app-nav-wash)"
            >
              Find a task
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
              <Donut data={data} />
              <TrendLine data={data} />
            </div>
            <SourceTable data={data} usdOf={$} />
          </>
        )}

        {data.truncated && (
          <p className="mt-2 text-xs text-(--app-ink-3)">
            This range has more rows than we read at once; the oldest are not counted. Pick a shorter range.
          </p>
        )}
      </div>
    </section>
  );
}

function Donut({ data }: { data: EarningsBreakdown }) {
  const ends = data.sources.reduce<number[]>(
    (out, s) => [...out, (out[out.length - 1] ?? 0) + s.points],
    []
  );
  const stops = data.sources.map((s, i) => {
    const a = ((ends[i - 1] ?? 0) / data.totalPoints) * 360;
    const b = (ends[i] / data.totalPoints) * 360;
    return `${colorOf(s.swatch)} ${a}deg ${b}deg`;
  });
  const top = data.sources[0];
  return (
    <div className="flex items-center gap-3 sm:flex-col sm:gap-2">
      <div
        role="img"
        aria-label={`Share by source: ${data.sources.map((s) => `${s.label} ${s.pct}%`).join(", ")}`}
        className="relative h-32 w-32 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
      >
        <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-(--app-surface)">
          <span className="text-xs text-(--app-ink-3)">Top</span>
          <span className="text-sm font-extrabold tabular-nums text-white">{top ? `${top.pct}%` : "—"}</span>
        </div>
      </div>
      {top && (
        <p className="min-w-0 text-xs text-(--app-ink-2) sm:text-center">
          Most from <span className="font-bold text-white">{top.label}</span>
        </p>
      )}
    </div>
  );
}

function TrendLine({ data }: { data: EarningsBreakdown }) {
  const pts = data.trend;
  const W = 300;
  const H = 100;
  const max = Math.max(1, ...pts.map((p) => p.points));
  const x = (i: number) => (pts.length <= 1 ? W / 2 : (i / (pts.length - 1)) * W);
  const y = (v: number) => H - (v / max) * (H - 6) - 3;
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.points).toFixed(1)}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  const best = pts.reduce((b, p) => (p.points > b.points ? p : b), pts[0] ?? { label: "", points: 0, key: "" });
  const mid = pts[Math.floor(pts.length / 2)];

  return (
    <div className="min-w-0">
      <p className="t-meta mb-1 text-(--app-ink-3)">
        Points per {data.bucket === "hour" ? "hour" : "day"} · best {fmt(best.points)} ({best.label})
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-28 w-full overflow-visible"
        role="img"
        aria-label={`Points per ${data.bucket}, highest ${fmt(max)}`}
      >
        <line x1="0" y1={H} x2={W} y2={H} stroke="var(--app-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polygon points={area} fill="var(--app-accent-ink)" opacity="0.12" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--app-accent-ink)"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-(--app-ink-3)">
        <span>{pts[0]?.label}</span>
        {pts.length > 2 && <span>{mid?.label}</span>}
        <span>{pts[pts.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function SourceTable({
  data,
  usdOf,
}: {
  data: EarningsBreakdown;
  usdOf: (p: number) => string;
}) {
  return (
    <div className="mt-4 -mx-1 overflow-x-auto">
      <table className="w-full min-w-0 text-left text-sm">
        <caption className="sr-only">Earnings by source</caption>
        <thead>
          <tr className="text-xs text-(--app-ink-3)">
            <th scope="col" className="px-1 py-2 font-semibold">Source</th>
            <th scope="col" className="px-1 py-2 text-right font-semibold">Points</th>
            <th scope="col" className="px-1 py-2 text-right font-semibold">Rows</th>
            <th scope="col" className="px-1 py-2 text-right font-semibold">Share</th>
          </tr>
        </thead>
        <tbody>
          {data.sources.map((s) => (
            <tr key={s.source} className="border-t border-(--app-line-subtle)">
              <td className="px-1 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(s.swatch) }} />
                  <span className="truncate text-(--app-ink-2)">{s.label}</span>
                </span>
              </td>
              <td className="px-1 py-2 text-right tabular-nums">
                <span className="block font-bold text-white">{fmt(s.points)}</span>
                <span className="block text-xs text-(--app-ink-3)">≈ {usdOf(s.points)}</span>
              </td>
              <td className="px-1 py-2 text-right tabular-nums text-(--app-ink-2)">{fmt(s.count)}</td>
              <td className="px-1 py-2 text-right tabular-nums text-(--app-ink-2)">{s.pct}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-(--app-line) text-xs">
            <td className="px-1 py-2 font-bold text-(--app-ink-2)">Total</td>
            <td className="px-1 py-2 text-right font-bold tabular-nums text-white">{fmt(data.totalPoints)}</td>
            <td className="px-1 py-2 text-right tabular-nums text-(--app-ink-2)">{fmt(data.totalRows)}</td>
            <td className="px-1 py-2 text-right tabular-nums text-(--app-ink-2)">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
