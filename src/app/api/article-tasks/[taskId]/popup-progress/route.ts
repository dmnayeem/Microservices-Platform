import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderedPopupCount } from "@/lib/article-tasks";
import type { ArticleConfig } from "@/lib/article-tasks";
import { verifyArticleTaskToken } from "@/lib/article-task-token";
import { corsPreflight, corsResponse } from "@/lib/article-task-cors";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/article-tasks/[taskId]/popup-progress
 *
 * Body: { token: string, page: number, popupsCompleted: number }
 *
 * The embed reports the running popup count for the current page. We
 * upsert ArticleTaskPageProgress and (if the count meets the configured
 * popupCount) flip pageCompleted=true.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = await req.json().catch(() => ({}));
  const token = (body.token ?? "") as string;
  const pageNumber = parseInt(String(body.page ?? "1"), 10);
  const popupsCompleted = Math.max(0, parseInt(String(body.popupsCompleted ?? "0"), 10) || 0);

  const v = verifyArticleTaskToken(token);
  if (!v.ok) return corsResponse({ error: v.error }, { status: 401 });
  if (v.payload.t !== taskId) {
    return corsResponse({ error: "Token / task mismatch" }, { status: 403 });
  }
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return corsResponse({ error: "Invalid page number" }, { status: 400 });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { articleConfig: true },
  });
  const cfg = task?.articleConfig as ArticleConfig | null;
  const pages = (cfg?.pages ?? []).filter((p) => p.url.trim());
  const pageIndex = pageNumber - 1;
  const pageDef = pages[pageIndex];
  if (!pageDef) {
    return corsResponse({ error: "Page not found" }, { status: 404 });
  }

  // Must be the number the embed actually draws, or the page can never
  // be completed. See renderedPopupCount.
  const required = renderedPopupCount(pageDef);
  const clamped = Math.min(popupsCompleted, required);
  const pageCompleted = clamped >= required;

  const row = await prisma.articleTaskPageProgress.upsert({
    where: {
      submissionId_pageIndex: {
        submissionId: v.payload.s,
        pageIndex,
      },
    },
    update: {
      // Don't let the count regress (race-safe)
      popupsCompleted: { set: clamped },
      pageCompleted,
      ...(pageCompleted && { completedAt: new Date() }),
    },
    create: {
      submissionId: v.payload.s,
      pageIndex,
      popupsCompleted: clamped,
      pageCompleted,
      completedAt: pageCompleted ? new Date() : null,
    },
    select: {
      popupsCompleted: true,
      pageCompleted: true,
    },
  });

  return corsResponse({
    popupsCompleted: row.popupsCompleted,
    required,
    pageCompleted: row.pageCompleted,
  });
}
