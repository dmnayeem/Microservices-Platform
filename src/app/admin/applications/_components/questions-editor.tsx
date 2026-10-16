"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { FieldHelp } from "@/components/admin/field-help";
import { inp } from "@/components/admin/settings/keyed-settings";
import {
  MAX_QUESTIONS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  newQuestionId,
  type ApplicationQuestion,
  type QuestionType,
} from "@/lib/application-requirements";

const HELP = {
  questions:
    "Extra questions shown in this program's apply form. Answers are saved with the application and shown to reviewers here, on the program's review page and to the applicant. Changing a question later does not change answers already sent.",
  type: "Short text: one line (300 characters). Long text: a paragraph (2000). Link: must be a full https:// address. Pick one: the applicant chooses from your options. Number: digits only.",
  required: "On: the application cannot be sent without an answer. Off: the applicant may leave it empty.",
  options: "One choice per line (up to 20). Only used by Pick one — without any option it becomes Short text when saved.",
};

/** Add / remove / reorder a program's custom questions. */
export function QuestionsEditor({
  questions,
  onChange,
}: {
  questions: ApplicationQuestion[];
  onChange: (next: ApplicationQuestion[]) => void;
}) {
  const patch = (i: number, p: Partial<ApplicationQuestion>) =>
    onChange(questions.map((q, j) => (j === i ? { ...q, ...p } : q)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-400">
        Questions for applicants ({questions.length}/{MAX_QUESTIONS})
        <FieldHelp text={HELP.questions} />
      </p>
      {questions.map((q, i) => (
        <div key={q.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <input
              className={inp}
              value={q.label}
              maxLength={200}
              placeholder="Question, e.g. Link to your best work"
              aria-label={`Question ${i + 1}`}
              onChange={(e) => patch(i, { label: e.target.value })}
            />
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label="Move up"
              className="p-1.5 rounded text-slate-400 hover:text-white disabled:opacity-30"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === questions.length - 1}
              aria-label="Move down"
              className="p-1.5 rounded text-slate-400 hover:text-white disabled:opacity-30"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChange(questions.filter((_, j) => j !== i))}
              aria-label="Remove question"
              className="p-1.5 rounded text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-300">
              Type
              <select
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                value={q.type}
                onChange={(e) => {
                  const type = e.target.value as QuestionType;
                  patch(i, { type, options: type === "select" ? (q.options ?? []) : undefined });
                }}
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {QUESTION_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <FieldHelp text={HELP.type} />
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-300">
              <input type="checkbox" checked={q.required} onChange={(e) => patch(i, { required: e.target.checked })} />
              Required
              <FieldHelp text={HELP.required} />
            </label>
          </div>
          {q.type === "select" && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Options
                <FieldHelp text={HELP.options} />
              </label>
              <textarea
                className={inp}
                rows={3}
                value={(q.options ?? []).join("\n")}
                onChange={(e) => patch(i, { options: e.target.value.split("\n").slice(0, 20) })}
              />
            </div>
          )}
        </div>
      ))}
      {questions.length < MAX_QUESTIONS && (
        <button
          type="button"
          onClick={() => onChange([...questions, { id: newQuestionId(), label: "", type: "text", required: false }])}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-300 hover:text-indigo-200"
        >
          <Plus className="w-3.5 h-3.5" /> Add question
        </button>
      )}
    </div>
  );
}
