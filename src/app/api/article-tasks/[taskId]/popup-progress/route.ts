import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ARTICLE_TIMING_SLACK, popupDelaySeconds, renderedPopupCount } from "@/lib/article-tasks";
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
  let clamped = Math.min(popupsCompleted, required);

  // Paced on the SERVER clock. The count used to be taken as sent, so one
  // request with `popupsCompleted: 99` finished a page that was never opened.
  //
  // Measured as a running total from when this page could start (the attempt
  // for page 1, the previous page's completion after that): popup n is
  // allowed once the waits of popups 1..n have passed. A running total — not
  // "time since the last report" — so a slow, lost or reordered request can
  // never leave the page stuck one click behind. The 1.5s per popup covers the
  // embed's 1-second dwell tick. ("fast" is the admin's no-gates test mode.)
  let prevCount = 0;
  let hasRow = false;
  if (cfg?.engagementMode !== "fast") {
    const [prev, sub, prevPage] = await Promise.all([
      prisma.articleTaskPageProgress.findUnique({
        where: { submissionId_pageIndex: { submissionId: v.payload.s, pageIndex } },
        select: { popupsCompleted: true },
      }),
      prisma.taskSubmission.findUnique({ where: { id: v.payload.s }, select: { createdAt: true } }),
      pageIndex > 0
        ? prisma.articleTaskPageProgress.findUnique({
            where: { submissionId_pageIndex: { submissionId: v.payload.s, pageIndex: pageIndex - 1 } },
            select: { completedAt: true },
          })
        : Promise.resolve(null),
    ]);
    hasRow = !!prev;
    prevCount = prev?.popupsCompleted ?? 0;
    const base = prevPage?.completedAt ?? sub?.createdAt ?? new Date();
    const elapsed = (Date.now() - base.getTime()) / 1000;
    let allowed = 0;
    let acc = 0;
    while (allowed < required) {
      acc += Math.max(0, popupDelaySeconds(pageDef, allowed) * ARTICLE_TIMING_SLACK - 1.5);
      if (acc > elapsed) break;
      allowed++;
    }
    // Never move backwards either.
    clamped = Math.max(prevCount, Math.min(clamped, allowed));
    // Nothing new: don't write (and don't move `updatedAt`).
    if (hasRow && clamped <= prevCount) {
      return corsResponse({ popupsCompleted: prevCount, required, pageCompleted: prevCount >= required });
    }
  }
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
