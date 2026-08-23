import { coerceQuizQuestions } from "@/lib/quiz-shape";

/**
 * Strip everything the browser must not see from a Task before sending it.
 *
 * The two hottest task endpoints — `GET /api/tasks/:id` and
 * `POST /api/tasks/:id/start` — shipped the whole row. That meant the client
 * received:
 *
 *   - `questions` **with `correctAnswer`** — the quiz answer key. Grading was
 *     hardened server-side in an earlier pass so the browser can't send its own
 *     key, but that is worth nothing while the real key is sitting in the
 *     network tab.
 *   - `videoConfig.uniqueKey` and `articleConfig.uniqueKey` — the exact values
 *     the submit route validates proof against. "Watch the video to find the
 *     code" is not a check if the code arrives with the page.
 *   - `fundedByUserId`, `budgetPoints`, `remainingBudget`, `createdById`,
 *     `hidden` — internal bookkeeping with no business on a player screen.
 *
 * `/api/tasks/quiz` already had a private `toPlayerQuestions()`; this is that
 * idea applied to every field and shared, so a third endpoint can't reintroduce
 * the leak by spreading the row again.
 *
 * Prisma-free on purpose — it takes a plain object, so verification scripts and
 * client code can both import it.
 */

/** A question as the player sees it: prompt and options, no answer. */
export interface PlayerQuestion {
  id: number;
  question: string;
  options: string[];
  imageUrl?: string;
}

export function toPlayerQuestions(raw: unknown): PlayerQuestion[] {
  // `coerceQuizQuestions` returns null for a malformed or empty set — an empty
  // array is the right player-facing answer either way, and it must never fall
  // back to the raw value, which is what carries the key.
  return (coerceQuizQuestions(raw) ?? []).map((q, i) => ({
    id: i,
    question: q.question,
    options: q.options,
    ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
  }));
}

/**
 * Remove the answer from a proof config while keeping the hint.
 *
 * The *hint* ("the code appears at 3:20") is written for the user and must
 * survive; only `uniqueKey` — the value `compareUniqueKey` checks against — is
 * secret.
 */
export function stripUniqueKey(config: unknown): unknown {
  if (!config || typeof config !== "object") return config;
  const { uniqueKey: _uniqueKey, ...rest } = config as Record<string, unknown>;
  return rest;
}

/** Fields that exist for the platform's bookkeeping, never for a player. */
const INTERNAL_FIELDS = [
  "fundedByUserId",
  "budgetPoints",
  "remainingBudget",
  "createdById",
  "hidden",
  "costUsd",
] as const;

/**
 * Sanitise a full Task row for a player-facing response.
 *
 * Pass the row through this instead of spreading it. Anything genuinely new on
 * the model shows up in the response by default, which is the right trade —
 * a missing field is a visible bug, a leaked secret is a silent one — so the
 * secrets are listed explicitly here rather than the response being a whitelist
 * that silently drops new UI fields.
 */
export function toPlayerTask<T extends Record<string, unknown>>(
  task: T
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...task };

  for (const f of INTERNAL_FIELDS) delete out[f];

  if ("questions" in out && out.questions != null) {
    out.questions = toPlayerQuestions(out.questions);
  }
  if ("videoConfig" in out) out.videoConfig = stripUniqueKey(out.videoConfig);
  if ("articleConfig" in out) {
    out.articleConfig = stripUniqueKey(out.articleConfig);
  }

  return out;
}
