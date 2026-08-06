import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  type ArticleConfig,
  validateArticleConfig,
} from "@/lib/article-tasks";
import { z } from "zod";

const HEX_COLOR = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color (e.g. #1A2B3C)")
  .optional();

const PATCH_SCHEMA = z
  .object({
    useKeyPool: z.boolean().optional(),
    pages: z
      .array(
        z.object({
          url: z.string().min(1),
          label: z.string().optional(),
          popupCount: z.number().int().min(0).max(20),
          popups: z
            .array(
              z.object({
                text: z.string().max(300),
                textColor: HEX_COLOR,
                highlightColor: z.union([HEX_COLOR, z.literal("")]).optional(),
                position: z
                  .enum([
                    "top",
                    "quarter",
                    "middle",
                    "three-quarter",
                    "bottom",
                    "random",
                  ])
                  .optional(),
                delaySeconds: z.number().int().min(0).max(600).optional(),
              })
            )
            .max(50)
            .optional(),
          minDwellSeconds: z.number().int().min(0).max(600).optional(),
          minScrollPercent: z.number().int().min(0).max(100).optional(),
          popupIntervalSeconds: z.number().int().min(0).max(600).optional(),
          firstPopupDelaySeconds: z.number().int().min(0).max(600).optional(),
          popupClickCount: z.number().int().min(1).max(50).optional(),
        })
      )
      .optional(),
    engagementMode: z.enum(["natural", "fast"]).optional(),
    popupAfterClickMessage: z.string().max(200).optional(),
    popupTitle: z.string().max(120).optional(),
    popupHtml: z.string().max(5000).optional(),
    popupDelaySeconds: z.number().int().min(0).max(60).optional(),
    popupTextColor: HEX_COLOR,
    popupBgColor: HEX_COLOR,
    popupAccentColor: HEX_COLOR,
    generateKeyButtonLabel: z.string().max(80).optional(),
  })
  .strict();

/**
 * PATCH /api/admin/tasks/[id]/article-config
 *
 * Sectional save for the article-task wizard. Merges a partial articleConfig
 * patch into the existing JSON column without touching any other Task field.
 * Used by the per-step "Save & Continue" buttons in ArticleTaskBuilder.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "tasks.create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, type: true, articleConfig: true },
  });
  if (!task || task.type !== "ARTICLE") {
    return NextResponse.json(
      { error: "Article task not found" },
      { status: 404 }
    );
  }

  const body = await req.json().catch(() => null);
  const v = PATCH_SCHEMA.safeParse(body);
  if (!v.success) {
    return NextResponse.json(
      { error: "Invalid input", details: v.error.issues },
      { status: 400 }
    );
  }
  const patch = v.data;

  // Shallow merge over the existing articleConfig (preserve fields not in
  // the patch — including the legacy `links`/`keywords`/etc. structure for
  // backward compat).
  const existing = (task.articleConfig as ArticleConfig | null) ?? {
    links: [],
    keywords: [],
    proofRequirements: { url: false, screenshot: false, uniqueKey: false },
  };
  const merged: ArticleConfig = { ...existing, ...patch };

  // Validate the merged config — catches "useKeyPool=true with no pages" etc.
  const valid = validateArticleConfig(merged);
  if (!valid.ok) {
    return NextResponse.json({ error: valid.error }, { status: 400 });
  }

  // Back-fill contentUrl with the first page URL when in pool mode and pages
  // changed (matches the outer-form's behavior in TaskForm.tsx).
  const updateData: {
    articleConfig: ArticleConfig;
    contentUrl?: string | null;
  } = {
    articleConfig: merged,
  };
  if (
    patch.pages !== undefined &&
    merged.useKeyPool &&
    merged.pages &&
    merged.pages.length > 0
  ) {
    const firstUrl = merged.pages.find((p) => p.url.trim())?.url ?? null;
    updateData.contentUrl = firstUrl;
  }

  await prisma.task.update({
    where: { id },
    data: {
      articleConfig: JSON.parse(JSON.stringify(updateData.articleConfig)),
      ...(updateData.contentUrl !== undefined && {
        contentUrl: updateData.contentUrl,
      }),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "ARTICLE_CONFIG_PATCHED",
      entity: "Task",
      entityId: id,
      newData: { changedKeys: Object.keys(patch) },
    },
  });

  return NextResponse.json({ ok: true, articleConfig: merged });
}
