"use client";
import { usd } from "@/lib/utils";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DailyPoint {
  date: string;
  users: number;
  tasks: number;
  withdrawals: number;
}

interface TaskBreakdown {
  name: string;
  value: number;
}

interface TrafficPoint {
  date: string;
  views: number;
  visitors: number;
}

export interface AnalyticsChartsProps {
  daily: DailyPoint[];
  taskBreakdown?: TaskBreakdown[];
  traffic?: TrafficPoint[];
}

const PIE_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
];

const TOOLTIP_STYLE = {
  backgroundColor: "rgb(15 23 42)",
  border: "1px solid rgb(51 65 85)",
  borderRadius: "8px",
  fontSize: "12px",
};

export function AnalyticsChartsInner({
  daily,
  taskBreakdown,
  traffic,
}: AnalyticsChartsProps) {
  const breakdown = (taskBreakdown ?? []).filter((b) => b.value > 0);

  return (
    <div className="space-y-4">
      {/* Traffic trend — pageviews & visitors per day */}
      {traffic && traffic.length > 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">
            Traffic — Pageviews & Visitors
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart
              data={traffic}
              margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(30 41 59)" />
              <XAxis dataKey="date" stroke="rgb(100 116 139)" fontSize={11} tickLine={false} />
              <YAxis stroke="rgb(100 116 139)" fontSize={11} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "rgb(51 65 85)" }} />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line type="monotone" dataKey="views" name="Pageviews" stroke="#06b6d4" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="visitors" name="Visitors" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* User & Task line chart + Revenue bar chart side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">
            User Growth & Tasks
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart
              data={daily}
              margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(30 41 59)" />
              <XAxis
                dataKey="date"
                stroke="rgb(100 116 139)"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                stroke="rgb(100 116 139)"
                fontSize={11}
                tickLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ stroke: "rgb(51 65 85)" }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Line
                type="monotone"
                dataKey="users"
                name="New Users"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="tasks"
                name="Tasks Done"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">
            Withdrawals (USD)
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={daily}
              margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(30 41 59)" />
              <XAxis
                dataKey="date"
                stroke="rgb(100 116 139)"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                stroke="rgb(100 116 139)"
                fontSize={11}
                tickLine={false}
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: "rgb(30 41 59 / 0.4)" }}
                formatter={(v) => [`${usd(Number(v))}`, "Withdrawn"]}
              />
              <Bar
                dataKey="withdrawals"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Task type breakdown pie */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
        <h3 className="text-sm font-semibold text-white mb-3">
          Task Type Distribution
        </h3>
        {breakdown.length === 0 ? (
          <p className="text-sm text-slate-500 py-16 text-center">
            No completed task submissions in this period.
          </p>
        ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={breakdown}
              cx="50%"
              cy="50%"
              outerRadius={100}
              innerRadius={60}
              paddingAngle={2}
              label={({ name, value }) => `${name}: ${value}`}
              labelLine={false}
              dataKey="value"
            >
              {breakdown.map((_, idx) => (
                <Cell
                  key={`cell-${idx}`}
                  fill={PIE_COLORS[idx % PIE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend
              wrapperStyle={{ fontSize: "12px" }}
              iconType="circle"
              iconSize={8}
            />
          </PieChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
