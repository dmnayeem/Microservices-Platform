"use client";

import { confirmDialog } from "@/lib/confirm";

import { useState } from "react";
import { NumberInput } from "@/components/admin/number-input";
import {
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  Type,
  AlignLeft,
  CircleDot,
  CheckSquare,
  Star,
  ChevronDown,
  Settings as SettingsIcon,
  AlertCircle,
} from "lucide-react";
import {
  type SurveyConfig,
  type SurveyQuestion,
  type SurveyQuestionType,
  emptyQuestion,
  SURVEY_QUESTION_TYPE_LABEL,
} from "@/lib/survey-tasks";

interface Props {
  value: SurveyConfig;
  onChange: (next: SurveyConfig) => void;
}

const TYPE_ICON: Record<SurveyQuestionType, typeof Type> = {
  SHORT_TEXT: Type,
  LONG_TEXT: AlignLeft,
  MCQ_SINGLE: CircleDot,
  MCQ_MULTI: CheckSquare,
  RATING: Star,
  DROPDOWN: ChevronDown,
};

const TYPE_TONE: Record<SurveyQuestionType, string> = {
  SHORT_TEXT: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  LONG_TEXT: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  MCQ_SINGLE: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  MCQ_MULTI: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  RATING: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  DROPDOWN: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
};

const ALL_TYPES: SurveyQuestionType[] = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "MCQ_SINGLE",
  "MCQ_MULTI",
  "RATING",
  "DROPDOWN",
];

