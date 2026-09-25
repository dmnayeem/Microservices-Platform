/**
 * QUIZ, ARTICLE and APPINSTALL, as a buyer posts them.
 *
 * Built to the SURVEY precedent (`survey-buyer.ts`): one zod schema per type,
 * imported by BOTH /api/tasks/create and /api/tasks/mine/[id], plus one builder
 * that turns the parsed body into the exact config column the existing worker
 * runner already reads. No new money path — completions are charged through
 * `chargeTaskCompletion` like every other type.
 *
 * Two copies of a schema is how an edit ends up accepting something a create
 * refuses, which is why there is one of each and it lives here.
 *
 * Each of these three carries a hazard the other buyer types do not. They are
 * named at the schema that answers them, not in a design doc:
 *
 *  QUIZ       — the answer key must never reach the worker's browser.
 *  ARTICLE    — the buyer is paying for words, and words get pasted.
 *  APPINSTALL — the most fraud-prone type on the platform.
 */

import { z } from "zod";
import type { ArticleConfig } from "@/lib/article-tasks";
import {
  normalizeAppInstallConfig,
  proofItemPreset,
  type AppInstallConfig,
  type AppInstallProofItem,
} from "@/lib/app-install-tasks";
import type { QuizQuestionShape } from "@/lib/quiz-shape";
import type { CustomConfig, CustomField } from "@/lib/custom-tasks";

/* ────────────────────────────── QUIZ ──────────────────────────────────────
 *
 * HAZARD: the answer key.
 *
 * This platform has already shipped a quiz that sent `correctAnswer` down with
 * every question, so the key sat in the network tab of anyone who pressed F12.
 * It was fixed in `/api/tasks/quiz` — `toPlayerQuestions()` builds a stripped
 * `{id, question, options}` and grading reads the key from the TASK ROW, never
 * from the request body. Opening QUIZ to buyers must not walk that back.
 *
 * So this module writes into exactly the same column (`Task.questions`) in
 * exactly the same shape a buyer-authored quiz and an admin-authored quiz are
 * indistinguishable to the runner — which is the point. There is no
 * buyer-specific quiz endpoint, no buyer-specific player, and therefore no
 * second place for the key to leak from. A verification check asserts the
 * player payload still has no `correctAnswer` in it.
 *
 * The second, quieter hazard is AI spend: `/api/tasks/quiz` falls back to
 * Gemini generation for a QUIZ task with no usable questions, and persists the
 * result to the task row. A buyer must therefore never be able to create a quiz
 * task with an empty question set — `min(1)` below, enforced server-side on
 * create AND on edit, is what keeps a buyer from commissioning unmetered AI.
 */

export const buyerQuizQuestionSchema = z
  .object({
    question: z.string().min(3).max(500),
    options: z.array(z.string().min(1).max(200)).min(2).max(6),
    /** Index into `options`. Range-checked against the actual array below. */
    correctIndex: z.number().int().min(0).max(5),
    explanation: z.string().max(500).optional(),
  })
  .refine((q) => q.correctIndex < q.options.length, {
    message: "The correct answer must be one of the options you wrote.",
  })
  .refine(
    (q) =>
      new Set(q.options.map((o) => o.trim().toLowerCase())).size ===
      q.options.length,
    { message: "A question can't have the same option twice." }
  );

export const buyerQuizSchema = z.object({
  questions: z.array(buyerQuizQuestionSchema).min(1).max(25),
});

export type BuyerQuizInput = z.infer<typeof buyerQuizSchema>;

/**
 * Build the `Task.questions` value.
 *
 * `correctAnswer` is the name `coerceQuizQuestions` prefers; writing that one
 * rather than `correctIndex` keeps buyer quizzes off the legacy-alias path in
 * quiz-shape.ts. Options are trimmed here so the stored key index and the
 * displayed option can never drift apart by a space.
 */
export function buildBuyerQuizQuestions(
  input: BuyerQuizInput
): QuizQuestionShape[] {
  return input.questions.map((q) => ({
    question: q.question.trim(),
    options: q.options.map((o) => o.trim()),
    correctAnswer: q.correctIndex,
    ...(q.explanation?.trim() ? { explanation: q.explanation.trim() } : {}),
  }));
}

/** Shown to the buyer, above the question builder. */
export const BUYER_QUIZ_NOTICE =
  "Workers never receive the correct answers — the browser only gets the questions and the options, and scoring happens on our server. You'll see each worker's score, not a way to leak the key.";

