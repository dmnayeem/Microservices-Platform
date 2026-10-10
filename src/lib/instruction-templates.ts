/**
 * Instruction templates: reusable task-instruction text the admin picks in the
 * task form, then edits. The task keeps its own copy — nothing links a task
 * back to the template after insertion.
 *
 * Client-safe: no server imports. The API routes, the /admin/tasks/templates
 * page and the TaskForm picker all share these definitions.
 */
import { sanitizeRichHtml, htmlToText } from "@/lib/rich-html";
import { isEmptyInstructionsHtml } from "@/lib/task-instructions";

export const TEMPLATE_NAME_MAX = 120;
export const TEMPLATE_CATEGORY_MAX = 60;
export const TEMPLATE_HTML_MAX = 100_000;
export const TEMPLATE_PAGE_SIZE = 30;

/** Task types a template can be tagged with (null = any type). */
export const TEMPLATE_TASK_TYPES = [
  "VIDEO",
  "ARTICLE",
  "QUIZ",
  "SURVEY",
  "SOCIAL",
  "PROXY",
  "OFFERWALL",
  "APPINSTALL",
  "VISIT",
  "CUSTOM",
] as const;

export const TEMPLATE_TASK_TYPE_LABEL: Record<string, string> = {
  VIDEO: "Video",
  ARTICLE: "Article",
  QUIZ: "Quiz",
  SURVEY: "Survey",
  SOCIAL: "Social",
  PROXY: "Proxy",
  OFFERWALL: "Offerwall",
  APPINSTALL: "App install",
  VISIT: "Visit link",
  CUSTOM: "Custom",
};

export interface InstructionTemplateRow {
  id: string;
  name: string;
  category: string;
  taskType: string | null;
  contentHtml: string;
  usageCount: number;
  updatedAt: string;
}

export interface TemplateCategoryCount {
  category: string;
  count: number;
}

export interface TemplateListResponse {
  /** false when the table does not exist yet (migration not applied). */
  ready: boolean;
  templates: InstructionTemplateRow[];
  categories: TemplateCategoryCount[];
  hasMore: boolean;
  page: number;
}

export interface TemplateInput {
  name: string;
  category: string;
  taskType: string | null;
  contentHtml: string;
}

function clean(s: unknown, max: number): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * Validate + normalise a create/update body. The HTML is sanitised HERE, on
 * every write — a template is pasted into tasks every user reads, so it is
 * held to the same rule as task instructions themselves.
 *
 * `partial` (PATCH): missing fields are left out of the result.
 */
export function parseTemplateInput(
  body: unknown,
  partial = false
): { ok: true; data: Partial<TemplateInput> } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Partial<TemplateInput> = {};

  if (!partial || b.name !== undefined) {
    const name = clean(b.name, TEMPLATE_NAME_MAX);
    if (!name) return { ok: false, error: "Give the template a name" };
    out.name = name;
  }
  if (!partial || b.category !== undefined) {
    const category = clean(b.category, TEMPLATE_CATEGORY_MAX);
    if (!category) return { ok: false, error: "Pick or type a category" };
    out.category = category;
  }
  if (!partial || b.taskType !== undefined) {
    const t = typeof b.taskType === "string" ? b.taskType.trim().toUpperCase() : "";
    if (t && !(TEMPLATE_TASK_TYPES as readonly string[]).includes(t)) {
      return { ok: false, error: "Unknown task type" };
    }
    out.taskType = t || null;
  }
  if (!partial || b.contentHtml !== undefined) {
    const raw = typeof b.contentHtml === "string" ? b.contentHtml : "";
    if (raw.length > TEMPLATE_HTML_MAX) {
      return { ok: false, error: "That template is too long" };
    }
    const html = sanitizeRichHtml(raw);
    if (isEmptyInstructionsHtml(html)) {
      return { ok: false, error: "The template has no content" };
    }
    out.contentHtml = html;
  }
  return { ok: true, data: out };
}

/** Short plain-text excerpt for list rows and the picker. */
export function templateSnippet(html: string, max = 140): string {
  const t = htmlToText(html);
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * The table not existing yet (migration not applied). Prisma reports it as
 * P2021; the raw driver message is the fallback. Callers turn this into
 * "Templates aren't set up yet" instead of an error, so the task form never
 * breaks because of this feature.
 */
export function isMissingTableError(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  if (err?.code === "P2021") return true;
  const msg = typeof err?.message === "string" ? err.message : "";
  return /InstructionTemplate/.test(msg) && /does not exist/i.test(msg);
}

export const TEMPLATES_NOT_READY =
  "Templates aren't set up yet — the database migration hasn't been applied.";

/**
 * Starter set. Inserted only when an admin clicks "Add starter templates" on
 * the empty state — never seeded.
 */
export const STARTER_TEMPLATES: TemplateInput[] = [
  {
    name: "Watch a video to the end",
    category: "Video",
    taskType: "VIDEO",
    contentHtml:
      "<ol><li><p>Press <strong>Play</strong> and keep this page open.</p></li><li><p>Watch until the timer reaches the required time — do not skip ahead or switch tabs.</p></li><li><p>When the progress bar is full, tap <strong>Submit</strong>.</p></li></ol><p><em>Tip: closing the page pauses your progress.</em></p>",
  },
  {
    name: "Read the article and answer",
    category: "Article",
    taskType: "ARTICLE",
    contentHtml:
      "<ol><li><p>Open the article and read it from top to bottom.</p></li><li><p>Stay on the page for the required reading time.</p></li><li><p>Answer the question at the end using what you read.</p></li><li><p>Tap <strong>Submit</strong>.</p></li></ol>",
  },
  {
    name: "Follow and send a screenshot",
    category: "Social",
    taskType: "SOCIAL",
    contentHtml:
      "<ol><li><p>Tap the link to open the page.</p></li><li><p>Follow / like / subscribe as the task asks, using your own account.</p></li><li><p>Take a screenshot that clearly shows your username and the followed state.</p></li><li><p>Paste your profile link and upload the screenshot, then tap <strong>Submit</strong>.</p></li></ol><p><strong>Do not</strong> unfollow afterwards — rewards can be taken back.</p>",
  },
  {
    name: "Install the app and open it",
    category: "App install",
    taskType: "APPINSTALL",
    contentHtml:
      "<ol><li><p>Tap the store link and install the app.</p></li><li><p>Open the app and finish the first screen (sign up if asked).</p></li><li><p>Keep it installed for at least 3 days.</p></li><li><p>Upload a screenshot of the app open on your phone, then tap <strong>Submit</strong>.</p></li></ol>",
  },
  {
    name: "Complete the survey honestly",
    category: "Survey",
    taskType: "SURVEY",
    contentHtml:
      "<ol><li><p>Answer every question — there are no right or wrong answers.</p></li><li><p>Read each question fully; random or rushed answers are rejected.</p></li><li><p>Tap <strong>Submit</strong> on the last page.</p></li></ol><p><em>You can take each survey once.</em></p>",
  },
  {
    name: "Custom task — do it and prove it",
    category: "Custom",
    taskType: "CUSTOM",
    contentHtml:
      "<ol><li><p>Read what the task asks for below.</p></li><li><p>Do it exactly as described.</p></li><li><p>Fill in every proof field (text, link or screenshot).</p></li><li><p>Tap <strong>Submit</strong> — an admin reviews it.</p></li></ol>",
  },
];
