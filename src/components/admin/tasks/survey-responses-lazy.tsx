"use client";

import dynamic from "next/dynamic";

/**
 * Lazy wrapper for the survey-responses view.
 *
 * `survey-responses-view.tsx` is ~1,000 lines and imports `LineChart`,
 * `BarChart`, `PieChart` and friends from `recharts` **directly** — the only one
 * of the four chart sites in the app that did. The other three
 * (`analytics-charts`, `revenue-trend-chart`, `user-growth-chart`) all wrap an
 * `*-inner` module in `next/dynamic`; this brings the last one in line, so
 * recharts (~90KB) is fetched when an admin actually opens a survey's responses
 * rather than shipping with the page.
 *
 * Wrapping at the usage site rather than splitting the view itself: the charts
 * are interleaved through the component and through `QuestionCard`, so carving
 * them out would be a real refactor of a large file for the same result.
 */
const Inner = dynamic(
  () =>
    import("./survey-responses-view").then((m) => m.SurveyResponsesView),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 rounded-lg bg-slate-800" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl border border-slate-800 bg-slate-900"
            />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-slate-800 bg-slate-900" />
        <div className="h-72 rounded-xl border border-slate-800 bg-slate-900" />
      </div>
    ),
  }
);

export function SurveyResponsesLazy(
  props: React.ComponentProps<typeof Inner>
) {
  return <Inner {...props} />;
}
