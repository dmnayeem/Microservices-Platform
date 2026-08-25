"use client";

import dynamic from "next/dynamic";
import type {
  DonutChartProps,
  SeriesChartProps,
} from "./series-chart-inner";

/**
 * Lazy wrappers for the admin charts.
 *
 * recharts is ~90KB and every chart here is admin-only, so the subtree loads on
 * demand and stays out of the initial chunk. `ssr: false` has to live in a
 * client component, which is the only reason this file is separate from the
 * chart itself — the server pages that render these stay untouched.
 */

const SeriesInner = dynamic(
  () => import("./series-chart-inner").then((m) => m.SeriesChartInner),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 rounded-xl bg-slate-900/60 animate-pulse" />
    ),
  }
);

const DonutInner = dynamic(
  () => import("./series-chart-inner").then((m) => m.DonutChartInner),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 rounded-xl bg-slate-900/60 animate-pulse" />
    ),
  }
);

export function SeriesChart(props: SeriesChartProps) {
  return <SeriesInner {...props} />;
}

export function DonutChart(props: DonutChartProps) {
  return <DonutInner {...props} />;
}

export type { ChartSeries, DonutSlice, SeriesChartProps, DonutChartProps } from "./series-chart-inner";