/* ───────────────────────────── ARTICLE ────────────────────────────────────
 *
 * HAZARD: you are paying for writing, and writing gets pasted.
 *
 * What is actually built, and what is NOT, stated here so nobody has to infer
 * it from the code:
 *
 *   BUILT   a minimum word count, enforced on submit, refusing short work
 *           outright because the buyer stated the number up front;
 *   BUILT   exact-duplicate detection against the other submissions on THIS
 *           task, after normalising case, spacing and punctuation;
 *   BUILT   near-duplicate detection on the same set (word-trigram containment)
 *           and a self-repetition score that catches one paragraph pasted four
 *           times to hit the count;
 *   BUILT   an originality NOTE on every submission, visible to whoever
 *           reviews it.
 *
 *   NOT     plagiarism detection. Nothing here searches the web, and nothing
 *           here can tell a buyer whether an article was lifted from a blog,
 *           translated, spun, or generated. Do not describe it as if it could.
 *   NOT     cross-task duplicate detection. The comparison set is one task.
 *   NOT     an auto-reject on similarity. Only the word count refuses; a
 *           similarity score is evidence for a human, because two people
 *           writing about the same product will legitimately collide.
 *
 * The implementation is `src/lib/article-originality.ts`; the enforcement is in
 * /api/tasks/[id]/submit. `autoApprove` is forced OFF for a buyer writing task
 * — the whole point is that somebody reads it.
 */

export const buyerArticleSchema = z.object({
  /** What the buyer wants written. Shown to the worker before they start. */
  brief: z.string().min(20).max(4000),
  /** Refused below this. The buyer picks it; the server enforces it. */
  minWords: z.number().int().min(50).max(5000),
  /** Also require a link to where the worker published it. */
  requireUrl: z.boolean(),
  /** Also require a screenshot (useful when the destination needs a login). */
  requireScreenshot: z.boolean(),
});

export type BuyerArticleInput = z.infer<typeof buyerArticleSchema>;

/**
 * Build the `Task.articleConfig` value for a buyer WRITING task.
 *
 * `useKeyPool` is false and `pages` is empty on purpose: the key-pool flow is
 * the admin's read-through-my-pages product, a completely different task that
 * happens to share the column. `writing` being present is what tells the submit
 * route and the reviewer panel that this is the writing variant.
 */
export function buildBuyerArticleConfig(
  input: BuyerArticleInput
): ArticleConfig {
  return {
    links: [],
    keywords: [],
    proofRequirements: {
      url: input.requireUrl,
      screenshot: input.requireScreenshot,
      // Never: the unique key belongs to the key-pool flow, and a writing task
      // has no pages to generate one on.
      uniqueKey: false,
    },
    useKeyPool: false,
    pages: [],
    writing: {
      brief: input.brief.trim(),
      minWords: input.minWords,
      requireUrl: input.requireUrl,
      requireScreenshot: input.requireScreenshot,
    },
  };
}

/** Shown to the buyer, above the article form. Deliberately unflattering. */
export const BUYER_ARTICLE_NOTICE =
  "We check every submission against the other submissions on this task — identical text, heavy overlap and padding are flagged for you, and anything under your word count is refused outright. We do NOT check the web: this is not plagiarism detection, and it cannot tell you whether an article was copied from somewhere else or written by AI. Read the work before you approve it.";

/* ──────────────────────────── APPINSTALL ──────────────────────────────────
 *
 * HAZARD: this is the most defrauded type there is. An "install" is a
 * screenshot, a screenshot is a file, and files are shared.
 *
 * The platform already has the answer: per-task structured proof requirements
 * (`AppInstallConfig.proofItems`), where each item can demand a screenshot
 * and/or a typed value, and kinds like LEVEL / DAYS / PLAYTIME ask for things
 * that take real time in the app rather than one tap. The admin builder has had
 * this since the app-install proof work.
 *
 * The buyer therefore does not get the weak default. `defaultProofItems()` is a
 * single "screenshot of the app open" — fine as a back-compat fallback for old
 * admin rows, useless as a fraud defence — so `proofItems` is REQUIRED here,
 * `min(1)`, and the form makes the buyer pick. A buyer who wants only an
 * install screenshot can still choose exactly that, but they will have chosen
 * it.
 *
 * `autoApprove` is not in the schema at all. A buyer cannot auto-approve their
 * own app-install task, because auto-approving the most fraud-prone type is the
 * single change that would make every other defence here pointless.
 */

