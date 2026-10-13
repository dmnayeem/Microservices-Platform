/**
 * The colour of the Instructions block on every task page, picked by an admin
 * at /admin/task-categories (owner, 2026-10-13). A fixed list rather than a
 * free colour picker: each shade carries white step numbers and reads on both
 * the dark and the light theme, which an arbitrary colour would not.
 *
 * The (main) layout sets the chosen hex as `--task-ins`; components/user/
 * tasks/task-instructions.tsx paints from it, orange when unset.
 */

export const TASK_INSTRUCTIONS_COLOR_KEY = "tasks.instructions_color";
export const DEFAULT_TASK_INSTRUCTIONS_COLOR = "orange";

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

/** The hex for a stored key; unknown or empty → the default (orange). */
export function taskInstructionsHex(key: unknown): string {
  const hit = TASK_INSTRUCTIONS_COLORS.find((c) => c.key === key);
  return (hit ?? TASK_INSTRUCTIONS_COLORS[0]).hex;
}
