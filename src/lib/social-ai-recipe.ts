import type {
  RecipeStepSpec,
  ResolvedStep,
  SocialAction,
} from "@/lib/social-tasks";

/**
 * Prompt building for social post recipes.
 *
 * Two prompts come out of here and they must never disagree:
 *  - `buildGenerationPrompt` — sent to Gemini by the server, asks for JSON.
 *  - `buildDiyContentPrompt` — handed to the *user* to paste into ChatGPT or
 *    Gemini themselves, asks for a labelled block.
 *
 * Both are derived from the same recipe specs, so adding a field to the taxonomy
 * updates the renderer, the AI call and the DIY prompt at once.
 *
 * Deliberately pure — no Prisma, no fetch, no `process.env` — because the DIY
 * prompt is built in the browser while the generation prompt is built on the
 * server.
 */

export interface RecipeAiContext {
  platformLabel: string;
  actionLabel: string;
  taskTitle: string;
  taskDescription: string;
  /** The admin's extra guidance (`BundleItem.aiPrompt`). */
  extraGuidance: string;
  /** Every step the action can have, filled or not. */
  specs: RecipeStepSpec[];
  /** The admin's values, keyed by field key. */
  fields: Record<string, string>;
}

export function buildRecipeContext(
  def: SocialAction,
  platformLabel: string,
  fields: Record<string, string>,
  task: { title?: string | null; description?: string | null },
  extraGuidance?: string | null
): RecipeAiContext {
  return {
    platformLabel,
    actionLabel: def.label,
    taskTitle: (task.title ?? "").trim(),
    taskDescription: (task.description ?? "").trim(),
    extraGuidance: (extraGuidance ?? "").trim(),
    specs: def.recipe ?? [],
    fields: fields ?? {},
  };
}

/**
 * The field keys the model is allowed to write.
 *
 * Anything the admin already filled that isn't AI-generatable — the destination
 * URL above all — is echoed from their value instead of being asked for. A model
 * that invents a URL produces a post that sends traffic nowhere, and the user
 * only finds out after they've published it.
 *
 * The board name is the one conditional case: echoed when the admin set it,
 * generated when they didn't.
 *
 * Note this reads the specs, not the resolved steps — an AI-generatable field
 * the admin left blank has no step yet, and generating it is the whole point.
 */
export function aiTargetKeys(ctx: RecipeAiContext): string[] {
  const keys = ctx.specs.filter((s) => s.aiGeneratable).map((s) => s.key);
  for (const s of ctx.specs) {
    if (s.role === "board" && !(ctx.fields[s.key] ?? "").trim()) keys.push(s.key);
  }
  return keys;
}

/** Admin-filled steps the AI must leave alone and the user still has to copy. */
function fixedSteps(ctx: RecipeAiContext, keys: string[]): RecipeStepSpec[] {
  return ctx.specs.filter(
    (s) => !keys.includes(s.key) && (ctx.fields[s.key] ?? "").trim()
  );
}

function roleGuidance(role: string, platformLabel: string): string {
  switch (role) {
    case "title":
      return `a short, scroll-stopping ${platformLabel} title (max 100 characters, no quotation marks)`;
    case "body":
      return "the post text — 2 to 4 natural sentences that read like a real person wrote them";
    case "hashtags":
      return "3 to 6 relevant hashtags separated by spaces, each starting with #";
    case "imagePrompt":
      return "a standalone text-to-image prompt describing the picture that should go with this post (subject, style, colours, mood) — no meta-commentary, just the prompt";
    case "board":
      return `a short ${platformLabel} board name (2 to 4 words)`;
    default:
      return "appropriate content for this field";
  }
}

function topicLine(ctx: RecipeAiContext): string {
  const topic = [ctx.taskTitle, ctx.taskDescription].filter(Boolean).join(". ");
  return topic ? `The post is about: ${topic}` : "";
}

function referenceLines(ctx: RecipeAiContext, keys: string[]): string[] {
  return ctx.specs
    .filter((s) => keys.includes(s.key) && (ctx.fields[s.key] ?? "").trim())
    .map(
      (s) =>
        `- ${s.label}: the admin's reference is "${ctx.fields[s.key].trim()}" — keep the same topic and tone but reword it so it is unique.`
    );
}