export const buyerProofItemSchema = z
  .object({
    kind: z.enum(["INSTALL", "LEVEL", "DAYS", "PLAYTIME", "CUSTOM"]),
    /** Blank means "use the preset wording for this kind". */
    label: z.string().max(200).optional(),
    /** Level / days / minutes, per kind. */
    target: z.number().int().min(1).max(10_000).optional(),
    screenshot: z.boolean(),
    valueLabel: z.string().max(80).optional(),
  })
  .refine(
    (p) =>
      (p.kind !== "LEVEL" && p.kind !== "DAYS" && p.kind !== "PLAYTIME") ||
      typeof p.target === "number",
    { message: "Level, days and playtime requirements need a number." }
  )
  .refine((p) => p.kind !== "CUSTOM" || !!p.label?.trim(), {
    message: "A custom requirement needs to say what the worker must show.",
  })
  .refine((p) => p.screenshot || !!p.valueLabel?.trim(), {
    message:
      "Every requirement must ask for a screenshot or a typed value — otherwise there is nothing to check.",
  });

export const buyerAppInstallSchema = z
  .object({
    appName: z.string().min(2).max(120),
    appKind: z.enum(["app", "game"]),
    description: z.string().max(1000).optional(),
    playStoreUrl: z.string().url().max(500).optional(),
    appStoreUrl: z.string().url().max(500).optional(),
    steps: z.array(z.string().min(1).max(300)).max(12).optional(),
    /** REQUIRED — see the hazard note above. No weak default for buyers. */
    proofItems: z.array(buyerProofItemSchema).min(1).max(8),
  })
  .refine((c) => !!c.playStoreUrl || !!c.appStoreUrl, {
    message: "Add a Google Play or App Store link.",
  })
  .refine(
    (c) =>
      !c.playStoreUrl ||
      /play\.google\.com\/store\/apps\/details/i.test(c.playStoreUrl),
    { message: "That doesn't look like a Google Play app link." }
  )
  .refine(
    (c) => !c.appStoreUrl || /apps\.apple\.com|itunes\.apple\.com/i.test(c.appStoreUrl),
    { message: "That doesn't look like an App Store link." }
  );

export type BuyerAppInstallInput = z.infer<typeof buyerAppInstallSchema>;

/**
 * Build the `Task.appInstallConfig` value.
 *
 * Ids are generated from the array position rather than accepted from the body:
 * a buyer who sent three items all claiming `id: "pi_1"` would otherwise
 * collapse three requirements into one at proof time. Same reasoning as the
 * survey builder re-deriving `order`.
 */
export function buildBuyerAppInstallConfig(
  input: BuyerAppInstallInput
): AppInstallConfig {
  const proofItems: AppInstallProofItem[] = input.proofItems.map((p, i) => {
    const preset = proofItemPreset(p.kind, p.target);
    return {
      id: `pi_${i + 1}`,
      kind: p.kind,
      label: p.label?.trim() || preset.label,
      ...(typeof p.target === "number" ? { target: p.target } : {}),
      screenshot: p.screenshot,
      ...(p.valueLabel?.trim()
        ? { valueLabel: p.valueLabel.trim() }
        : preset.valueLabel
          ? { valueLabel: preset.valueLabel }
          : {}),
    };
  });

  return normalizeAppInstallConfig({
    appName: input.appName.trim(),
    appKind: input.appKind,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.playStoreUrl ? { playStoreUrl: input.playStoreUrl } : {}),
    ...(input.appStoreUrl ? { appStoreUrl: input.appStoreUrl } : {}),
    ...(input.steps?.length
      ? { steps: input.steps.map((s) => s.trim()).filter(Boolean) }
      : {}),
    proofItems,
    // Never true for a buyer. See the hazard note.
    autoApprove: false,
  });
}

/** Shown to the buyer, above the app-install form. */
export const BUYER_APPINSTALL_NOTICE =
  "Install tasks attract the most fraud on the platform. Ask for more than one screenshot: a level reached, days opened or minutes played all take real time in the app and are far harder to fake or share. Every submission comes to you for review — install tasks are never auto-approved.";

