"use client";

import {
  ANSWER_MAX,
  type AnswerView,
  type ApplicationQuestion,
} from "@/lib/application-requirements";

/**
 * The admin's custom questions for a program, rendered inside its apply form
 * (creator modal, tutor form, ambassador page). Values are keyed by question
 * id; the apply API validates them again.
 */
export function ApplicationQuestionFields({
  questions,
  values,
  onChange,
  inputClassName,
  labelClassName = "block text-xs font-medium text-(--app-ink-3) mb-1.5",
}: {
  questions: ApplicationQuestion[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  inputClassName: string;
  labelClassName?: string;
}) {
  if (!questions.length) return null;
  const set = (id: string, v: string) => onChange({ ...values, [id]: v });
  return (
    <>
      {questions.map((q) => {
        const v = values[q.id] ?? "";
        const fieldId = `aq-${q.id}`;
        return (
          <div key={q.id}>
            <label htmlFor={fieldId} className={labelClassName}>
              {q.label} {q.required && <span className="text-red-400">*</span>}
            </label>
            {q.type === "textarea" ? (
              <textarea
                id={fieldId}
                rows={3}
                value={v}
                maxLength={ANSWER_MAX.textarea}
                onChange={(e) => set(q.id, e.target.value)}
                className={inputClassName}
              />
            ) : q.type === "select" ? (
              <select id={fieldId} value={v} onChange={(e) => set(q.id, e.target.value)} className={inputClassName}>
                <option value="">Choose…</option>
                {(q.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={fieldId}
                type={q.type === "url" ? "url" : q.type === "number" ? "number" : "text"}
                inputMode={q.type === "number" ? "decimal" : undefined}
                placeholder={q.type === "url" ? "https://…" : undefined}
                value={v}
                maxLength={ANSWER_MAX[q.type]}
                onChange={(e) => set(q.id, e.target.value)}
                className={inputClassName}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/** Question → answer pairs, for review pages and the applicant's own hub. */
export function ApplicationAnswers({
  answers,
  tone = "admin",
  title = "Answers",
}: {
  answers: AnswerView[];
  tone?: "admin" | "app";
  title?: string;
}) {
  if (!answers.length) return null;
  const box =
    tone === "admin" ? "border-slate-800 bg-slate-950/50" : "border-(--app-line) bg-(--app-page)";
  const q = tone === "admin" ? "text-slate-500" : "text-(--app-ink-3)";
  const a = tone === "admin" ? "text-slate-200" : "text-(--app-ink-2)";
  return (
    <div className={`mt-2 rounded-lg border p-2.5 ${box}`}>
      <p className={`text-[11px] font-bold uppercase tracking-wide mb-1.5 ${q}`}>{title}</p>
      <dl className="space-y-1.5">
        {answers.map((x, i) => (
          <div key={i}>
            <dt className={`text-[11px] ${q}`}>{x.label}</dt>
            <dd className={`text-xs whitespace-pre-wrap break-words ${a}`}>
              {/^https?:\/\//.test(x.answer) && !/\s/.test(x.answer) ? (
                <a href={x.answer} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                  {x.answer}
                </a>
              ) : (
                x.answer
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
