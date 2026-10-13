/**
 * The colour of a task's Instructions block, picked per task by an admin in
 * the task form, right above the instructions editor (owner, 2026-10-13).
 * Stored as Task.instructionsColor (a key below; null = orange).
 *
 * A fixed list rather than a free colour picker: each shade carries white
 * step numbers and reads on both the dark and the light theme, which an
 * arbitrary colour would not.
 */

export const TASK_INSTRUCTIONS_COLORS = [
  { key: "orange", label: "Orange", hex: "#f97316" },
  { key: "blue", label: "Blue", hex: "#0ea5e9" },
  { key: "indigo", label: "Indigo", hex: "#6366f1" },
  { key: "violet", label: "Purple", hex: "#8b5cf6" },
  { key: "pink", label: "Pink", hex: "#ec4899" },
  { key: "red", label: "Red", hex: "#ef4444" },
  { key: "amber", label: "Yellow", hex: "#d97706" },
  { key: "green", label: "Green", hex: "#10b981" },
  { key: "teal", label: "Teal", hex: "#14b8a6" },
  { key: "slate", label: "Grey", hex: "#64748b" },
] as const;

export const DEFAULT_TASK_INSTRUCTIONS_COLOR = "orange";

/** The hex for a stored key; unknown or empty → orange. */
export function taskInstructionsHex(key: unknown): string {
  const hit = TASK_INSTRUCTIONS_COLORS.find((c) => c.key === key);
  return (hit ?? TASK_INSTRUCTIONS_COLORS[0]).hex;
}

/** What to store: a known key, or null for the default (orange) and junk. */
export function normalizeTaskInstructionsColor(v: unknown): string | null {
  return typeof v === "string" && v !== DEFAULT_TASK_INSTRUCTIONS_COLOR && TASK_INSTRUCTIONS_COLORS.some((c) => c.key === v)
    ? v
    : null;
}
