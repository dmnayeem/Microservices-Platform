"use client";

import { useState } from "react";
import { Sparkles, Loader2, Copy, RefreshCw, Check } from "lucide-react";
import { toast } from "@/lib/toast";

const TYPES = [
  { value: "quiz", label: "Quiz Questions" },
  { value: "social_post", label: "Social Post" },
  { value: "task_description", label: "Task Description" },
  { value: "course_outline", label: "Course Outline" },
  { value: "article", label: "Article" },
  { value: "marketing_copy", label: "Marketing Copy" },
] as const;

type ContentType = (typeof TYPES)[number]["value"];

interface AiContentGeneratorProps {
  configured: boolean;
}

interface GeneratedQuiz {
  type: "quiz";
  questions: Array<{
    question: string;
    options: string[];
    correctAnswer: number;
    explanation?: string;
  }>;
}

interface GeneratedText {
  type: Exclude<ContentType, "quiz">;
  text: string;
}

type GeneratedOutput = GeneratedQuiz | GeneratedText;

export function AiContentGenerator({ configured }: AiContentGeneratorProps) {
  const [type, setType] = useState<ContentType>("social_post");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<"informative" | "casual" | "professional" | "exciting">(
    "informative"
  );
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [maxLength, setMaxLength] = useState(280);
  const [includeEmojis, setIncludeEmojis] = useState(true);
  const [includeHashtags, setIncludeHashtags] = useState(true);

  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<GeneratedOutput | null>(null);

  const generate = async () => {
    if (!topic.trim()) {
      toast.error("Topic is required");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { type, topic };
      if (type === "quiz") {
        body.count = count;
        body.difficulty = difficulty;
      } else if (type === "social_post" || type === "marketing_copy") {
        body.tone = tone;
        body.maxLength = maxLength;
        body.includeEmojis = includeEmojis;
        body.includeHashtags = includeHashtags;
      } else {
        body.tone = tone;
        body.maxLength = maxLength;
      }

      const res = await fetch("/api/admin/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setOutput(data.output as GeneratedOutput);
      toast.success("Generated");
    } catch (err) {
      toast.error("Generation failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!output) return;
    const text =
      output.type === "quiz"
        ? JSON.stringify(output.questions, null, 2)
        : output.text;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white inline-flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          Content Generator
        </h2>
        {!configured && (
          <span className="text-xs text-amber-400">
            Set GEMINI_API_KEY to enable
          </span>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Content Type
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ContentType)}
          className={inp}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Topic *
        </label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className={inp}
          placeholder="e.g. Cryptocurrency fundamentals for beginners"
        />
      </div>

      {type === "quiz" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              # of Questions
            </label>
            <select
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value))}
              className={inp}
            >
              {[5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Difficulty
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as never)}
              className={inp}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
      )}

      {type !== "quiz" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Tone
            </label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as never)}
              className={inp}
            >
              <option value="informative">Informative</option>
              <option value="casual">Casual</option>
              <option value="professional">Professional</option>
              <option value="exciting">Exciting</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Max Length (chars)
            </label>
            <input
              type="number"
              min={20}
              max={2000}
              value={maxLength}
              onChange={(e) => setMaxLength(parseInt(e.target.value))}
              className={inp}
            />
          </div>
        </div>
      )}

      {(type === "social_post" || type === "marketing_copy") && (
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              checked={includeEmojis}
              onChange={(e) => setIncludeEmojis(e.target.checked)}
              className="rounded bg-slate-800 border-slate-600 text-blue-500"
            />
            Include emojis
          </label>
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              checked={includeHashtags}
              onChange={(e) => setIncludeHashtags(e.target.checked)}
              className="rounded bg-slate-800 border-slate-600 text-blue-500"
            />
            Include hashtags
          </label>
        </div>
      )}

      <button
        onClick={generate}
        disabled={busy || !configured || !topic.trim()}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        Generate
      </button>

      {/* Output */}
      {output && (
        <div className="rounded-lg border border-slate-700 bg-slate-950 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">
              Generated {output.type.replace("_", " ")}
            </p>
            <div className="flex gap-2">
              <button
                onClick={copy}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 text-white rounded hover:bg-slate-700"
              >
                <Copy className="w-3 h-3" />
                Copy
              </button>
              <button
                onClick={generate}
                disabled={busy}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 text-white rounded hover:bg-slate-700 disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate
              </button>
            </div>
          </div>
          {output.type === "quiz" ? (
            <div className="space-y-3">
              {output.questions.map((q, i) => (
                <div key={i} className="border border-slate-700 rounded p-3">
                  <p className="text-sm text-white font-medium mb-2">
                    {i + 1}. {q.question}
                  </p>
                  <div className="space-y-1">
                    {q.options.map((o, oi) => (
                      <div
                        key={oi}
                        className={`text-sm flex items-center gap-2 px-2 py-1 rounded ${
                          oi === q.correctAnswer
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "text-slate-400"
                        }`}
                      >
                        {oi === q.correctAnswer && (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span className="font-bold w-5">
                          {String.fromCharCode(65 + oi)}.
                        </span>
                        {o}
                      </div>
                    ))}
                  </div>
                  {q.explanation && (
                    <p className="text-xs text-slate-500 mt-2 italic">
                      {q.explanation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <pre className="text-sm text-slate-200 whitespace-pre-wrap font-sans">
              {output.text}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const inp =
  "w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500";
