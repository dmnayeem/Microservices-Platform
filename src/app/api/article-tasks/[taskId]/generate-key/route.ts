import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { renderedPopupCount } from "@/lib/article-tasks";
import type { ArticleConfig } from "@/lib/article-tasks";
import { verifyArticleTaskToken } from "@/lib/article-task-token";
import { corsPreflight, corsResponse } from "@/lib/article-task-cors";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/article-tasks/[taskId]/generate-key
 *
 * Body: { token: string }
 *
 * Final-page button. Validates that all pages have been completed, then
 * atomically pulls one unused key from the pool and binds it to the user.
 * If the user already has a key claimed for this submission, returns it
 * (idempotent — handles refresh / accidental double-click).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = await req.json().catch(() => ({}));
  const token = (body.token ?? "") as string;

  const v = verifyArticleTaskToken(token);
  if (!v.ok) return corsResponse({ error: v.error }, { status: 401 });
  if (v.payload.t !== taskId) {
    return corsResponse({ error: "Token / task mismatch" }, { status: 403 });
  }

  // 1. Idempotent: if this user already has a key claimed for this task
  //    (any submission), return it instead of pulling another one. Prevents
  //    accidental double-claims after refresh.
  const existing = await prisma.articleTaskKey.findFirst({
    where: { taskId, claimedByUserId: v.payload.u },
    orderBy: { claimedAt: "desc" },
    select: { id: true, keyValue: true },
  });
  if (existing) {
    return corsResponse({
      key: existing.keyValue,
      keyId: existing.id,
      reused: true,
    });
  }

  // 2. Validate all pages are completed for this submission.
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { articleConfig: true },
  });
  const cfg = task?.articleConfig as ArticleConfig | null;
  const pages = (cfg?.pages ?? []).filter((p) => p.url.trim());
  if (pages.length === 0) {
    return corsResponse({ error: "Task has no pages" }, { status: 400 });
  }

  const progress = await prisma.articleTaskPageProgress.findMany({
    where: { submissionId: v.payload.s },
    select: { pageIndex: true, pageCompleted: true },
  });
  const completedSet = new Set(
    progress.filter((p) => p.pageCompleted).map((p) => p.pageIndex)
  );
  for (let i = 0; i < pages.length; i++) {
    // Pages with popupCount=0 are auto-complete (the embed redirects to
    // the next page without firing popup-progress). Skip the validation
    // for those — applies to middle pages and the final page alike.
    if (renderedPopupCount(pages[i]) === 0) continue;
    if (!completedSet.has(i)) {
      return corsResponse(
        {
          error: `Page ${i + 1} not yet completed`,
          missingPages: pages
            .map((_, idx) => idx)
            .filter(
              (idx) =>
                !completedSet.has(idx) && renderedPopupCount(pages[idx]) > 0
            )
            .map((idx) => idx + 1),
        },
        { status: 400 }
      );
    }
  }

  // 3. Atomic claim: try to claim a single unused key in one UPDATE. We
  //    use a raw query so the WHERE condition (claimedByUserId IS NULL)
  //    is enforced atomically — race-safe even under concurrent claims.
  //    Postgres locks the matched row in the inner SELECT.
  const claimed = await prisma.$queryRaw<
    Array<{ id: string; keyValue: string }>
  >(
    Prisma.sql`
      UPDATE "ArticleTaskKey"
      SET "claimedByUserId" = ${v.payload.u},
          "claimedAt" = NOW()
      WHERE id = (
        SELECT id FROM "ArticleTaskKey"
        WHERE "taskId" = ${taskId}
          AND "claimedByUserId" IS NULL
        ORDER BY random()
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "keyValue"
    `
  );

  if (!claimed || claimed.length === 0) {
    return corsResponse(
      { error: "No unused keys remain in the pool. Contact the admin." },
      { status: 410 }
    );
  }

  return corsResponse({
    key: claimed[0].keyValue,
    keyId: claimed[0].id,
    reused: false,
  });
}
