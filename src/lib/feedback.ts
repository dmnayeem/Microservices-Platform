/**
 * Feedback Hub — shared, client-safe parts (server logic: ./feedback-server.ts).
 *
 *  - A monthly feedback round: the admin's questions (star rating, 0–10
 *    "would you recommend", multiple choice, written answer), a small
 *    one-time reward for a complete, genuine answer.
 *  - A feature-idea board: members post ideas and upvote; the admin moves an
 *    idea to Planned / In progress / Shipped, and voters hear when it ships.
 */

export const QUESTION_TYPES = ["RATING", "NPS", "CHOICE", "TEXT"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  RATING: "Star rating (1–5)",
  NPS: "Would you recommend us? (0–10)",
  CHOICE: "Multiple choice",
  TEXT: "Written answer",
};

export interface FeedbackQuestion {
  id: string;
  type: QuestionType;
  label: string;
  options?: string[];
  required: boolean;
}

export type FeedbackAnswers = Record<string, number | string>;

/** Shortest written answer that counts (stops "ok" earning a reward). */
export const MIN_TEXT_ANSWER = 10;

export const IDEA_STATUSES = ["OPEN", "PLANNED", "IN_PROGRESS", "SHIPPED", "DECLINED", "HIDDEN"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];
export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  OPEN: "Open",
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  SHIPPED: "Shipped",
  DECLINED: "Not planned",
  HIDDEN: "Hidden",
};

/** Admin's question list → clean list (or an error). */
export function parseQuestions(raw: unknown): { ok: true; value: FeedbackQuestion[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Add at least one question." };
  if (raw.length > 30) return { ok: false, error: "At most 30 questions." };
  const out: FeedbackQuestion[] = [];
  const ids = new Set<string>();
  for (const [i, q] of raw.entries()) {
    const o = (q && typeof q === "object" ? q : {}) as Record<string, unknown>;
    const type = String(o.type ?? "") as QuestionType;
    if (!QUESTION_TYPES.includes(type)) return { ok: false, error: `Question ${i + 1}: pick a type.` };
    const label = String(o.label ?? "").trim().slice(0, 300);
    if (label.length < 3) return { ok: false, error: `Question ${i + 1}: write the question.` };
    let id = String(o.id ?? "").trim().slice(0, 40) || `q${i + 1}`;
    while (ids.has(id)) id = `${id}_`;
    ids.add(id);
    const options =
      type === "CHOICE"
        ? (Array.isArray(o.options) ? o.options : [])
            .map((x) => String(x).trim().slice(0, 120))
            .filter(Boolean)
            .slice(0, 12)
        : undefined;
    if (type === "CHOICE" && (!options || options.length < 2)) {
      return { ok: false, error: `Question ${i + 1}: give at least two choices.` };
    }
    out.push({ id, type, label, ...(options ? { options } : {}), required: o.required !== false });
  }
  return { ok: true, value: out };
}

/** A member's answers → only valid values, plus whether every required one is there. */
export function cleanAnswers(
  questions: FeedbackQuestion[],
  raw: unknown
): { answers: FeedbackAnswers; complete: boolean; missing: string | null } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const answers: FeedbackAnswers = {};
  let missing: string | null = null;
  for (const q of questions) {
    const v = r[q.id];
    let ok = false;
    if (q.type === "RATING" || q.type === "NPS") {
      const n = Math.round(Number(v));
      const [lo, hi] = q.type === "RATING" ? [1, 5] : [0, 10];
      if (v !== "" && v !== null && v !== undefined && Number.isFinite(n) && n >= lo && n <= hi) {
        answers[q.id] = n;
        ok = true;
      }
    } else if (q.type === "CHOICE") {
      const s = String(v ?? "");
      if (q.options?.includes(s)) {
        answers[q.id] = s;
        ok = true;
      }
    } else {
      const s = String(v ?? "").trim().slice(0, 2000);
      if (s) answers[q.id] = s;
      ok = s.length >= MIN_TEXT_ANSWER;
    }
    if (!ok && q.required && !missing) missing = q.label;
  }
  return { answers, complete: !missing, missing };
}

/** Net Promoter Score from 0–10 answers: % promoters (9–10) − % detractors (0–6). */
export function npsOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const pro = values.filter((v) => v >= 9).length;
  const det = values.filter((v) => v <= 6).length;
  return Math.round(((pro - det) / values.length) * 100);
}
