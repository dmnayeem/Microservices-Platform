/**
 * Does a task open again tomorrow, or is it once per member? (owner, 2026-10-15)
 *
 * Task.repeat picks it; null keeps what each type always did: SOCIAL (follow,
 * like, share …) and SURVEY once per member, every other type daily — it opens
 * again at the member's local midnight, `dailyLimit` times a day. One rule for
 * the start route, the lists and the counts, so they cannot disagree.
 * Client-safe.
 */
export type TaskRepeat = "DAILY" | "ONCE";

const ONCE_BY_DEFAULT = new Set(["SOCIAL", "SURVEY"]);

export function defaultRepeat(type: string): TaskRepeat {
  return ONCE_BY_DEFAULT.has(type) ? "ONCE" : "DAILY";
}

export function effectiveRepeat(task: { type: string; repeat?: string | null }): TaskRepeat {
  return task.repeat === "DAILY" || task.repeat === "ONCE" ? task.repeat : defaultRepeat(task.type);
}

/** What to store: a valid choice, or null for "the type's default". */
export function normalizeRepeat(v: unknown): TaskRepeat | null {
  return v === "DAILY" || v === "ONCE" ? v : null;
}
