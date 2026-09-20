"use client";

import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import {
  BUYER_APPINSTALL_NOTICE,
  BUYER_ARTICLE_NOTICE,
  BUYER_QUIZ_NOTICE,
} from "@/lib/buyer-task-configs";
import type { ProofItemKind } from "@/lib/app-install-tasks";

/**
 * The buyer's builders for QUIZ, ARTICLE and APPINSTALL.
 *
 * Same shape as `survey-builder.tsx`: a draft type, an `emptyX()`, a
 * `xDraftProblem()` that applies the SAME rules the server does so the buyer is
 * told before they submit rather than after, and a component that edits the
 * draft in place. The server is still the authority — these schemas live in
 * `src/lib/buyer-task-configs.ts` and are checked on create AND on edit.
 *
 * Each builder leads with the notice for its type. A hazard explained after the
 * fact is a hazard nobody was warned about.
 */

const inputCls =
  "w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-(--app-accent-edge)";
const labelCls = "block text-xs font-medium text-(--app-ink-3) mb-1.5";

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-(--app-accent-edge)/30 bg-(--app-cta)/5 px-3 py-2">
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--app-accent-ink)" />
      <p className="text-[11px] leading-snug text-(--app-accent-ink)/80">{children}</p>
    </div>
  );
}

/* ────────────────────────────── QUIZ ───────────────────────────────────── */

export interface QuizDraftQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface QuizDraft {
  questions: QuizDraftQuestion[];
}

export function emptyQuizDraft(): QuizDraft {
  return { questions: [] };
}

function emptyQuizQuestion(): QuizDraftQuestion {
  return { question: "", options: ["", ""], correctIndex: 0, explanation: "" };
}

/** The same rules the server applies. */
export function quizDraftProblem(d: QuizDraft): string | null {
  if (d.questions.length === 0) return "Add at least one question.";
  if (d.questions.length > 25) return "A quiz can have at most 25 questions.";
  for (const q of d.questions) {
    if (q.question.trim().length < 3) return "Every question needs a prompt.";
    const opts = q.options.map((o) => o.trim());
    if (opts.length < 2 || opts.some((o) => !o)) {
      return `"${q.question || "A question"}" needs at least 2 filled-in options.`;
    }
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) {
      return `"${q.question}" has the same option twice.`;
    }
    if (q.correctIndex < 0 || q.correctIndex >= opts.length) {
      return `Pick the correct answer for "${q.question}".`;
    }
  }
  return null;
}

