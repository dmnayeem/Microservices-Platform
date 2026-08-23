/**
 * One normalizer for `Task.questions` and `TaskSubmission.answers`.
 *
 * Both columns are `Json?`, and both have accumulated more than one shape over
 * the life of the app. Every reader used to cast the raw value and hope:
 *
 *  - **`Task.questions` is sometimes a JSON STRING**, not an array — the seed
 *    writes `JSON.stringify([...])` (prisma/seed.ts). A `.length` check passes
 *    on a non-empty string, so `QuizProofPanel` reached `.reduce` on a String
 *    and threw "questions.reduce is not a function"; the grader in
 *    `api/tasks/[id]/submit` casts the same value to an array and would throw
 *    the same way. Guard with `Array.isArray`, never `.length`.
 *  - **The correct-answer key has three names.** The seed writes `correct`, the
 *    admin task form writes `correctAnswer`, and the separate Quiz *Games*
 *    system (`model Quiz` / `QuizQuestion`) uses `correctIndex`. A reader
 *    looking for only one of them scores every answer wrong and reports 0/N
 *    without erroring — which is worse than the crash, because it looks like
 *    the user failed.
 *  - **`TaskSubmission.answers` is sometimes an object.** `api/tasks/quiz`
 *    stores `{questions, userAnswers, results}` while `api/tasks/[id]/submit`
 *    stores a bare positional array. Casting the object to `number[]` yields
 *    `undefined` at every index, so every question renders as "didn't answer".
 *
 * Prisma-free and `server-only`-free on purpose, so client components and
 * throwaway scripts can both import it.
 */

/** A question after normalizing, whichever shape it was stored in. */
export interface QuizQuestionShape {
  question: string;
  options: string[];
  /** Normalized index into `options`. `-1` = no correct answer configured. */
  correctAnswer: number;
  explanation?: string;
  imageUrl?: string;
}

/** `-1` when a question has no usable correct-answer key. Never matches a pick. */
export const NO_CORRECT_ANSWER = -1;

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.map((o) => (typeof o === "string" ? o : String(o ?? "")));
}

/**
 * Read the correct-answer index under any of its three historical names.
 * Out-of-range values are rejected rather than trusted — an index pointing past
 * the options array would silently mark every answer wrong.
 */
function readCorrectIndex(q: Record<string, unknown>, optionCount: number): number {
  for (const key of ["correctAnswer", "correct", "correctIndex"] as const) {
    const raw = q[key];
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isInteger(n) && n >= 0 && n < optionCount) return n;
  }
  return NO_CORRECT_ANSWER;
}

/**
 * Normalize a stored `Task.questions` value.
 *
 * Returns null when there is nothing usable — an empty array, an unparseable
 * string, or entries missing a question/options pair. Callers treat null as
 * "this quiz has no predefined questions".
 */
export function coerceQuizQuestions(raw: unknown): QuizQuestionShape[] | null {
  let val: unknown = raw;
  // Double-encoded rows: a JSON string holding the array.
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(val) || val.length === 0) return null;

  const out: QuizQuestionShape[] = [];
  for (const entry of val) {
    if (!entry || typeof entry !== "object") return null;
    const q = entry as Record<string, unknown>;
    if (typeof q.question !== "string") return null;
    const options = asStringArray(q.options);
    if (!options || options.length === 0) return null;

    out.push({
      question: q.question,
      options,
      correctAnswer: readCorrectIndex(q, options.length),
      ...(typeof q.explanation === "string" ? { explanation: q.explanation } : {}),
      ...(typeof q.imageUrl === "string" ? { imageUrl: q.imageUrl } : {}),
    });
  }
  return out;
}

/**
 * Normalize a stored `TaskSubmission.answers` value into positional picks.
 *
 * Accepts the bare `number[]` written by `api/tasks/[id]/submit` and the
 * `{questions, userAnswers, results}` object written by `api/tasks/quiz`.
 * A missing or unanswered slot is `null`, which is distinct from index 0 —
 * conflating them is what made "didn't answer" render as "picked the first
 * option".
 */
export function coerceQuizAnswers(raw: unknown): (number | null)[] {
  let val: unknown = raw;
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch {
      return [];
    }
  }
  if (val && typeof val === "object" && !Array.isArray(val)) {
    val = (val as { userAnswers?: unknown }).userAnswers;
  }
  if (!Array.isArray(val)) return [];

  return val.map((a) => {
    const n = typeof a === "number" ? a : Number(a);
    // The quiz player sends -1 for "skipped" (quiz-player.tsx: `answers[i] ?? -1`).
    if (!Number.isInteger(n) || n < 0) return null;
    return n;
  });
}

/** Correct-answer count for a graded submission. */
export function scoreQuiz(
  questions: QuizQuestionShape[],
  answers: (number | null)[]
): number {
  let correct = 0;
  for (let i = 0; i < questions.length; i++) {
    const pick = answers[i];
    if (pick === null || pick === undefined) continue;
    if (questions[i].correctAnswer === NO_CORRECT_ANSWER) continue;
    if (pick === questions[i].correctAnswer) correct++;
  }
  return correct;
}

/**
 * The pass mark for a quiz task, as a percentage.
 *
 * There were two quiz submission paths with two different payout rules:
 * `/api/tasks/quiz` required 70% and paid pro-rata to the score, while
 * `/api/tasks/[id]/submit` computed a score, ignored it entirely, and paid the
 * FULL reward — so the same quiz answered 0% paid nothing through one route and
 * everything through the other. Both now call the function below.
 */
export const QUIZ_PASS_PERCENT = 70;

/**
 * What a quiz submission earns: nothing below the pass mark, otherwise the
 * reward scaled by the score. Rounded down so a partial score never pays more
 * than the fraction earned.
 */
export function quizPayout(scorePercent: number, fullReward: number): number {
  if (!Number.isFinite(scorePercent) || scorePercent < QUIZ_PASS_PERCENT) return 0;
  const pct = Math.max(0, Math.min(100, scorePercent));
  return Math.floor((fullReward * pct) / 100);
}
