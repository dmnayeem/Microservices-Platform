"use client";
import { usd } from "@/lib/utils";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { TrendingUp } from "lucide-react";

export interface RevenueTrendChartProps {
  /** Array of [day-label, revenue] tuples, oldest first. */
  data: Array<{ label: string; revenue: number }>;
  title?: string;
  days?: number;
}

export function RevenueTrendChartInner({
  data,
  title = "Revenue (Last 30 Days)",
  days = 30,
}: RevenueTrendChartProps) {
  const total = data.reduce((acc, d) => acc + d.revenue, 0);
  const avg = data.length ? total / data.length : 0;
  const peak = Math.max(0, ...data.map((d) => d.revenue));

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            {title}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            ${total.toFixed(0)} total · {usd(avg)} avg/day · ${peak.toFixed(0)} peak
          </p>
        </div>
        <span className="hidden sm:inline-block px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 text-xs font-medium">
          {days}d
        </span>
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="revBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                <stop offset="100%" stopColor="#0d9488" stopOpacity={0.55} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="#1e293b"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="label"
              stroke="#475569"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              interval={Math.max(1, Math.floor(data.length / 8))}
            />
            <YAxis
              stroke="#475569"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={36}
              tickFormatter={(v) => {
                const n = Number(v ?? 0);
                return usd(n, { compact: true });
              }}
            />
            <Tooltip
              cursor={{ fill: "#1e293b", opacity: 0.4 }}
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#cbd5e1", fontWeight: 600 }}
              itemStyle={{ color: "#34d399" }}
              formatter={(v) => [`${usd(Number(v ?? 0))}`, "Revenue"]}
            />
            <Bar
              dataKey="revenue"
              fill="url(#revBar)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
