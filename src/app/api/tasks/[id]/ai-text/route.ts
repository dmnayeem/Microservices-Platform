import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { getUserDayContext } from "@/lib/user-day";
import { isGeminiConfigured } from "@/lib/gemini";
import { withIdempotency } from "@/lib/idempotency";
import { getAction, getPlatform, normalizeSocialConfig } from "@/lib/social-tasks";
import { parseContentRules } from "@/lib/link-verify";
import { userHashtag } from "@/lib/social-caption";
import { effectiveSteps, stepType, type VideoConfig } from "@/lib/video-tasks";
import { copyKindFor, generateCopyText, type CopyKind } from "@/lib/ai-copy-text";

/**
 * POST /api/tasks/:id/ai-text — one fresh caption / comment / reply / review /
 * question / answer for ONE text box on a task page (lib/ai-copy-text).
 *
 *   { source: "social", index: <action #>, field: "caption" | <recipe field key> }
 *   { source: "video",  index: <step #>,   field: "commentTemplate" }
 *
 * Built from the admin's topic + summary for that action (falling back to the
 * task title / description), keeping the admin's links and hashtags.
 *
 * ONE per box per member, for good (owner, 2026-10-13): the text is saved on
 * the member's attempt and found again through ANY of their attempts at this
 * task, so a cleared browser, a new phone or a fresh attempt shows the same
 * text and never generates a second. It is checked against what every other
 * member got for the same box, so no two members post the same words. Needs
 * the member's own started attempt and one unit of the daily AI budget.
 *
 * GET returns every text this member already has for this task.
 */

interface SavedText {
  text: string;
  n?: number;
  at: number;
}

/** Every saved box text of this member for this task, oldest attempt first. */
async function savedTexts(taskId: string, userId: string): Promise<Record<string, string>> {
  const subs = await prisma.taskSubmission.findMany({
    where: { taskId, userId },
    select: { metadata: true },
    orderBy: { createdAt: "asc" },
  });
  const out: Record<string, string> = {};
  for (const s of subs) {
    const m = s.metadata && typeof s.metadata === "object" ? (s.metadata as Record<string, unknown>) : null;
    const texts = m?.aiTexts && typeof m.aiTexts === "object" ? (m.aiTexts as Record<string, SavedText>) : null;
    if (!texts) continue;
    for (const [k, v] of Object.entries(texts)) if (typeof v?.text === "string" && !out[k]) out[k] = v.text;
  }
  return out;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: taskId } = await params;
  return NextResponse.json({ texts: await savedTexts(taskId, session.user.id) });
}

