"use client";

import dynamic from "next/dynamic";
import type { UserGrowthChartProps } from "./user-growth-chart-inner";

// recharts is heavy (~90KB) and this chart sits on admin-only dashboards. Load
// the recharts subtree lazily so it stays out of the page's initial chunk.
const Inner = dynamic(
  () => import("./user-growth-chart-inner").then((m) => m.UserGrowthChartInner),
  {
    ssr: false,
    loading: () => (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 h-full min-h-56 animate-pulse" />
    ),
  }
);

export function UserGrowthChart(props: UserGrowthChartProps) {
  return <Inner {...props} />;
}
