"use client";

import dynamic from "next/dynamic";
import type { RevenueTrendChartProps } from "./revenue-trend-chart-inner";

// recharts is heavy (~90KB) and these charts sit on admin-only dashboards. Load
// the recharts subtree lazily so it stays out of the page's initial chunk; the
// server-component pages that render this stay untouched (ssr:false lives here).
const Inner = dynamic(
  () => import("./revenue-trend-chart-inner").then((m) => m.RevenueTrendChartInner),
  {
    ssr: false,
    loading: () => (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 h-full min-h-56 animate-pulse" />
    ),
  }
);

export function RevenueTrendChart(props: RevenueTrendChartProps) {
  return <Inner {...props} />;
}
