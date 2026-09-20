"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Pencil,
  Plus,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import {
  emptyQuestion,
  SURVEY_QUESTION_TYPE_LABEL,
  type SurveyQuestion,
  type SurveyQuestionType,
} from "@/lib/survey-tasks";
import { BUYER_SURVEY_NOTICE } from "@/lib/survey-buyer";

/**
 * The buyer's question builder.
 *
 * It edits the SAME `SurveyQuestion[]` the admin builder produces and the
 * worker's runner reads — one shape, so a buyer survey is answered, reviewed
 * and exported by code that never has to ask who built it.
 *
 * Question ids are generated once and carried through every edit. That is what
 * makes fixing a typo in a prompt safe after answers exist: the answers are
 * keyed by id, not by text.
 */

export interface SurveyDraft {
  questions: SurveyQuestion[];
  introMessage: string;
  thankYouMessage: string;
  randomizeQuestions: boolean;
  shuffleOptions: boolean;
}

export function emptySurveyDraft(): SurveyDraft {
  return {
    questions: [],
    introMessage: "",
    thankYouMessage: "Thanks for your response!",
    randomizeQuestions: false,
    shuffleOptions: false,
  };
}

/** The same rules the server applies, so the buyer is told before they submit. */
export function surveyDraftProblem(d: SurveyDraft): string | null {
  if (d.questions.length === 0) return "Add at least one question.";
  if (d.questions.length > 50) return "A survey can have at most 50 questions.";
  for (const q of d.questions) {
    if (!q.prompt.trim()) return "Every question needs a prompt.";
    if (
      q.type === "MCQ_SINGLE" ||
      q.type === "MCQ_MULTI" ||
      q.type === "DROPDOWN"
    ) {
      const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) return `"${q.prompt || "A question"}" needs at least 2 options.`;
      if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) {
        return `"${q.prompt}" has duplicate options.`;
      }
    }
  }
  return null;
}

const TYPES: SurveyQuestionType[] = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "MCQ_SINGLE",
  "MCQ_MULTI",
  "RATING",
  "DROPDOWN",
];

const inputCls =
  "w-full rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-(--app-accent-edge) focus:outline-none";