/* ───────────────────────────── CUSTOM ─────────────────────────────────────
 *
 * HAZARD: a funded task that collects nothing.
 *
 * A buyer CUSTOM task used to store only free-text `instructions` and no
 * `customConfig` at all. The submit route reads that as "no fields configured"
 * and treats the task as a plain mark-done completion — so a buyer who funded
 * "five Gmail accounts, $1 each" paid five workers who pressed a button and
 * received nothing. The money moved correctly and the deliverable never
 * existed.
 *
 * So the fields are the point of this schema, and `min(1)` is what stops the
 * silent version coming back. The worker runner already renders whatever is in
 * `customConfig` and the reviewer panel already shows the answers; a buyer
 * custom task is therefore indistinguishable from an admin one downstream,
 * which is the same rule the other three types follow.
 *
 * The quieter hazard is upload cost. Every IMAGE/IMAGES/FILE/VIDEO field is
 * storage a buyer commissions but the platform pays for, so the per-file and
 * per-field ceilings below are tighter than the admin builder's.
 */

/** A buyer may ask for at most this many things in one task. */
const BUYER_CUSTOM_MAX_FIELDS = 12;
/** Tighter than the admin ceiling: the platform stores what the buyer asks for. */
const BUYER_CUSTOM_MAX_FILE_MB = 10;

export const buyerCustomFieldSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum([
    "TEXT",
    "TEXTAREA",
    "LINK",
    "EMAIL",
    "PHONE",
    "NUMBER",
    "IMAGE",
    "IMAGES",
    "FILE",
    "VIDEO",
    "SELECT",
    "CHECKBOX_GROUP",
  ]),
  label: z.string().min(1).max(160),
  hint: z.string().max(300).optional().nullable(),
  required: z.boolean().optional(),
  maxLength: z.number().int().min(1).max(10_000).optional().nullable(),
  accept: z.string().max(200).optional().nullable(),
  maxSizeMb: z.number().int().min(1).max(BUYER_CUSTOM_MAX_FILE_MB).optional().nullable(),
  maxImages: z.number().int().min(1).max(10).optional().nullable(),
  options: z.array(z.string().min(1).max(120)).max(20).optional(),
  min: z.number().optional().nullable(),
  max: z.number().optional().nullable(),
});

export const buyerCustomSchema = z.object({
  // At least one. A task that asks for nothing pays for nothing.
  fields: z.array(buyerCustomFieldSchema).min(1).max(BUYER_CUSTOM_MAX_FIELDS),
  introMessage: z.string().max(2000).optional().nullable(),
  thankYouMessage: z.string().max(1000).optional().nullable(),
});

export type BuyerCustomInput = z.infer<typeof buyerCustomSchema>;

/**
 * Turn the buyer's field list into the exact `customConfig` column the existing
 * worker runner and reviewer already read.
 */
export function buildBuyerCustomConfig(input: BuyerCustomInput): CustomConfig {
  const fields: CustomField[] = input.fields.map((f, i) => ({
    id: f.id,
    order: i,
    type: f.type as CustomField["type"],
    label: f.label.trim(),
    required: f.required !== false,
    ...(f.hint?.trim() ? { hint: f.hint.trim() } : {}),
    ...(f.maxLength ? { maxLength: f.maxLength } : {}),
    ...(f.accept?.trim() ? { accept: f.accept.trim() } : {}),
    ...(f.maxSizeMb
      ? { maxSizeMb: Math.min(f.maxSizeMb, BUYER_CUSTOM_MAX_FILE_MB) }
      : {}),
    ...(f.maxImages ? { maxImages: f.maxImages } : {}),
    // A choice field with no choices renders as an empty dropdown nobody can
    // answer, which fails the task rather than the form.
    ...(f.options?.length
      ? { options: f.options.map((o) => o.trim()).filter(Boolean) }
      : {}),
    ...(f.min != null ? { min: f.min } : {}),
    ...(f.max != null ? { max: f.max } : {}),
  }));

  return {
    fields,
    introMessage: input.introMessage?.trim() || "",
    thankYouMessage: input.thankYouMessage?.trim() || "",
    // Never true for a buyer: the whole point of a custom task is that the
    // buyer looks at what came back before it is paid for.
    autoApprove: false,
  };
}

/** Shown to the buyer, above the custom form builder. */
export const BUYER_CUSTOM_NOTICE =
  "Add a field for every single thing you need back. A custom task with no fields pays the worker for pressing a button and hands you nothing — so if you want five email accounts, ask for the address and the password as separate fields, and set how many completions to fund below.";