export function QuizBuilder({
  value,
  onChange,
}: {
  value: QuizDraft;
  onChange: (v: QuizDraft) => void;
}) {
  const set = (i: number, patch: Partial<QuizDraftQuestion>) =>
    onChange({
      questions: value.questions.map((q, n) => (n === i ? { ...q, ...patch } : q)),
    });

  return (
    <div className="space-y-3">
      <Notice>{BUYER_QUIZ_NOTICE}</Notice>

      {value.questions.map((q, i) => (
        <div
          key={i}
          className="space-y-2 rounded-xl border border-(--app-line) bg-(--app-surface)/40 p-3"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-(--app-ink-3)">Q{i + 1}</span>
            <button
              type="button"
              onClick={() =>
                onChange({
                  questions: value.questions.filter((_, n) => n !== i),
                })
              }
              className="ml-auto rounded p-1 text-(--app-ink-3) hover:bg-(--app-surface-2) hover:text-red-400"
              aria-label={`Remove question ${i + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            value={q.question}
            onChange={(e) => set(i, { question: e.target.value })}
            placeholder="What do you want to ask?"
            className={inputCls}
          />
          <div className="space-y-1.5">
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${i}`}
                  checked={q.correctIndex === oi}
                  onChange={() => set(i, { correctIndex: oi })}
                  className="border-(--app-line) bg-(--app-surface-2) text-emerald-500 focus:ring-emerald-500"
                  aria-label={`Option ${oi + 1} is correct`}
                />
                <input
                  value={opt}
                  onChange={(e) =>
                    set(i, {
                      options: q.options.map((o, n) =>
                        n === oi ? e.target.value : o
                      ),
                    })
                  }
                  placeholder={`Option ${oi + 1}`}
                  className={inputCls}
                />
                {q.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() =>
                      set(i, {
                        options: q.options.filter((_, n) => n !== oi),
                        correctIndex:
                          q.correctIndex >= oi && q.correctIndex > 0
                            ? q.correctIndex - 1
                            : q.correctIndex,
                      })
                    }
                    className="rounded p-1 text-(--app-ink-3) hover:text-red-400"
                    aria-label={`Remove option ${oi + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {q.options.length < 6 && (
              <button
                type="button"
                onClick={() => set(i, { options: [...q.options, ""] })}
                className="text-[11px] font-semibold text-(--app-accent-ink) hover:text-(--app-accent-ink)"
              >
                + Add option
              </button>
            )}
          </div>
          <p className="text-[11px] text-(--app-ink-3)">
            The green dot marks the right answer. It stays on our server —
            workers never receive it.
          </p>
          <input
            value={q.explanation}
            onChange={(e) => set(i, { explanation: e.target.value })}
            placeholder="Explanation shown after answering (optional)"
            className={inputCls}
          />
        </div>
      ))}

      {value.questions.length < 25 && (
        <button
          type="button"
          onClick={() =>
            onChange({ questions: [...value.questions, emptyQuizQuestion()] })
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-(--app-line) px-3 py-2 text-xs font-semibold text-(--app-ink) hover:bg-(--app-surface-2)"
        >
          <Plus className="h-3.5 w-3.5" /> Add question
        </button>
      )}
    </div>
  );
}

/* ───────────────────────────── ARTICLE ─────────────────────────────────── */

export interface ArticleDraft {
  brief: string;
  minWords: number;
  requireUrl: boolean;
  requireScreenshot: boolean;
}

export function emptyArticleDraft(): ArticleDraft {
  return {
    brief: "",
    minWords: 300,
    requireUrl: false,
    requireScreenshot: false,
  };
}

export function articleDraftProblem(d: ArticleDraft): string | null {
  if (d.brief.trim().length < 20) {
    return "Write a brief — at least a couple of sentences on what you want written.";
  }
  if (d.minWords < 50 || d.minWords > 5000) {
    return "The word count must be between 50 and 5,000.";
  }
  return null;
}

export function ArticleBuilder({
  value,
  onChange,
}: {
  value: ArticleDraft;
  onChange: (v: ArticleDraft) => void;
}) {
  const set = (patch: Partial<ArticleDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <Notice>{BUYER_ARTICLE_NOTICE}</Notice>
      <div>
        <label className={labelCls}>What should they write?</label>
        <textarea
          rows={5}
          value={value.brief}
          onChange={(e) => set({ brief: e.target.value })}
          placeholder="Topic, angle, tone, what to mention, what to avoid…"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Minimum words</label>
        <input
          type="number"
          min={50}
          max={5000}
          value={value.minWords}
          onChange={(e) => set({ minWords: parseInt(e.target.value, 10) || 0 })}
          className={inputCls}
        />
        <p className="mt-1 text-[11px] text-(--app-ink-3)">
          Anything shorter is refused at submit time — you never see it.
        </p>
      </div>
      <label className="flex items-center gap-2 text-xs text-(--app-ink-2)">
        <input
          type="checkbox"
          checked={value.requireUrl}
          onChange={(e) => set({ requireUrl: e.target.checked })}
          className="rounded border-(--app-line) bg-(--app-surface-2) text-(--app-accent-ink) focus:ring-indigo-500"
        />
        Also require a link to where they published it
      </label>
      <label className="flex items-center gap-2 text-xs text-(--app-ink-2)">
        <input
          type="checkbox"
          checked={value.requireScreenshot}
          onChange={(e) => set({ requireScreenshot: e.target.checked })}
          className="rounded border-(--app-line) bg-(--app-surface-2) text-(--app-accent-ink) focus:ring-indigo-500"
        />
        Also require a screenshot
      </label>
    </div>
  );
}

/* ──────────────────────────── APPINSTALL ───────────────────────────────── */

export interface ProofItemDraft {
  kind: ProofItemKind;
  label: string;
  target: number;
  screenshot: boolean;
  valueLabel: string;
}

export interface AppInstallDraft {
  appName: string;
  appKind: "app" | "game";
  description: string;
  playStoreUrl: string;
  appStoreUrl: string;
  proofItems: ProofItemDraft[];
}

export function emptyAppInstallDraft(): AppInstallDraft {
  return {
    appName: "",
    appKind: "app",
    description: "",
    playStoreUrl: "",
    appStoreUrl: "",
    // Deliberately NOT pre-filled with a lone install screenshot. The buyer has
    // to choose what counts as proof, because the weak default is the whole
    // fraud problem with this task type.
    proofItems: [],
  };
}

const PROOF_KINDS: { kind: ProofItemKind; label: string; hint: string }[] = [
  { kind: "INSTALL", label: "Installed it", hint: "One screenshot. Easiest to fake or share." },
  { kind: "LEVEL", label: "Reached a level", hint: "Takes real play. Hard to fake." },
  { kind: "DAYS", label: "Opened it on N days", hint: "Takes real days. Hardest to fake." },
  { kind: "PLAYTIME", label: "Played N minutes", hint: "Takes real time in the app." },
  { kind: "CUSTOM", label: "Something else", hint: "You describe it; you review it." },
];

const NEEDS_TARGET = new Set<ProofItemKind>(["LEVEL", "DAYS", "PLAYTIME"]);

export function appInstallDraftProblem(d: AppInstallDraft): string | null {
  if (d.appName.trim().length < 2) return "Give the app a name.";
  if (!d.playStoreUrl.trim() && !d.appStoreUrl.trim()) {
    return "Add a Google Play or App Store link.";
  }
  if (
    d.playStoreUrl.trim() &&
    !/play\.google\.com\/store\/apps\/details/i.test(d.playStoreUrl)
  ) {
    return "That doesn't look like a Google Play app link.";
  }
  if (
    d.appStoreUrl.trim() &&
    !/apps\.apple\.com|itunes\.apple\.com/i.test(d.appStoreUrl)
  ) {
    return "That doesn't look like an App Store link.";
  }
  if (d.proofItems.length === 0) {
    return "Choose at least one thing a worker has to prove.";
  }
  for (const p of d.proofItems) {
    if (NEEDS_TARGET.has(p.kind) && (!p.target || p.target < 1)) {
      return "Level, days and playtime requirements need a number.";
    }
    if (p.kind === "CUSTOM" && !p.label.trim()) {
      return "Say what the custom requirement asks for.";
    }
    if (!p.screenshot && !p.valueLabel.trim()) {
      return "Every requirement needs a screenshot or a typed value — otherwise there's nothing to check.";
    }
  }
  return null;
}

export function AppInstallBuilder({
  value,
  onChange,
}: {
  value: AppInstallDraft;
  onChange: (v: AppInstallDraft) => void;
}) {
  const set = (patch: Partial<AppInstallDraft>) =>
    onChange({ ...value, ...patch });
  const setItem = (i: number, patch: Partial<ProofItemDraft>) =>
    set({
      proofItems: value.proofItems.map((p, n) =>
        n === i ? { ...p, ...patch } : p
      ),
    });

  return (
    <div className="space-y-3">
      <Notice>{BUYER_APPINSTALL_NOTICE}</Notice>

      <div>
        <label className={labelCls}>App name</label>
        <input
          value={value.appName}
          onChange={(e) => set({ appName: e.target.value })}
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["app", "game"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => set({ appKind: k })}
            className={`rounded-lg border py-2 text-xs font-semibold capitalize ${
              value.appKind === k
                ? "border-(--app-accent-edge) bg-(--app-cta)/10 text-(--app-accent-ink)"
                : "border-(--app-line) text-(--app-ink-2) hover:bg-(--app-surface-2)"
            }`}
          >
            {k}
          </button>
        ))}
      </div>
      <div>
        <label className={labelCls}>Google Play link</label>
        <input
          value={value.playStoreUrl}
          onChange={(e) => set({ playStoreUrl: e.target.value })}
          placeholder="https://play.google.com/store/apps/details?id=…"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>App Store link</label>
        <input
          value={value.appStoreUrl}
          onChange={(e) => set({ appStoreUrl: e.target.value })}
          placeholder="https://apps.apple.com/app/id…"
          className={inputCls}
        />
      </div>

      <div className="space-y-2">
        <p className={labelCls}>What has to be proved?</p>
        {value.proofItems.length === 0 && (
          <p className="text-[11px] text-amber-300/80">
            Nothing chosen yet. One install screenshot is the easiest thing on
            this platform to fake — ask for something that takes time in the app.
          </p>
        )}
        {value.proofItems.map((p, i) => {
          const meta = PROOF_KINDS.find((k) => k.kind === p.kind);
          return (
            <div
              key={i}
              className="space-y-2 rounded-xl border border-(--app-line) bg-(--app-surface)/40 p-3"
            >
              <div className="flex items-center gap-2">
                <select
                  value={p.kind}
                  onChange={(e) =>
                    setItem(i, { kind: e.target.value as ProofItemKind })
                  }
                  className={inputCls}
                >
                  {PROOF_KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    set({
                      proofItems: value.proofItems.filter((_, n) => n !== i),
                    })
                  }
                  className="rounded p-1 text-(--app-ink-3) hover:text-red-400"
                  aria-label={`Remove requirement ${i + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {meta && <p className="text-[11px] text-(--app-ink-3)">{meta.hint}</p>}
              {NEEDS_TARGET.has(p.kind) && (
                <input
                  type="number"
                  min={1}
                  value={p.target || ""}
                  onChange={(e) =>
                    setItem(i, { target: parseInt(e.target.value, 10) || 0 })
                  }
                  placeholder={
                    p.kind === "LEVEL"
                      ? "Level"
                      : p.kind === "DAYS"
                        ? "Days"
                        : "Minutes"
                  }
                  className={inputCls}
                />
              )}
              {p.kind === "CUSTOM" && (
                <input
                  value={p.label}
                  onChange={(e) => setItem(i, { label: e.target.value })}
                  placeholder="What must the worker show?"
                  className={inputCls}
                />
              )}
              <label className="flex items-center gap-2 text-xs text-(--app-ink-2)">
                <input
                  type="checkbox"
                  checked={p.screenshot}
                  onChange={(e) => setItem(i, { screenshot: e.target.checked })}
                  className="rounded border-(--app-line) bg-(--app-surface-2) text-(--app-accent-ink) focus:ring-indigo-500"
                />
                Require a screenshot for this
              </label>
              <input
                value={p.valueLabel}
                onChange={(e) => setItem(i, { valueLabel: e.target.value })}
                placeholder="…and/or a typed value, e.g. &quot;Level reached&quot; (optional)"
                className={inputCls}
              />
            </div>
          );
        })}
        {value.proofItems.length < 8 && (
          <button
            type="button"
            onClick={() =>
              set({
                proofItems: [
                  ...value.proofItems,
                  {
                    kind: "INSTALL",
                    label: "",
                    target: 0,
                    screenshot: true,
                    valueLabel: "",
                  },
                ],
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-(--app-line) px-3 py-2 text-xs font-semibold text-(--app-ink) hover:bg-(--app-surface-2)"
          >
            <Plus className="h-3.5 w-3.5" /> Add a requirement
          </button>
        )}
      </div>
    </div>
  );
}