const schema = z.object({
  source: z.enum(["social", "video"]),
  index: z.number().int().min(0).max(50),
  field: z.string().min(1).max(60),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { id: taskId } = await params;

  return withIdempotency(request, userId, async () => {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    const { source, index, field } = parsed.data;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, description: true, type: true, socialConfig: true, socialPlatform: true, videoConfig: true },
    });
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    // What to write, and from what.
    let kind: CopyKind;
    let platformLabel = "social media";
    let topic = "";
    let summary = "";
    let reference: string | null = null;
    let hashtags: string | null = null;
    const requiredWords: string[] = [];
    const requiredHashtags: string[] = [];

    if (source === "social") {
      if (task.type !== "SOCIAL") return NextResponse.json({ error: "Task not found" }, { status: 404 });
      const cfg = normalizeSocialConfig(task.socialConfig);
      const item = cfg.items[index];
      const platformKey = cfg.platform ?? task.socialPlatform;
      const def = item ? getAction(platformKey, item.action) : null;
      if (!item || !def) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
      platformLabel = getPlatform(platformKey)?.label ?? platformLabel;
      if (field === "caption") {
        if (!item.caption) return NextResponse.json({ error: "No caption on this action" }, { status: 400 });
        reference = item.caption;
        hashtags = item.captionHashtags ?? null;
        kind = "caption";
        if (item.captionUserTag) {
          const me = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
          const tag = userHashtag(me?.username);
          if (tag) requiredHashtags.push(`#${tag}`);
        }
      } else {
        // Only a text box the action really shows the member.
        const spec = def.recipe?.find((s) => s.key === field && s.kind === "text");
        if (!spec) return NextResponse.json({ error: "This box can't be generated" }, { status: 400 });
        reference = item.fields?.[field] ?? null;
        kind = copyKindFor(field, item.action);
      }
      topic = item.aiTopic ?? "";
      summary = item.aiSummary ?? "";
      // The task's own auto-verify rules: generated text must still pass them.
      if (item.verify === "CONTENT") {
        for (const c of parseContentRules(item.contentRules).criteria) {
          if (c.kind === "text" && c.value.trim()) requiredWords.push(c.value.trim());
          if (c.kind === "hashtag" && c.value.trim()) requiredHashtags.push(c.value.trim());
        }
      }
    } else {
      if (task.type !== "VIDEO" || field !== "commentTemplate") {
        return NextResponse.json({ error: "This box can't be generated" }, { status: 400 });
      }
      const cfg = (task.videoConfig ?? null) as VideoConfig | null;
      const step = effectiveSteps(cfg)[index];
      if (!step || stepType(step) !== "comment") {
        return NextResponse.json({ error: "Unknown step" }, { status: 400 });
      }
      reference = step.commentTemplate ?? null;
      kind = "comment";
      platformLabel = cfg?.provider === "YOUTUBE" ? "YouTube" : "a video";
      topic = cfg?.aiTopic ?? "";
      summary = cfg?.aiSummary ?? "";
    }
    topic = topic.trim() || (task.title ?? "").trim();
    summary = summary.trim() || (task.description ?? "").trim();

    const submission = await prisma.taskSubmission.findFirst({
      where: { taskId, userId, status: "PENDING", submittedAt: null },
      select: { id: true, metadata: true },
      orderBy: { createdAt: "desc" },
    });
    if (!submission) return NextResponse.json({ error: "Start the task first." }, { status: 400 });

    const prevMeta =
      submission.metadata && typeof submission.metadata === "object"
        ? (submission.metadata as Record<string, unknown>)
        : {};
    const prevTexts =
      prevMeta.aiTexts && typeof prevMeta.aiTexts === "object" ? (prevMeta.aiTexts as Record<string, SavedText>) : {};
    const key = `${source}:${index}:${field}`;
    // Already made — on this attempt or an earlier one: hand the same text
    // back (and keep it on this attempt too). Never a second generation.
    const existing = prevTexts[key]?.text ?? (await savedTexts(taskId, userId))[key];
    if (existing) {
      if (!prevTexts[key]) {
        await prisma.taskSubmission.update({
          where: { id: submission.id },
          data: {
            metadata: JSON.parse(
              JSON.stringify({ ...prevMeta, aiTexts: { ...prevTexts, [key]: { text: existing, at: Date.now() } } })
            ),
          },
        });
      }
      return NextResponse.json({ text: existing, saved: true, left: 0 });
    }

    if (!(await isGeminiConfigured())) {
      return NextResponse.json({ error: "AI writing isn't available right now." }, { status: 503 });
    }
    // The shared per-member daily AI budget (same as the other AI features).
    const limit = Number(await getSetting<number>("ai.daily_limit_per_user", 50));
    const { dayKey: dateKey } = await getUserDayContext(userId);
    const metered = Number.isFinite(limit) && limit > 0;
    if (metered) {
      const usage = await prisma.aiUsageDaily.findUnique({
        where: { userId_dateKey: { userId, dateKey } },
        select: { count: true },
      });
      if ((usage?.count ?? 0) >= limit) {
        return NextResponse.json({ error: `Daily AI limit reached (${limit}/day).` }, { status: 429 });
      }
    }

    // What everyone else got for this same box — the new text must differ.
    const otherRows = await prisma.$queryRaw<{ t: string | null }[]>`
      SELECT metadata->'aiTexts'->${key}->>'text' AS t
      FROM "TaskSubmission"
      WHERE "taskId" = ${taskId} AND "userId" <> ${userId} AND metadata->'aiTexts'->${key} IS NOT NULL
      ORDER BY "createdAt" DESC
      LIMIT 2000`;
    const others = otherRows.map((o) => o.t ?? "").filter(Boolean);

    const out = await generateCopyText({
      kind,
      platformLabel,
      topic,
      summary,
      reference,
      hashtags,
      requiredWords,
      requiredHashtags,
      others,
    });
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 502 });

    if (metered) {
      await prisma.aiUsageDaily.upsert({
        where: { userId_dateKey: { userId, dateKey } },
        create: { userId, dateKey, count: 1 },
        update: { count: { increment: 1 } },
      });
    }
    // A sibling of `metadata.items` (which the progress autosave replaces
    // wholesale) — the same reason ai-recipe keeps `aiRecipes` there.
    await prisma.taskSubmission.update({
      where: { id: submission.id },
      data: {
        metadata: JSON.parse(
          JSON.stringify({ ...prevMeta, aiTexts: { ...prevTexts, [key]: { text: out.text, at: Date.now() } } })
        ),
      },
    });

    return NextResponse.json({ text: out.text, saved: true, left: 0 });
  });
}
