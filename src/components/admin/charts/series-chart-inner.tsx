"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usd } from "@/lib/utils";

/**
 * The generic admin chart the repo did not have.
 *
 * There were four recharts files, each hardcoded to one set of data keys
 * (`users`/`tasks`/`withdrawals`, `revenue`, `count`), so every new chart meant
 * a new file. This takes a series list instead.
 *
 * **Gradient ids are per-instance.** `revenue-trend-chart-inner` hardcodes
 * `id="revBar"` and `user-growth-chart-inner` hardcodes `id="userGrowthFill"`,
 * so rendering two of either on one page produces duplicate SVG ids and the
 * second chart silently borrows the first one's fill. A console with several
 * charts on a tab hits that immediately, hence `useId()`.
 *
 * One tooltip and axis convention, taken from the analytics charts, so a page
 * mixing chart types does not look like two different products.
 */

export interface ChartSeries {
  /** Key into each data point. */
  key: string;
  label: string;
  /** Any CSS colour. Source colours come from `SOURCE_META` where relevant. */
  color: string;
  /** Render this series as money rather than a plain count. */
  money?: boolean;
}

export interface SeriesChartProps {
  /** Each point needs the `x` field plus one field per series key. */
  data: Array<Record<string, string | number>>;
  series: ChartSeries[];
  /** Field holding the x-axis label. Defaults to `date`. */
  xKey?: string;
  kind?: "line" | "bar" | "area";
  height?: number;
  /** Format the y axis and tooltip as USD. */
  money?: boolean;
  /** Hide the legend when a single series makes it redundant. */
  legend?: boolean;
  /** Shown centred when there is nothing to plot. */
  emptyLabel?: string;
}

const GRID = { stroke: "rgb(30 41 59)", strokeDasharray: "3 3" } as const;
const AXIS = {
  stroke: "rgb(100 116 139)",
  fontSize: 11,
  tickLine: false,
} as const;
const TOOLTIP_STYLE = {
  backgroundColor: "rgb(15 23 42)",
  border: "1px solid rgb(51 65 85)",
  borderRadius: "8px",
  fontSize: "12px",
} as const;

const fmtMoney = (v: number) => usd(v, { compact: true });

export function SeriesChartInner({
  data,
  series,
  xKey = "date",
  kind = "line",
  height = 260,
  money = false,
  legend = true,
  emptyLabel = "No data in this range.",
}: SeriesChartProps) {
  // Unique per rendered instance — see the note on gradient ids above.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  // "Every value is zero" is a real answer and looks identical to "no rows" on
  // a chart, so say which one it is rather than drawing a flat line.
  const hasAny = data.some((d) =>
    series.some((s) => Number(d[s.key] ?? 0) !== 0)
  );
  if (data.length === 0 || !hasAny) {
    return (
      <div
        className="grid place-items-center text-xs text-slate-500"
        style={{ height }}
      >
        {data.length === 0 ? emptyLabel : "No activity in this range."}
      </div>
    );
  }

  const yTick = money ? fmtMoney : undefined;
  // recharts types `name` as possibly-undefined, so it is coerced here rather
  // than asserted away.
  const tipFormatter = (v: unknown, name: unknown) => {
    const label = String(name ?? "");
    const s = series.find((x) => x.label === label || x.key === label);
    const n = Number(v ?? 0);
    return [
      s?.money || money ? usd(n) : n.toLocaleString(),
      s?.label ?? label,
    ] as [string, string];
  };

  const common = (
    <>
      <CartesianGrid {...GRID} />
      <XAxis dataKey={xKey} {...AXIS} />
      <YAxis {...AXIS} width={money ? 52 : 40} tickFormatter={yTick} />
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        formatter={tipFormatter}
        cursor={
          kind === "bar"
            ? { fill: "rgb(30 41 59 / 0.4)" }
            : { stroke: "rgb(51 65 85)" }
        }
      />
      {legend && series.length > 1 && (
        <Legend wrapperStyle={{ fontSize: 11, color: "rgb(148 163 184)" }} />
      )}
    </>
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      {kind === "bar" ? (
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          {common}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      ) : kind === "area" ? (
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient
                key={s.key}
                id={`fill-${uid}-${s.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={s.color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          {common}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#fill-${uid}-${s.key})`}
            />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          {common}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  data: DonutSlice[];
  height?: number;
  money?: boolean;
  emptyLabel?: string;
}

export function DonutChartInner({
  data,
  height = 260,
  money = false,
  emptyLabel = "Nothing to show yet.",
}: DonutChartProps) {
  // A donut of all-zero slices renders as an invisible ring — worse than saying
  // there is nothing, because it looks like a rendering failure.
  const live = data.filter((d) => d.value > 0);
  if (live.length === 0) {
    return (
      <div
        className="grid place-items-center text-xs text-slate-500"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={live}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
        >
          {live.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: unknown, name: unknown) =>
            [
              money ? usd(Number(v ?? 0)) : Number(v ?? 0).toLocaleString(),
              String(name ?? ""),
            ] as [string, string]
          }
        />
        <Legend wrapperStyle={{ fontSize: 11, color: "rgb(148 163 184)" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
