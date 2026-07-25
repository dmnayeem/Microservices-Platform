"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export interface UserGrowthChartProps {
  /** Array of [day-label, count] tuples, oldest first. */
  data: Array<{ label: string; count: number }>;
  title?: string;
}

export function UserGrowthChartInner({
  data,
  title = "User Growth (Last 7 Days)",
}: UserGrowthChartProps) {
  const totalNew = data.reduce((acc, d) => acc + d.count, 0);
  const peak = Math.max(0, ...data.map((d) => d.count));

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            +{totalNew.toLocaleString()} new sign-ups
            {peak > 0 && ` · peak ${peak}/day`}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-xs">
          <span className="px-2 py-1 rounded bg-blue-500/15 text-blue-400 font-medium">
            Week
          </span>
          <span className="px-2 py-1 rounded text-slate-500">Month</span>
        </div>
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="userGrowthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
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
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              stroke="#475569"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={28}
              allowDecimals={false}
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
              itemStyle={{ color: "#a78bfa" }}
              formatter={(v) => [`${Number(v ?? 0)} sign-ups`, "Users"]}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#a855f7"
              strokeWidth={2}
              fill="url(#userGrowthFill)"
              dot={{ r: 3, fill: "#a855f7", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#c084fc", strokeWidth: 2, stroke: "#0f172a" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
