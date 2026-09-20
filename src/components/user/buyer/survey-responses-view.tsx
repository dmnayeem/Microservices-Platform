"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";
import type { BuyerQuestionStat, BuyerResponseRow } from "@/lib/survey-buyer";

/**
 * What a buyer sees of their own survey.
 *
 * Two views of one dataset: the totals, and the individual responses. The
 * second is the one that makes a survey worth running — and the reason
 * `src/lib/survey-buyer.ts` exists: every row here is `Respondent N` and a
 * date, and this component has no code path that could render a name because
 * the API never sends one.
 */

interface Payload {
  task: { id: string; title: string; status: string; target: number };
  questions: {
    id: string;
    type: string;
    prompt: string;
    required: boolean;
    options: string[];
    scale: number | null;
  }[];
  stats: BuyerQuestionStat[];
  responses: BuyerResponseRow[];
  total: number;
}

export function BuyerSurveyResponsesView({ taskId }: { taskId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"summary" | "responses">("summary");

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(`/api/tasks/mine/${taskId}/responses`, {
          cache: "no-store",
        });
        const d = await res.json();
        if (cancel) return;
        if (!res.ok) {
          setError(d?.error ?? "Couldn't load the responses.");
          return;
        }
        setData(d as Payload);
      } catch {
        if (!cancel) setError("Couldn't load the responses.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [taskId]);

  const download = (format: "csv" | "json") => {
    // A plain navigation, not a fetch-then-blob: the route already sets
    // Content-Disposition, and the browser's own download is the one thing that
    // works the same on every device the workers and buyers actually use.
    if (!data?.total) {
      toast.error("There are no responses to export yet.");
      return;
    }
    window.location.href = `/api/tasks/mine/${taskId}/responses?format=${format}`;
  };

  if (loading) {
    return <p className="p-6 text-sm text-(--app-ink-3)">Loading responses…</p>;
  }
  if (error || !data) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm text-red-300">{error ?? "Not found."}</p>
        <Link href="/buyer" className="text-xs font-bold text-(--app-accent-ink)">
          Back to your tasks
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <Link
        href="/buyer"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-(--app-ink-3) hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Your tasks
      </Link>

      <div>
        <h1 className="text-lg font-bold text-white">{data.task.title}</h1>
        <p className="text-xs text-(--app-ink-3)">
          {data.total.toLocaleString()} response
          {data.total === 1 ? "" : "s"}
          {data.task.target
            ? ` of ${data.task.target.toLocaleString()} funded`
            : ""}
        </p>
      </div>

      <div className="flex gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <p className="text-[11px] leading-relaxed text-emerald-200/85">
          Respondents answered on the promise that you would never see who they
          are. Rows are pseudonymous and dated to the day — that is everything
          there is, in the export as well as on screen.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["summary", "responses"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold capitalize ${
              tab === t
                ? "border-(--app-accent-edge) bg-(--app-cta)/10 text-(--app-accent-ink)"
                : "border-(--app-line) text-(--app-ink-3) hover:border-(--app-line)"
            }`}
          >
            {t}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => download("csv")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-(--app-line) px-3 py-1.5 text-xs font-bold text-(--app-ink-2) hover:border-(--app-line)"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button
            type="button"
            onClick={() => download("json")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-(--app-line) px-3 py-1.5 text-xs font-bold text-(--app-ink-2) hover:border-(--app-line)"
          >
            <Download className="h-3.5 w-3.5" /> JSON
          </button>
        </div>
      </div>

      {data.total === 0 && (
        <p className="rounded-xl border border-dashed border-(--app-line) p-6 text-center text-sm text-(--app-ink-3)">
          Nobody has answered yet.
        </p>
      )}

      {tab === "summary" && data.total > 0 && (
        <div className="space-y-3">
          {data.stats.map((s) => (
            <div key={s.questionId} className="glass space-y-2 rounded-xl p-4">
              <p className="text-sm font-semibold text-white">{s.prompt}</p>
              <p className="text-[11px] text-(--app-ink-3)">
                {s.answeredCount.toLocaleString()} answered
                {s.ratingAverage != null && s.answeredCount > 0
                  ? ` · average ${s.ratingAverage}`
                  : ""}
              </p>
              {s.options?.map((o) => (
                <div key={o.label} className="space-y-1">
                  <div className="flex justify-between text-xs text-(--app-ink-2)">
                    <span className="truncate">{o.label}</span>
                    <span className="tabular-nums text-(--app-ink-3)">
                      {o.count} · {o.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-(--app-surface-2)">
                    <div
                      className="h-full rounded-full bg-(--app-cta)"
                      style={{ width: `${Math.min(100, o.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
              {s.ratingHistogram?.map((h) => (
                <div
                  key={h.value}
                  className="flex justify-between text-xs text-(--app-ink-2)"
                >
                  <span>{h.value}</span>
                  <span className="tabular-nums text-(--app-ink-3)">{h.count}</span>
                </div>
              ))}
              {!s.options && !s.ratingHistogram && (
                <p className="text-[11px] text-(--app-ink-3)">
                  Free text — read them under Responses or in the export.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "responses" && data.total > 0 && (
        <div className="overflow-x-auto rounded-xl border border-(--app-line)">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-(--app-surface) text-(--app-ink-3)">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">
                  Respondent
                </th>
                <th className="whitespace-nowrap px-3 py-2 font-semibold">
                  Date
                </th>
                {data.questions.map((q) => (
                  <th
                    key={q.id}
                    className="min-w-[10rem] px-3 py-2 font-semibold"
                  >
                    {q.prompt}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-(--app-line)">
              {data.responses.map((r) => (
                <tr key={r.respondent} className="align-top text-(--app-ink-2)">
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-white">
                    {r.respondent}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-(--app-ink-3)">
                    {r.date}
                  </td>
                  {data.questions.map((q) => (
                    <td key={q.id} className="px-3 py-2">
                      {r.answers[q.id] || (
                        <span className="text-(--app-glyph)">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