/**
 * Server-side prompt. Asks for strict JSON keyed by the action's own field keys,
 * so the result drops straight into `resolveRecipe` with no parsing.
 */
export function buildGenerationPrompt(
  ctx: RecipeAiContext,
  keys: string[]
): string {
  const fixed = fixedSteps(ctx, keys);
  const lines: string[] = [
    `You are writing a ${ctx.platformLabel} post for a real person to publish. Task: ${ctx.actionLabel}.`,
  ];

  const topic = topicLine(ctx);
  if (topic) lines.push(topic);
  if (ctx.extraGuidance) lines.push(`Extra guidance: ${ctx.extraGuidance}`);

  if (fixed.length) {
    lines.push(
      "",
      "These values are already decided. Do NOT change them and do NOT include them in your reply, but write everything else so it fits them:"
    );
    for (const s of fixed) lines.push(`- ${s.label}: ${ctx.fields[s.key].trim()}`);
  }

  lines.push("", "Write these fields:");
  for (const key of keys) {
    const spec = ctx.specs.find((s) => s.key === key);
    lines.push(
      `- "${key}" (${spec?.label ?? key}): ${roleGuidance(
        spec?.role ?? "body",
        ctx.platformLabel
      )}`
    );
  }

  const refs = referenceLines(ctx, keys);
  if (refs.length) {
    lines.push("", "Reference material to reword (never copy verbatim):", ...refs);
  }

  lines.push(
    "",
    `Return ONLY a JSON object with exactly these keys: ${keys
      .map((k) => `"${k}"`)
      .join(", ")}.`,
    "Every value must be a non-empty plain string. No markdown, no code fences, no commentary.",
    "Make the writing original and specific — every user must receive a different post."
  );

  return lines.join("\n");
}

/**
 * The prompt the USER copies into ChatGPT or Gemini.
 *
 * This mode costs us nothing and works with no API key at all, so it is also the
 * fallback whenever in-app generation is unavailable. It asks for a labelled
 * block rather than JSON because a person is going to read it.
 */
export function buildDiyContentPrompt(
  ctx: RecipeAiContext,
  keys: string[]
): string {
  const fixed = fixedSteps(ctx, keys);
  const lines: string[] = [
    `Write me a ${ctx.platformLabel} post I can publish today.`,
  ];

  const topic = topicLine(ctx);
  if (topic) lines.push(topic + ".");
  if (ctx.extraGuidance) lines.push(ctx.extraGuidance);

  const refs = ctx.specs.filter(
    (s) => keys.includes(s.key) && (ctx.fields[s.key] ?? "").trim()
  );
  if (refs.length) {
    lines.push("", "Base it on this, but reword it so it is unique:");
    for (const s of refs) lines.push(`- ${s.label}: ${ctx.fields[s.key].trim()}`);
  }

  lines.push("", "Give me, each on its own line:");
  let n = 1;
  for (const key of keys) {
    const spec = ctx.specs.find((s) => s.key === key);
    lines.push(
      `${n++}. ${(spec?.label ?? key).toUpperCase()} — ${roleGuidance(
        spec?.role ?? "body",
        ctx.platformLabel
      )}`
    );
  }
  for (const s of fixed) {
    lines.push(
      `${n++}. ${s.label.toUpperCase()} — repeat this back exactly, do not change it: ${ctx.fields[
        s.key
      ].trim()}`
    );
  }

  lines.push(
    "",
    "Format your answer as a plain labelled list (LABEL: value), one per line, with no extra explanation, so I can copy each line straight into the app."
  );

  return lines.join("\n");
}

/** The note shown next to an image prompt, telling the user what to do with it. */
export function buildImageInstruction(platformLabel: string): string {
  return `Paste this prompt into ChatGPT or Gemini and ask it for the image. Download the image it gives you, then upload that image to ${platformLabel} when you create your post.`;
}

/** Convenience for callers that just want the DIY text from a def + values. */
export function diyPromptFor(
  def: SocialAction,
  platformLabel: string,
  fields: Record<string, string>,
  task: { title?: string | null; description?: string | null },
  extraGuidance?: string | null
): string {
  const ctx = buildRecipeContext(def, platformLabel, fields, task, extraGuidance);
  return buildDiyContentPrompt(ctx, aiTargetKeys(ctx));
}

/** Re-exported so consumers don't need two imports. */
export type { ResolvedStep };