export function SurveyBuilder({
  value,
  onChange,
}: {
  value: SurveyDraft;
  onChange: (next: SurveyDraft) => void;
}) {
  const [preview, setPreview] = useState(false);
  const qs = value.questions;

  const set = (patch: Partial<SurveyDraft>) => onChange({ ...value, ...patch });
  const setQ = (i: number, patch: Partial<SurveyQuestion>) =>
    set({ questions: qs.map((q, n) => (n === i ? { ...q, ...patch } : q)) });
  const add = (type: SurveyQuestionType) =>
    set({ questions: [...qs, { ...emptyQuestion(type), order: qs.length }] });
  const remove = (i: number) =>
    set({ questions: qs.filter((_, n) => n !== i).map((q, n) => ({ ...q, order: n })) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= qs.length) return;
    const next = [...qs];
    [next[i], next[j]] = [next[j], next[i]];
    set({ questions: next.map((q, n) => ({ ...q, order: n })) });
  };

  return (
    <div className="space-y-3">
      {/* The rule, stated to the buyer before they build anything — so nobody
          designs a survey around identifying a respondent and then discovers
          the export will not give them that. */}
      <div className="flex gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <div className="text-[11px] leading-relaxed text-emerald-200/85">
          <span className="font-semibold text-emerald-300">
            You get every answer, never who gave it.
          </span>{" "}
          Responses are exported as “Respondent 1, 2, 3…” with the date only —
          no name, no account, no exact time. Respondents are shown this before
          they answer, so don’t ask for contact details in a question.
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-(--app-ink-2)">
          Questions{" "}
          <span className="font-normal text-(--app-ink-3)">({qs.length}/50)</span>
        </p>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-(--app-line) px-2.5 py-1.5 text-[11px] font-bold text-(--app-ink-2) hover:border-(--app-line)"
        >
          {preview ? (
            <>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" /> Preview
            </>
          )}
        </button>
      </div>

      {preview ? (
        <SurveyPreview draft={value} />
      ) : (
        <>
          {qs.length === 0 && (
            <p className="rounded-lg border border-dashed border-(--app-line) p-4 text-center text-xs text-(--app-ink-3)">
              No questions yet. Add one below.
            </p>
          )}

          {qs.map((q, i) => (
            <div
              key={q.id}
              className="space-y-2 rounded-xl border border-(--app-line) bg-(--app-page)/60 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-md bg-(--app-surface-2) px-2 py-1 text-[11px] font-bold text-(--app-ink-3)">
                  Q{i + 1}
                </span>
                <select
                  value={q.type}
                  onChange={(e) => {
                    const type = e.target.value as SurveyQuestionType;
                    // Keep the id and the prompt; take the new type's defaults
                    // for everything else, so switching to Rating does not
                    // leave a stale option list behind.
                    setQ(i, {
                      ...emptyQuestion(type),
                      id: q.id,
                      order: q.order,
                      prompt: q.prompt,
                      required: q.required,
                    });
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-(--app-line) bg-(--app-page) px-2 py-1.5 text-xs text-(--app-ink) focus:border-(--app-accent-edge) focus:outline-none"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SURVEY_QUESTION_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                  className="rounded-md p-1.5 text-(--app-ink-3) hover:bg-(--app-surface-2) disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === qs.length - 1}
                  aria-label="Move down"
                  className="rounded-md p-1.5 text-(--app-ink-3) hover:bg-(--app-surface-2) disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Remove question"
                  className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <input
                value={q.prompt}
                onChange={(e) => setQ(i, { prompt: e.target.value })}
                maxLength={300}
                placeholder="What do you want to ask?"
                className={inputCls}
              />

              {(q.type === "MCQ_SINGLE" ||
                q.type === "MCQ_MULTI" ||
                q.type === "DROPDOWN") && (
                <div className="space-y-1.5">
                  {(q.options ?? []).map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        value={opt}
                        onChange={(e) =>
                          setQ(i, {
                            options: (q.options ?? []).map((o, n) =>
                              n === oi ? e.target.value : o
                            ),
                          })
                        }
                        maxLength={120}
                        placeholder={`Option ${oi + 1}`}
                        className={inputCls}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setQ(i, {
                            options: (q.options ?? []).filter((_, n) => n !== oi),
                          })
                        }
                        aria-label="Remove option"
                        className="rounded-md p-1.5 text-(--app-ink-3) hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {(q.options ?? []).length < 30 && (
                    <button
                      type="button"
                      onClick={() =>
                        setQ(i, {
                          options: [
                            ...(q.options ?? []),
                            `Option ${(q.options ?? []).length + 1}`,
                          ],
                        })
                      }
                      className="text-[11px] font-bold text-(--app-accent-ink) hover:text-(--app-accent-ink)"
                    >
                      + Add option
                    </button>
                  )}
                </div>
              )}

              {q.type === "RATING" && (
                <label className="flex items-center gap-2 text-[11px] text-(--app-ink-3)">
                  Scale 1 to
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={q.scale ?? 5}
                    onChange={(e) =>
                      setQ(i, {
                        scale: Math.min(
                          10,
                          Math.max(2, parseInt(e.target.value) || 5)
                        ),
                      })
                    }
                    className="w-20 rounded-lg border border-(--app-line) bg-(--app-page) px-2 py-1 text-sm text-(--app-ink) focus:border-(--app-accent-edge) focus:outline-none"
                  />
                </label>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-[11px] text-(--app-ink-3)">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => setQ(i, { required: e.target.checked })}
                    className="h-3.5 w-3.5 accent-indigo-500"
                  />
                  Required
                </label>
                <input
                  value={q.hint ?? ""}
                  onChange={(e) => setQ(i, { hint: e.target.value })}
                  maxLength={300}
                  placeholder="Helper text (optional)"
                  className="min-w-0 flex-1 rounded-lg border border-(--app-line) bg-(--app-page) px-2 py-1 text-[11px] text-(--app-ink-2) placeholder:text-(--app-ink-3) focus:border-(--app-accent-edge) focus:outline-none"
                />
              </div>
            </div>
          ))}

          {qs.length < 50 && (
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => add(t)}
                  className="inline-flex items-center gap-1 rounded-lg border border-(--app-line) bg-(--app-page) px-2.5 py-1.5 text-[11px] font-semibold text-(--app-ink-2) hover:border-(--app-accent-edge) hover:text-(--app-accent-ink)"
                >
                  <Plus className="h-3 w-3" />
                  {SURVEY_QUESTION_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-(--app-ink-3)">
                Intro shown before the questions
              </label>
              <textarea
                rows={2}
                maxLength={1000}
                value={value.introMessage}
                onChange={(e) => set({ introMessage: e.target.value })}
                placeholder="Why you're asking, how long it takes…"
                className={`${inputCls} resize-none`}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-(--app-ink-3)">
                Thank-you message
              </label>
              <textarea
                rows={2}
                maxLength={300}
                value={value.thankYouMessage}
                onChange={(e) => set({ thankYouMessage: e.target.value })}
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5 text-[11px] text-(--app-ink-3)">
              <input
                type="checkbox"
                checked={value.randomizeQuestions}
                onChange={(e) => set({ randomizeQuestions: e.target.checked })}
                className="h-3.5 w-3.5 accent-indigo-500"
              />
              Shuffle question order per respondent
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-(--app-ink-3)">
              <input
                type="checkbox"
                checked={value.shuffleOptions}
                onChange={(e) => set({ shuffleOptions: e.target.checked })}
                className="h-3.5 w-3.5 accent-indigo-500"
              />
              Shuffle answer options
            </label>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * What the respondent will see — including the privacy notice, because that is
 * part of what they see and the buyer should know exactly what is promised on
 * their behalf.
 */
function SurveyPreview({ draft }: { draft: SurveyDraft }) {
  return (
    <div className="space-y-3 rounded-xl border border-(--app-line) bg-(--app-page)/60 p-3">
      <p className="rounded-lg border border-(--app-line) bg-(--app-surface) p-2.5 text-[11px] leading-relaxed text-(--app-ink-3)">
        {BUYER_SURVEY_NOTICE}
      </p>
      {draft.introMessage.trim() && (
        <p className="whitespace-pre-wrap text-xs text-(--app-ink-2)">
          {draft.introMessage}
        </p>
      )}
      {draft.questions.length === 0 && (
        <p className="text-center text-xs text-(--app-ink-3)">Nothing to preview yet.</p>
      )}
      {draft.questions.map((q, i) => (
        <div key={q.id} className="space-y-1.5">
          <p className="text-xs font-semibold text-white">
            {i + 1}. {q.prompt || <span className="text-(--app-ink-3)">(no prompt)</span>}
            {q.required && <span className="text-red-400"> *</span>}
          </p>
          {q.hint && <p className="text-[11px] text-(--app-ink-3)">{q.hint}</p>}
          {q.type === "SHORT_TEXT" && (
            <input disabled placeholder="Their answer" className={inputCls} />
          )}
          {q.type === "LONG_TEXT" && (
            <textarea
              disabled
              rows={3}
              placeholder="Their answer"
              className={`${inputCls} resize-none`}
            />
          )}
          {q.type === "DROPDOWN" && (
            <select disabled className={inputCls}>
              <option>Choose…</option>
              {(q.options ?? []).map((o, n) => (
                <option key={n}>{o}</option>
              ))}
            </select>
          )}
          {(q.type === "MCQ_SINGLE" || q.type === "MCQ_MULTI") &&
            (q.options ?? []).map((o, n) => (
              <label
                key={n}
                className="flex items-center gap-2 text-xs text-(--app-ink-2)"
              >
                <input
                  disabled
                  type={q.type === "MCQ_MULTI" ? "checkbox" : "radio"}
                  className="h-3.5 w-3.5 accent-indigo-500"
                />
                {o}
              </label>
            ))}
          {q.type === "RATING" && (
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: q.scale ?? 5 }, (_, n) => (
                <span
                  key={n}
                  className="rounded-lg border border-(--app-line) px-2.5 py-1 text-xs text-(--app-ink-3)"
                >
                  {n + 1}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      {draft.thankYouMessage.trim() && (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-[11px] text-emerald-300">
          {draft.thankYouMessage}
        </p>
      )}
    </div>
  );
}
