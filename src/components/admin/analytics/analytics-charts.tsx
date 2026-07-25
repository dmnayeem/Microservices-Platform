"use client";

import dynamic from "next/dynamic";
import type { AnalyticsChartsProps } from "./analytics-charts-inner";

// recharts is heavy (~90KB) and this analytics view is admin-only. Load the
// recharts subtree lazily so it stays out of the analytics page's initial chunk.
const Inner = dynamic(
  () => import("./analytics-charts-inner").then((m) => m.AnalyticsChartsInner),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 h-72 animate-pulse" />
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 h-72 animate-pulse" />
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 h-80 animate-pulse" />
      </div>
    ),
  }
);

export function AnalyticsCharts(props: AnalyticsChartsProps) {
  return <Inner {...props} />;
}
