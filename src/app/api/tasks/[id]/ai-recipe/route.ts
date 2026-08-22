import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { getUserDayContext } from "@/lib/user-day";
import { isGeminiConfigured, generateJson } from "@/lib/gemini";
import { withIdempotency } from "@/lib/idempotency";
import {
  getAction,
  getPlatform,
  normalizeSocialConfig,
  resolveRecipe,
} from "@/lib/social-tasks";
import {
  aiTargetKeys,
  buildDiyContentPrompt,
  buildGenerationPrompt,
  buildRecipeContext,
} from "@/lib/social-ai-recipe";

/**
 * Generate one user's social post content, field by field.
 *
 * Replaces the old flow where the browser assembled a prompt and posted it to
 * `/api/ai/generate`. Three things are better here:
 *  1. The prompt is built server-side from the task's own config, so a user
 *     can't steer our Gemini key with arbitrary text.
 *  2. The reply is structured JSON keyed by the action's fields, so the user
 *     gets a separate copyable title / description / hashtags / image prompt
 *     instead of one undifferentiated blob.
 *  3. The result is cached on the submission, so re-opening the task costs
 *     nothing. Only an explicit Regenerate spends quota again.
 *
 * Every failure path returns the DIY prompt so the user can run it in ChatGPT or
 * Gemini themselves. Nobody is ever left unable to finish the task.
 */

const schema = z.object({
  itemIndex: z.number().int().min(0).max(50),
  regenerate: z.boolean().optional(),
});

