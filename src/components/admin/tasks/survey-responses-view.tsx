"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  CheckCircle,
  Clock,
  XCircle,
  ClipboardList,
  Download,
  Star,
} from "lucide-react";
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
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { toast } from "@/lib/toast";
import type { SurveyQuestionType } from "@/lib/survey-tasks";
import { SURVEY_QUESTION_TYPE_LABEL } from "@/lib/survey-tasks";

const TOOLTIP_STYLE = {
  backgroundColor: "rgb(15 23 42)",
  border: "1px solid rgb(51 65 85)",
  borderRadius: "8px",
  fontSize: "12px",
};

interface OptionStat {
  label: string;
  count: number;
  pct: number;
}

interface PerQuestion {
  questionId: string;
  type: SurveyQuestionType;
  prompt: string;
  required: boolean;
  answeredCount: number;
  options?: OptionStat[];
  ratingHistogram?: { value: number; count: number }[];
  ratingAverage?: number;
  textSamples?: { value: string; userId: string; createdAt: string }[];
}

interface AnalyticsData {
  task: {
    id: string;
    title: string;
    pointsReward: number;
    xpReward: number;
  };
  summary: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
  };
  trend: { date: string; count: number }[];
  perQuestion: PerQuestion[];
}

interface Props {
  taskId: string;
  taskTitle: string;
  canExport: boolean;
}

export function SurveyResponsesView({ taskId, taskTitle, canExport }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/admin/tasks/${taskId}/responses/analytics`);
        if (!r.ok) throw new Error(await r.text());
        const d = (await r.json()) as AnalyticsData;
        if (!cancel) setData(d);
      } catch (err) {
        if (!cancel)
          setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [taskId]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/admin/analytics/export?type=survey-responses&taskId=${taskId}`
      );
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `earngpt-survey-${taskId}-responses-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Export downloaded");
    } catch (err) {
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setExporting(false);
    }
  };

  const statusPie = useMemo(() => {
    if (!data) return [];
    return [
      { name: "Approved", value: data.summary.approved, color: "#10b981" },
      { name: "Pending", value: data.summary.pending, color: "#f59e0b" },
      { name: "Rejected", value: data.summary.rejected, color: "#ef4444" },
    ].filter((x) => x.value > 0);
  }, [data]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
        <p className="text-sm text-gray-500">Loading responses…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href={`/admin/tasks/${taskId}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to task
        </Link>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm font-bold text-red-400">
            {error ?? "Couldn't load analytics"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href={`/admin/tasks/${taskId}`}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to task
          </Link>
          <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-purple-400" />
            Survey Responses
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">{taskTitle}</p>
        </div>
        {canExport && (
          <button
            onClick={exportCsv}
            disabled={exporting || data.summary.total === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Export CSV
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          icon={<ClipboardList className="w-5 h-5 text-purple-400" />}
          label="Total"
          value={data.summary.total}
          tone="bg-purple-500/10"
        />
        <SummaryCard
          icon={<CheckCircle className="w-5 h-5 text-emerald-400" />}
          label="Approved"
          value={data.summary.approved}
          tone="bg-emerald-500/10"
        />
        <SummaryCard
          icon={<Clock className="w-5 h-5 text-amber-400" />}
          label="Pending"
          value={data.summary.pending}
          tone="bg-amber-500/10"
        />
        <SummaryCard
          icon={<XCircle className="w-5 h-5 text-red-400" />}
          label="Rejected"
          value={data.summary.rejected}
          tone="bg-red-500/10"
        />
      </div>

      {/* Trend + Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">
            Responses — Last 14 days
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={data.trend.map((p) => ({
                date: format(new Date(p.date), "MMM d"),
                count: p.count,
              }))}
              margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(51 65 85)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "rgb(148 163 184)" }}
                stroke="rgb(71 85 105)"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "rgb(148 163 184)" }}
                stroke="rgb(71 85 105)"
                allowDecimals={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#a855f7"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Status</h3>
          {statusPie.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-xs text-gray-500">
              No responses yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={statusPie}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {statusPie.map((s, i) => (
                    <Cell key={i} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Per-question */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-white">Per Question</h2>
        {data.perQuestion.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-700 bg-gray-950 p-6 text-center text-sm text-gray-500">
            This survey has no questions configured.
          </div>
        )}
        {data.perQuestion.map((q, i) => (
          <QuestionCard key={q.questionId} index={i} q={q} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${tone}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-white tabular-nums">
            {value.toLocaleString()}
          </p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({ index, q }: { index: number; q: PerQuestion }) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-xs font-mono text-gray-500 mt-1 shrink-0 w-6 text-right">
          #{index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{q.prompt}</p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="inline-block text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              {SURVEY_QUESTION_TYPE_LABEL[q.type]}
            </span>
            <span className="text-[10px] text-gray-500">
              · {q.answeredCount} answered
            </span>
            {q.required && (
              <span className="text-[10px] text-red-400">· required</span>
            )}
          </div>
        </div>
      </div>

      {(q.type === "MCQ_SINGLE" ||
        q.type === "DROPDOWN" ||
        q.type === "MCQ_MULTI") &&
        (q.options?.length ?? 0) > 0 && (
          <ResponsiveContainer width="100%" height={Math.max(120, (q.options?.length ?? 0) * 32)}>
            <BarChart
              data={q.options}
              layout="vertical"
              margin={{ top: 0, right: 30, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(51 65 85)" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "rgb(148 163 184)" }}
                stroke="rgb(71 85 105)"
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 11, fill: "rgb(226 232 240)" }}
                stroke="rgb(71 85 105)"
                width={120}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, _name, item) => {
                  const payload = (item as { payload?: OptionStat }).payload;
                  const pct = payload?.pct ?? 0;
                  return [`${value} (${pct}%)`, "Count"];
                }}
              />
              <Bar dataKey="count" fill="#a855f7" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

      {q.type === "RATING" && q.ratingHistogram && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span className="text-sm font-bold text-white tabular-nums">
              Average: {q.ratingAverage?.toFixed(2) ?? "0.00"}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={q.ratingHistogram}
              margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(51 65 85)" />
              <XAxis
                dataKey="value"
                tick={{ fontSize: 11, fill: "rgb(148 163 184)" }}
                stroke="rgb(71 85 105)"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "rgb(148 163 184)" }}
                stroke="rgb(71 85 105)"
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {(q.type === "SHORT_TEXT" || q.type === "LONG_TEXT") && (
        <div className="space-y-1.5">
          {(q.textSamples ?? []).length === 0 ? (
            <p className="text-xs text-gray-500 italic">No responses yet.</p>
          ) : (
            (q.textSamples ?? []).map((s, i) => (
              <div
                key={i}
                className="rounded-lg bg-gray-950 border border-gray-800 p-3"
              >
                <p className="text-sm text-gray-200 whitespace-pre-wrap wrap-break-word">
                  {s.value}
                </p>
                <p className="text-[10px] text-gray-600 mt-1 tabular-nums">
                  {format(new Date(s.createdAt), "PP p")}
                </p>
              </div>
            ))
          )}
          {(q.textSamples?.length ?? 0) >= 50 && (
            <p className="text-[10px] text-gray-500 italic">
              Showing first 50 responses. Export CSV for the full list.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