export function SurveyTaskBuilder({ value, onChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reorderToOrderField = (questions: SurveyQuestion[]): SurveyQuestion[] =>
    questions.map((q, i) => ({ ...q, order: i }));

  const addQuestion = (type: SurveyQuestionType) => {
    const q = emptyQuestion(type);
    q.order = value.questions.length;
    const next = [...value.questions, q];
    onChange({ ...value, questions: next });
    setExpandedId(q.id);
  };

  const updateQuestion = (id: string, patch: Partial<SurveyQuestion>) => {
    const next = value.questions.map((q) => (q.id === id ? { ...q, ...patch } : q));
    onChange({ ...value, questions: next });
  };

  const removeQuestion = async (id: string) => {
    if (
      !(await confirmDialog({
        title: "Delete this question?",
        description: "Any existing responses to it will be discarded from analytics.",
        tone: "danger",
        confirmLabel: "Delete",
      }))
    ) {
      return;
    }
    const next = reorderToOrderField(value.questions.filter((q) => q.id !== id));
    onChange({ ...value, questions: next });
  };

  const moveQuestion = (id: string, dir: -1 | 1) => {
    const idx = value.questions.findIndex((q) => q.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= value.questions.length) return;
    const next = [...value.questions];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...value, questions: reorderToOrderField(next) });
  };

  const updateOption = (qid: string, oIdx: number, val: string) => {
    const q = value.questions.find((x) => x.id === qid);
    if (!q || !q.options) return;
    const opts = [...q.options];
    opts[oIdx] = val;
    updateQuestion(qid, { options: opts });
  };

  const addOption = (qid: string) => {
    const q = value.questions.find((x) => x.id === qid);
    if (!q || !q.options) return;
    updateQuestion(qid, {
      options: [...q.options, `Option ${q.options.length + 1}`],
    });
  };

  const removeOption = (qid: string, oIdx: number) => {
    const q = value.questions.find((x) => x.id === qid);
    if (!q || !q.options) return;
    if (q.options.length <= 2) return;
    updateQuestion(qid, { options: q.options.filter((_, i) => i !== oIdx) });
  };

  return (
    <div className="space-y-6">
      {/* Settings */}
      <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-indigo-400" />
          <p className="text-sm font-bold text-white">Survey Settings</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Intro message (shown above questions)
            </label>
            <textarea
              rows={2}
              value={value.introMessage ?? ""}
              onChange={(e) => onChange({ ...value, introMessage: e.target.value })}
              placeholder="e.g. We're collecting feedback on the new dashboard…"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Thank-you message (shown after submit)
            </label>
            <textarea
              rows={2}
              value={value.thankYouMessage ?? ""}
              onChange={(e) =>
                onChange({ ...value, thankYouMessage: e.target.value })
              }
              placeholder="e.g. Thanks! Your response is being reviewed."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Toggle
            label="Randomize question order"
            help="Each user sees the questions in a different order."
            checked={value.randomizeQuestions}
            onChange={(v) => onChange({ ...value, randomizeQuestions: v })}
          />
          <Toggle
            label="Shuffle MCQ options"
            help="Each user sees a different option order."
            checked={value.shuffleOptions}
            onChange={(v) => onChange({ ...value, shuffleOptions: v })}
          />
          <Toggle
            label="Require screenshot"
            help="User must upload a screenshot with answers."
            checked={value.proofRequirements.screenshot}
            onChange={(v) =>
              onChange({
                ...value,
                proofRequirements: { ...value.proofRequirements, screenshot: v },
              })
            }
          />
        </div>
      </div>

      {/* Questions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-white">
              Questions{" "}
              <span className="text-gray-500 font-normal">
                ({value.questions.length})
              </span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Drag using arrows to reorder. Question ids stay stable across edits.
            </p>
          </div>
        </div>

        {value.questions.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950 p-8 text-center mb-3">
            <AlertCircle className="w-6 h-6 text-gray-500 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              No questions yet. Add one below to get started.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {value.questions.map((q, idx) => (
            <QuestionRow
              key={q.id}
              q={q}
              index={idx}
              total={value.questions.length}
              expanded={expandedId === q.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === q.id ? null : q.id)
              }
              onChange={(patch) => updateQuestion(q.id, patch)}
              onRemove={() => removeQuestion(q.id)}
              onMoveUp={() => moveQuestion(q.id, -1)}
              onMoveDown={() => moveQuestion(q.id, 1)}
              onUpdateOption={(oIdx, val) => updateOption(q.id, oIdx, val)}
              onAddOption={() => addOption(q.id)}
              onRemoveOption={(oIdx) => removeOption(q.id, oIdx)}
            />
          ))}
        </div>

        {/* Add question buttons */}
        <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950 p-3">
          <p className="text-xs text-gray-500 mb-2 font-medium">Add a question</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_TYPES.map((t) => {
              const Icon = TYPE_ICON[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => addQuestion(t)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${TYPE_TONE[t]} hover:opacity-80`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <Icon className="w-3.5 h-3.5" />
                  {SURVEY_QUESTION_TYPE_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Question row ────────────────────────────────────────────────────────────

function QuestionRow({
  q,
  index,
  total,
  expanded,
  onToggleExpand,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onUpdateOption,
  onAddOption,
  onRemoveOption,
}: {
  q: SurveyQuestion;
  index: number;
  total: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (patch: Partial<SurveyQuestion>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateOption: (idx: number, val: string) => void;
  onAddOption: () => void;
  onRemoveOption: (idx: number) => void;
}) {
  const Icon = TYPE_ICON[q.type];
  const hasOptions =
    q.type === "MCQ_SINGLE" || q.type === "MCQ_MULTI" || q.type === "DROPDOWN";

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-3">
        <span className="text-xs text-gray-500 font-mono shrink-0 w-6 text-right">
          #{index + 1}
        </span>
        <div className={`p-1.5 rounded border ${TYPE_TONE[q.type]} shrink-0`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <input
          type="text"
          value={q.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          placeholder="Question text…"
          className="flex-1 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1.5 text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1.5 text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            className="px-2 py-1 text-[11px] font-bold text-gray-400 hover:text-white border border-gray-700 rounded"
          >
            {expanded ? "Less" : "More"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 text-gray-500 hover:text-red-400"
            title="Delete question"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-gray-800 bg-gray-900/50 p-3 space-y-3">
          {/* Required + per-type config */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={q.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="rounded bg-gray-800 border-gray-600 text-indigo-500"
              />
              Required
            </label>

            {q.type === "RATING" && (
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                Scale (1 to)
                <NumberInput
                  min={2}
                  max={10}
                  value={q.scale ?? 5}
                  onChange={(e) =>
                    onChange({ scale: Math.max(2, Math.min(10, parseInt(e.target.value) || 5)) })
                  }
                  className="w-16 px-2 py-1 bg-gray-950 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </label>
            )}

            {(q.type === "SHORT_TEXT" || q.type === "LONG_TEXT") && (
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-300">
                Max length
                <NumberInput
                  min={10}
                  max={5000}
                  value={q.maxLength ?? (q.type === "SHORT_TEXT" ? 200 : 1000)}
                  onChange={(e) =>
                    onChange({
                      maxLength: Math.max(
                        10,
                        Math.min(5000, parseInt(e.target.value) || 200)
                      ),
                    })
                  }
                  className="w-20 px-2 py-1 bg-gray-950 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </label>
            )}
          </div>

          {/* Options editor */}
          {hasOptions && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">
                Options
              </p>
              {(q.options ?? []).map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 font-mono w-6 text-right">
                    {oIdx + 1}.
                  </span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => onUpdateOption(oIdx, e.target.value)}
                    placeholder={`Option ${oIdx + 1}`}
                    className="flex-1 px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                  {(q.options?.length ?? 0) > 2 && (
                    <button
                      type="button"
                      onClick={() => onRemoveOption(oIdx)}
                      className="p-1.5 text-gray-500 hover:text-red-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={onAddOption}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-indigo-400 hover:text-indigo-300"
              >
                <Plus className="w-3.5 h-3.5" />
                Add option
              </button>
            </div>
          )}

          {/* Hint */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-1">
              Hint (optional)
            </label>
            <input
              type="text"
              value={q.hint ?? ""}
              onChange={(e) => onChange({ hint: e.target.value })}
              placeholder="Helper text shown under this question…"
              className="w-full px-3 py-1.5 bg-gray-950 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors ${
        checked
          ? "border-indigo-500 bg-indigo-500/10"
          : "border-gray-800 bg-gray-900 hover:border-gray-700"
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded bg-gray-800 border-gray-600 text-indigo-500"
        />
        <span className="text-xs font-semibold text-white">{label}</span>
      </div>
      <span className="text-[10px] text-gray-500">{help}</span>
    </label>
  );
}
