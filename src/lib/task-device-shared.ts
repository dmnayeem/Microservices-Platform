/**
 * Client-safe constants for the per-task device requirements. The rule itself
 * is server-side: src/lib/task-device-gate.ts.
 */

/** Sent on a task start from the installed app (providers/balance-sync.tsx). */
export const APP_HEADER = "x-rt-app";
/** `code` of the 403 a task start returns when a requirement isn't met. */
export const TASK_REQUIREMENTS_CODE = "TASK_REQUIREMENTS";
/** Window event that opens the "do this first" popup; detail = { needs }. */
export const TASK_REQUIREMENTS_EVENT = "rt:task-requirements";

export type TaskNeed = "app" | "push";
