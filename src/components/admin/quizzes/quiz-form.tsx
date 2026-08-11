"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Sparkles, Loader2, Save, X } from "lucide-react";
// (icons all imported above)
import { toast } from "@/lib/toast";
import { ImageUploadField } from "@/components/admin/shared/ImageUploadField";

interface Question {
  question: string;
  questionImageUrl?: string;
  options: string[];
  optionImageUrls?: string[];
  correctIndex: number;
  explanation?: string;
  pointsValue?: number;
}

export interface QuizEditInitial {
  title: string;
  description: string | null;
  category: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  timeLimitSec: number;
  passingScore: number;
  pointsReward: number;
  xpReward: number;
  cashReward: number;
  maxAttempts: number;
  cooldownHours: number;
  requiredLevel: number;
  requiredAccessLevel: number | null;
  questions: Question[];
}

interface QuizFormProps {
  canUseAI: boolean;
  initial?: QuizEditInitial;
  quizId?: string;
}

const CATEGORIES = [
  "General",
  "Crypto",
  "Tech",
  "Finance",
  "Marketing",
  "Science",
  "History",
  "Geography",
];

export function QuizForm({ canUseAI, initial, quizId }: QuizFormProps) {
  const router = useRouter();
  const isEdit = !!quizId;

  const [meta, setMeta] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "General",
    difficulty: (initial?.difficulty ?? "MEDIUM") as "EASY" | "MEDIUM" | "HARD",
    status: (initial?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT") as
      | "DRAFT"
      | "PUBLISHED",
    timeLimitSec: initial?.timeLimitSec ?? 180,
    passingScore: initial?.passingScore ?? 60,
    pointsReward: initial?.pointsReward ?? 50,
    xpReward: initial?.xpReward ?? 25,
    cashReward: initial?.cashReward ?? 0,
    maxAttempts: initial?.maxAttempts ?? 3,
    cooldownHours: initial?.cooldownHours ?? 24,
    requiredLevel: initial?.requiredLevel ?? 1,
    requiredPackage: "" as "" | "FREE" | "STARTER" | "PRO" | "ELITE" | "VIP",
  });

  const [questions, setQuestions] = useState<Question[]>(
    initial?.questions?.length
      ? initial.questions.map((q) => ({
          question: q.question,
          questionImageUrl: q.questionImageUrl ?? "",
          options: q.options,
          optionImageUrls:
            q.optionImageUrls ?? q.options.map(() => ""),
          correctIndex: q.correctIndex,
          explanation: q.explanation ?? "",
          pointsValue: q.pointsValue ?? 10,
        }))
      : [
          {
            question: "",
            questionImageUrl: "",
            options: ["", "", "", ""],
            optionImageUrls: ["", "", "", ""],
            correctIndex: 0,
            explanation: "",
            pointsValue: 10,
          },
        ]
  );

  const [aiOpen, setAiOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const setMetaField = <K extends keyof typeof meta>(k: K, v: (typeof meta)[K]) =>
    setMeta((p) => ({ ...p, [k]: v }));

  const addQuestion = () =>
    setQuestions((p) => [
      ...p,
      {
        question: "",
        questionImageUrl: "",
        options: ["", "", "", ""],
        optionImageUrls: ["", "", "", ""],
        correctIndex: 0,
        explanation: "",
        pointsValue: 10,
      },
    ]);

  const removeQuestion = (i: number) =>
    setQuestions((p) => p.filter((_, idx) => idx !== i));

  const updateQuestion = (i: number, patch: Partial<Question>) =>
    setQuestions((p) => p.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  const updateOption = (qi: number, oi: number, value: string) =>
    setQuestions((p) =>
      p.map((q, idx) =>
        idx === qi
          ? {
              ...q,
              options: q.options.map((o, oidx) => (oidx === oi ? value : o)),
            }
          : q
      )
    );

  const updateOptionImage = (qi: number, oi: number, url: string) =>
    setQuestions((p) =>
      p.map((q, idx) => {
        if (idx !== qi) return q;
        // Pad to the option count so indices stay aligned with options.
        const imgs = [...(q.optionImageUrls ?? [])];
        while (imgs.length < q.options.length) imgs.push("");
        imgs[oi] = url;
        return { ...q, optionImageUrls: imgs };
      })
    );

  const generateWithAI = async () => {
    if (!aiTopic.trim()) {
      toast.error("Enter a topic");
      return;
    }
    setAiBusy(true);
    try {
      const res = await fetch("/api/admin/quizzes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: aiTopic,
          difficulty: aiDifficulty,
          questionCount: aiCount,
          category: meta.category,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Map AI questions into our shape
      const mapped: Question[] = (data.questions ?? []).map(
        (q: {
          question: string;
          options: string[];
          correctAnswer: number;
          explanation?: string;
        }) => ({
          question: q.question,
          options: q.options,
          correctIndex: q.correctAnswer,
          explanation: q.explanation,
          pointsValue: 10,
        })
      );

      setQuestions(mapped);
      setAiGenerated(true);
      // Pre-fill title if empty
      if (!meta.title) {
        setMetaField(
          "title",
          `${aiTopic} — ${aiDifficulty[0].toUpperCase() + aiDifficulty.slice(1)} Quiz`
        );
      }
      setMetaField("difficulty", aiDifficulty.toUpperCase() as never);
      setAiOpen(false);
      toast.success(`Generated ${mapped.length} questions`);
    } catch (err) {
      toast.error("AI generation failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAiBusy(false);
    }
  };

  const submit = async (publish: boolean) => {
    if (!meta.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (questions.length === 0) {
      toast.error("At least one question is required");
      return;
    }
    for (const [i, q] of questions.entries()) {
      if (!q.question.trim()) {
        toast.error(`Question ${i + 1}: text is required`);
        return;
      }
      if (q.options.filter((o) => o.trim()).length < 2) {
        toast.error(`Question ${i + 1}: at least 2 options required`);
        return;
      }
      if (q.correctIndex >= q.options.length) {
        toast.error(`Question ${i + 1}: correct answer index invalid`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        isEdit ? `/api/admin/quizzes/${quizId}` : "/api/admin/quizzes",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...meta,
            status: publish ? "PUBLISHED" : "DRAFT",
            requiredPackage: meta.requiredPackage || null,
            questions,
            aiGenerated,
            aiPrompt: aiGenerated ? aiTopic : null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast.success(
        isEdit
          ? "Quiz updated"
          : publish
            ? "Quiz published"
            : "Saved as draft"
      );
      router.push("/admin/quizzes");
      router.refresh();
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Generate banner */}
      {canUseAI && (
        <div className="rounded-xl border border-purple-500/30 bg-linear-to-r from-purple-500/10 to-pink-500/10 p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              Generate with Gemini AI
            </h3>
            <p className="text-sm text-slate-400 mt-0.5">
              Auto-create a complete quiz from any topic in seconds.
            </p>
          </div>
          <button
            onClick={() => setAiOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Sparkles className="w-4 h-4" />
            Open AI Generator
          </button>
        </div>
      )}

      {/* Basic Info */}
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Basic Info</h2>
        <Field label="Title *">
          <input
            value={meta.title}
            onChange={(e) => setMetaField("title", e.target.value)}
            className={inp}
            placeholder="e.g. Crypto Basics 101"
          />
        </Field>
        <Field label="Description">
          <textarea
            rows={2}
            value={meta.description}
            onChange={(e) => setMetaField("description", e.target.value)}
            className={inp + " resize-none"}
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Category">
            <select
              value={meta.category}
              onChange={(e) => setMetaField("category", e.target.value)}
              className={inp}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Difficulty">
            <select
              value={meta.difficulty}
              onChange={(e) =>
                setMetaField("difficulty", e.target.value as never)
              }
              className={inp}
            >
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </Field>
          <Field label="Time Limit (seconds)">
            <input
              type="number"
              min={30}
              max={3600}
              value={meta.timeLimitSec}
              onChange={(e) =>
                setMetaField("timeLimitSec", parseInt(e.target.value))
              }
              className={inp}
            />
          </Field>
        </div>
      </section>

      {/* Rewards & Limits */}
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Rewards & Limits</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Points Reward">
            <input
              type="number"
              min={0}
              value={meta.pointsReward}
              onChange={(e) =>
                setMetaField("pointsReward", parseInt(e.target.value))
              }
              className={inp}
            />
          </Field>
          <Field label="XP Reward">
            <input
              type="number"
              min={0}
              value={meta.xpReward}
              onChange={(e) =>
                setMetaField("xpReward", parseInt(e.target.value))
              }
              className={inp}
            />
          </Field>
          <Field label="Cash Bonus ($)">
            <input
              type="number"
              min={0}
              step={0.01}
              value={meta.cashReward}
              onChange={(e) =>
                setMetaField("cashReward", parseFloat(e.target.value))
              }
              className={inp}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Passing Score (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={meta.passingScore}
              onChange={(e) =>
                setMetaField("passingScore", parseInt(e.target.value))
              }
              className={inp}
            />
          </Field>
          <Field label="Max Attempts">
            <input
              type="number"
              min={1}
              value={meta.maxAttempts}
              onChange={(e) =>
                setMetaField("maxAttempts", parseInt(e.target.value))
              }
              className={inp}
            />
          </Field>
          <Field label="Cooldown (hrs)">
            <input
              type="number"
              min={0}
              value={meta.cooldownHours}
              onChange={(e) =>
                setMetaField("cooldownHours", parseInt(e.target.value))
              }
              className={inp}
            />
          </Field>
          <Field label="Required Level">
            <input
              type="number"
              min={1}
              max={100}
              value={meta.requiredLevel}
              onChange={(e) =>
                setMetaField("requiredLevel", parseInt(e.target.value))
              }
              className={inp}
            />
          </Field>
        </div>
        <Field label="Required Package">
          <select
            value={meta.requiredPackage}
            onChange={(e) =>
              setMetaField("requiredPackage", e.target.value as never)
            }
            className={inp}
          >
            <option value="">None — open to all</option>
            <option value="FREE">FREE</option>
            <option value="STARTER">STARTER</option>
            <option value="PRO">PRO</option>
            <option value="ELITE">ELITE</option>
            <option value="VIP">VIP</option>
          </select>
        </Field>
      </section>

      {/* Questions */}
      <section className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Questions ({questions.length})
          </h2>
          <button
            onClick={addQuestion}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Question
          </button>
        </div>
        <div className="space-y-4">
          {questions.map((q, qi) => (
            <div
              key={qi}
              className="rounded-lg border border-slate-800 bg-slate-950/50 p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Question {qi + 1}
                </span>
                {questions.length > 1 && (
                  <button
                    onClick={() => removeQuestion(qi)}
                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Field label="Question text">
                <textarea
                  rows={2}
                  value={q.question}
                  onChange={(e) =>
                    updateQuestion(qi, { question: e.target.value })
                  }
                  className={inp + " resize-none"}
                />
              </Field>
              <Field label="Question image (optional — players answer from the image)">
                <ImageUploadField
                  value={q.questionImageUrl ?? ""}
                  onChange={(url) => updateQuestion(qi, { questionImageUrl: url })}
                  title="Question image"
                  previewSize="md"
                />
              </Field>
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-slate-400">
                  Options (mark the correct one — add an image per option if you like)
                </p>
                {q.options.map((opt, oi) => (
                  <div
                    key={oi}
                    className={`p-2 rounded border ${
                      q.correctIndex === oi
                        ? "border-emerald-500/50 bg-emerald-500/5"
                        : "border-slate-700 bg-slate-900"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={q.correctIndex === oi}
                        onChange={() => updateQuestion(qi, { correctIndex: oi })}
                        className="text-emerald-500"
                        title="Mark as correct answer"
                      />
                      <span className="text-xs font-bold text-slate-500 w-6">
                        {String.fromCharCode(65 + oi)}.
                      </span>
                      <input
                        value={opt}
                        onChange={(e) => updateOption(qi, oi, e.target.value)}
                        className="flex-1 bg-transparent outline-none text-sm text-white"
                        placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                      />
                    </div>
                    <div className="mt-2 pl-8">
                      <ImageUploadField
                        value={q.optionImageUrls?.[oi] ?? ""}
                        onChange={(url) => updateOptionImage(qi, oi, url)}
                        title={`Image for option ${String.fromCharCode(65 + oi)}`}
                        previewSize="sm"
                        hideUrlFallback
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Field label="Explanation (shown after answer)">
                <input
                  value={q.explanation ?? ""}
                  onChange={(e) =>
                    updateQuestion(qi, { explanation: e.target.value })
                  }
                  className={inp}
                  placeholder="Optional"
                />
              </Field>
            </div>
          ))}
        </div>
      </section>

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => router.push("/admin/quizzes")}
          disabled={submitting}
          className="px-4 py-2 text-slate-400 hover:text-white"
        >
          Cancel
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => submit(false)}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Save as Draft
          </button>
          <button
            onClick={() => submit(true)}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isEdit ? "Save & Publish" : "Publish Quiz"}
          </button>
        </div>
      </div>

      {/* AI Generate Modal */}
      {aiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white inline-flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                AI Quiz Generator
              </h3>
              <button
                onClick={() => setAiOpen(false)}
                className="p-2 hover:bg-slate-700 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Topic *">
                <input
                  autoFocus
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  className={inp}
                  placeholder="e.g. Cryptocurrency fundamentals"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="# of Questions">
                  <select
                    value={aiCount}
                    onChange={(e) => setAiCount(parseInt(e.target.value))}
                    className={inp}
                  >
                    {[5, 10, 15, 20].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Difficulty">
                  <select
                    value={aiDifficulty}
                    onChange={(e) =>
                      setAiDifficulty(
                        e.target.value as "easy" | "medium" | "hard"
                      )
                    }
                    className={inp}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </Field>
              </div>
              <p className="text-xs text-slate-500">
                Existing questions will be replaced. You can edit them before publishing.
              </p>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-700">
              <button
                onClick={() => setAiOpen(false)}
                disabled={aiBusy}
                className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={generateWithAI}
                disabled={aiBusy || !aiTopic.trim()}
                className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {aiBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
