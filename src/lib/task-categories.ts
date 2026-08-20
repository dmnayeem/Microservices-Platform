/**
 * Task-category keys + labels shown on the /tasks category grid, and toggled
 * on/off by the admin (SystemSetting `tasks.category_visibility`). Single source
 * of truth for both the user grid (tasks-hub-view) and the admin toggle form.
 * Client-safe (no imports). Order = display order on /tasks.
 */
export interface TaskCategoryMeta {
  key: string;
  label: string;
}

export const TASK_CATEGORY_META: TaskCategoryMeta[] = [
  { key: "article", label: "Article" },
  { key: "video", label: "Video" },
  { key: "social-posts", label: "Social Posts" },
  { key: "social", label: "Social Tasks" },
  { key: "appinstall", label: "App Install" },
  { key: "custom", label: "Custom" },
  { key: "survey", label: "Survey" },
  { key: "quiz", label: "Quiz" },
  { key: "proxy", label: "Proxy" },
  { key: "board", label: "Board Tasks" },
  { key: "quizzes", label: "Quiz Games" },
  { key: "offerwalls", label: "Offerwalls" },
];

/** A category is shown unless the admin explicitly set it to `false`. */
export function isCategoryVisible(
  visibility: Record<string, boolean> | null | undefined,
  key: string
): boolean {
  return visibility?.[key] !== false;
}