interface CachedRecipe {
  fields: Record<string, string>;
  regenCount: number;
  generatedAt: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: taskId } = await params;

  return withIdempotency(request, userId, async () => {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { itemIndex, regenerate } = parsed.data;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        socialConfig: true,
        socialPlatform: true,
      },
    });
    if (!task || task.type !== "SOCIAL") {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const cfg = normalizeSocialConfig(task.socialConfig);
    const item = cfg.items[itemIndex];
    if (!item) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    if (item.aiMode !== "generate" && item.aiMode !== "both") {
      return NextResponse.json(
        { error: "AI generation is not enabled for this action" },
        { status: 400 }
      );
    }

    const platformKey = cfg.platform ?? task.socialPlatform;
    const def = getAction(platformKey, item.action);
    if (!def) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    const platformLabel = getPlatform(platformKey)?.label ?? "social media";

    const ctx = buildRecipeContext(
      def,
      platformLabel,
      item.fields ?? {},
      task,
      item.aiPrompt
    );
    const keys = aiTargetKeys(ctx);
    const diyPrompt = buildDiyContentPrompt(ctx, keys);

    if (keys.length === 0) {
      return NextResponse.json(
        { error: "Nothing to generate for this action", mode: "diy", diyPrompt },
        { status: 400 }
      );
    }

    // The user's own in-progress attempt is where the result lives, so it
    // survives a reload and is visible to the reviewer later.
    const submission = await prisma.taskSubmission.findFirst({
      where: { taskId, userId, status: "PENDING", submittedAt: null },
      select: { id: true, metadata: true },
      orderBy: { createdAt: "desc" },
    });
    if (!submission) {
      return NextResponse.json(
        { error: "Start the task first.", mode: "diy", diyPrompt },
        { status: 400 }
      );
    }

    const prevMeta =
      submission.metadata && typeof submission.metadata === "object"
        ? (submission.metadata as Record<string, unknown>)
        : {};
    const prevRecipes =
      prevMeta.aiRecipes && typeof prevMeta.aiRecipes === "object"
        ? (prevMeta.aiRecipes as Record<string, CachedRecipe>)
        : {};
    const cached = prevRecipes[String(itemIndex)];

    // Already generated and they didn't ask for a new one → free, instant.
    if (cached?.fields && !regenerate) {
      const maxRegen = Number(await getSetting("social.ai_regenerate_limit", 2));
      return NextResponse.json({
        steps: resolveRecipe(def, item, cached.fields),
        cached: true,
        regenLeft: Math.max(0, maxRegen - (cached.regenCount ?? 0)),
        diyPrompt,
      });
    }

    const rawMax = Number(await getSetting("social.ai_regenerate_limit", 2));
    const maxRegen = Number.isFinite(rawMax) && rawMax >= 0 ? rawMax : 2;
    const usedRegen = cached?.regenCount ?? 0;
    if (regenerate && usedRegen >= maxRegen) {
      return NextResponse.json(
        {
          error: `You've used all ${maxRegen} regenerations for this task.`,
          mode: "diy",
          diyPrompt,
          regenLeft: 0,
        },
        { status: 429 }
      );
    }

    if (!isGeminiConfigured()) {
      return NextResponse.json(
        { error: "AI is not configured", mode: "diy", diyPrompt },
        { status: 503 }
      );
    }

    // Per-user daily AI budget, shared with the other AI features.
    // Settings can round-trip as strings, so coerce before comparing.
    const rawLimit = await getSetting<number>("ai.daily_limit_per_user", 50);
    const limit = Number(rawLimit);
    const { dayKey: dateKey } = await getUserDayContext(userId);
    const metered = Number.isFinite(limit) && limit > 0;
    if (metered) {
      const usage = await prisma.aiUsageDaily.findUnique({
        where: { userId_dateKey: { userId, dateKey } },
        select: { count: true },
      });
      if ((usage?.count ?? 0) >= limit) {
        return NextResponse.json(
          {
            error: `Daily AI limit reached (${limit}/day). Use the copy-prompt option instead.`,
            mode: "diy",
            diyPrompt,
          },
          { status: 429 }
        );
      }
    }

    const basePrompt = buildGenerationPrompt(ctx, keys);
    const shape = Object.fromEntries(
      keys.map((k) => [k, z.string().trim().min(1).max(4000)])
    );
    const outSchema = z.object(shape);

    let fields: Record<string, string> | null = null;
    for (let attempt = 0; attempt < 2 && !fields; attempt++) {
      const prompt =
        attempt === 0
          ? basePrompt
          : `${basePrompt}\n\nYour previous reply was invalid. Return ONLY a JSON object with exactly these keys: ${keys
              .map((k) => `"${k}"`)
              .join(", ")} — every value a non-empty string.`;
      const result = await generateJson(prompt);
      if (!result.success || !result.data) continue;
      const check = outSchema.safeParse(result.data);
      if (check.success) fields = check.data as Record<string, string>;
    }

    if (!fields) {
      return NextResponse.json(
        {
          error: "AI couldn't produce usable content. Try the copy-prompt option.",
          mode: "diy",
          diyPrompt,
        },
        { status: 502 }
      );
    }

    // Bill only after a usable result — a failed call shouldn't cost the user
    // their daily allowance.
    if (metered) {
      await prisma.aiUsageDaily.upsert({
        where: { userId_dateKey: { userId, dateKey } },
        create: { userId, dateKey, count: 1 },
        update: { count: { increment: 1 } },
      });
    }

    const regenCount = regenerate ? usedRegen + 1 : usedRegen;
    // `aiRecipes` is a SIBLING of `metadata.items`, never inside it: the 700ms
    // progress autosave replaces `items` wholesale, so anything stored in there
    // would be wiped on the user's next keystroke.
    await prisma.taskSubmission.update({
      where: { id: submission.id },
      data: {
        metadata: JSON.parse(
          JSON.stringify({
            ...prevMeta,
            aiRecipes: {
              ...prevRecipes,
              [String(itemIndex)]: {
                fields,
                regenCount,
                generatedAt: Date.now(),
              },
            },
          })
        ),
      },
    });

    return NextResponse.json({
      steps: resolveRecipe(def, item, fields),
      cached: false,
      regenLeft: Math.max(0, maxRegen - regenCount),
      diyPrompt,
    });
  });
}
