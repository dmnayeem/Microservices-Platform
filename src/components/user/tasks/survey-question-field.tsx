"use client";

import { Star } from "lucide-react";
import type {
  SurveyAnswerValue,
  SurveyQuestion,
} from "@/lib/survey-tasks";
import { cn } from "@/lib/utils";

interface Props {
  question: SurveyQuestion;
  value: SurveyAnswerValue;
  onChange: (next: SurveyAnswerValue) => void;
  /** Optional shuffled-options array (parent may shuffle once per session). */
  displayOptions?: string[];
  disabled?: boolean;
}

export function SurveyQuestionField({
  question,
  value,
  onChange,
  displayOptions,
  disabled,
}: Props) {
  const id = `q-${question.id}`;
  const options = displayOptions ?? question.options ?? [];

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block">
        <span className="text-sm font-medium text-white">
          {question.prompt}
          {question.required && <span className="text-red-400 ml-1">*</span>}
        </span>
        {question.hint && (
          <span className="block text-[11px] text-(--app-ink-3) mt-0.5">
            {question.hint}
          </span>
        )}
      </label>

      {question.type === "SHORT_TEXT" && (
        <input
          id={id}
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          maxLength={question.maxLength ?? 200}
          disabled={disabled}
          className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-(--app-accent-edge) disabled:opacity-50"
          placeholder="Your answer…"
        />
      )}

      {question.type === "LONG_TEXT" && (
        <div>
          <textarea
            id={id}
            rows={4}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            maxLength={question.maxLength ?? 1000}
            disabled={disabled}
            className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-(--app-accent-edge) resize-y disabled:opacity-50"
            placeholder="Your answer…"
          />
          <p className="text-[11px] text-(--app-ink-3) text-right mt-1 tabular-nums">
            {(typeof value === "string" ? value : "").length} /{" "}
            {question.maxLength ?? 1000}
          </p>
        </div>
      )}

      {question.type === "MCQ_SINGLE" && (
        <div className="space-y-1.5">
          {options.map((opt) => {
            const checked = value === opt;
            return (
              <label
                key={opt}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                  checked
                    ? "border-(--app-accent-edge) bg-(--app-cta)/10"
                    : "border-(--app-line) bg-(--app-page) hover:border-(--app-line)",
                  disabled && "opacity-50 pointer-events-none"
                )}
              >
                <input
                  type="radio"
                  name={id}
                  checked={checked}
                  onChange={() => onChange(opt)}
                  disabled={disabled}
                  className="text-(--app-accent-ink)"
                />
                <span className="text-sm text-white">{opt}</span>
              </label>
            );
          })}
        </div>
      )}

      {question.type === "MCQ_MULTI" && (
        <div className="space-y-1.5">
          {options.map((opt) => {
            const arr = Array.isArray(value) ? value : [];
            const checked = arr.includes(opt);
            const toggle = () => {
              if (checked) onChange(arr.filter((x) => x !== opt));
              else onChange([...arr, opt]);
            };
            return (
              <label
                key={opt}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                  checked
                    ? "border-(--app-accent-edge) bg-(--app-cta)/10"
                    : "border-(--app-line) bg-(--app-page) hover:border-(--app-line)",
                  disabled && "opacity-50 pointer-events-none"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={toggle}
                  disabled={disabled}
                  className="rounded text-(--app-accent-ink) bg-(--app-surface-2) border-(--app-line)"
                />
                <span className="text-sm text-white">{opt}</span>
              </label>
            );
          })}
        </div>
      )}

      {question.type === "DROPDOWN" && (
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-sm text-white focus:outline-none focus:border-(--app-accent-edge) disabled:opacity-50"
        >
          <option value="" disabled>
            Choose…
          </option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {question.type === "RATING" && (
        <div
          className={cn(
            "inline-flex items-center gap-1",
            disabled && "opacity-50 pointer-events-none"
          )}
        >
          {Array.from({ length: question.scale ?? 5 }, (_, i) => i + 1).map(
            (n) => {
              const active = typeof value === "number" && value >= n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange(n)}
                  disabled={disabled}
                  aria-label={`${n} out of ${question.scale ?? 5}`}
                  className="p-1.5 transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      "w-6 h-6",
                      active
                        ? "text-amber-400 fill-amber-400"
                        : "text-(--app-ink-3)"
                    )}
                  />
                </button>
              );
            }
          )}
          {typeof value === "number" && (
            <span className="ml-2 text-xs text-(--app-ink-3) tabular-nums">
              {value} / {question.scale ?? 5}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
