import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { renderedPopupCount } from "@/lib/article-tasks";
import type { ArticleConfig } from "@/lib/article-tasks";
import {
  verifyArticleTaskToken,
  verifyArticleVisitToken,
} from "@/lib/article-task-token";
import { coerceArticleEntry, entryVerdictAllows } from "@/lib/article-tasks";
import { corsPreflight, corsResponse } from "@/lib/article-task-cors";

/* One key per browser per task per day on the anonymous path. Generous for a
   real worker, who needs exactly one, and the ceiling on how fast a pool can
   be drained by someone reloading a public page. */
const ANON_KEYS_PER_BROWSER_PER_DAY = 1;

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
  const visitToken = (body.visitToken ?? "") as string;

  /* An anonymous journey — search or social — has no user and no submission.
     It presents the signed note it has been carrying instead, and the key it
     is issued records what that note says about the arrival, because by the
     time the key is submitted the referrer is long gone. */
  if (visitToken && !token) {
    return issueAnonymousKey(taskId, visitToken);
  }

  const v = verifyArticleTaskToken(token);
  if (!v.ok) return corsResponse({ error: v.error }, { status: 401 });
  if (v.payload.t !== taskId) {
    return corsResponse({ error: "Token / task mismatch" }, { status: 403 });
  }

  // 1. Idempotent: if this user already holds a key for this task that has
  //    NOT been submitted yet, return it instead of pulling another one.
  //    Prevents accidental double-claims after refresh.
  //
  //    Only an unsubmitted key. This once matched any key the user had ever
  //    claimed, so on a repeatable task the second day's attempt was handed
  //    back yesterday's key — already bound to yesterday's submission — and
  //    submit refused it with "This key has already been submitted". The user
  //    had done the work and could not be paid for it.
  const existing = await prisma.articleTaskKey.findFirst({
    where: { taskId, claimedByUserId: v.payload.u, submissionId: null },
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

/**
 * Claim a key for a journey that arrived anonymously.
 *
 * Differs from the signed-in path in three ways and no more: the completed
 * pages come from the note rather than from a progress table, the key is left
 * unclaimed until someone submits it, and the arrival evidence is written onto
 * the key so a reviewer can see it later.
 *
 * Rate-limited per browser. The signed-in path does not need this — one user
 * gets one key, enforced by `claimedByUserId` — but an anonymous page can be
 * reloaded by anyone, and a pool that can be drained is a pool that will be.
 */
async function issueAnonymousKey(taskId: string, visitToken: string) {
  const vv = verifyArticleVisitToken(visitToken);
  if (!vv.ok) return corsResponse({ error: vv.error }, { status: 401 });
  if (vv.payload.t !== taskId) {
    return corsResponse({ error: "Visit / task mismatch" }, { status: 403 });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { articleConfig: true },
  });
  const cfg = task?.articleConfig as ArticleConfig | null;
  const entry = coerceArticleEntry(cfg?.entry);
  if (!entry) {
    return corsResponse(
      { error: "This task does not accept anonymous entry" },
      { status: 400 }
    );
  }

  /* The verdict was reached at the door and is re-checked here, because the
     door is client-side and this is not. A refused verdict should never have
     produced a note at all, so reaching this line means something is wrong. */
  const verdict = vv.payload.v as Parameters<typeof entryVerdictAllows>[1];
  const { start } = entryVerdictAllows(entry, verdict);
  if (!start) {
    return corsResponse(
      { error: "This visit did not arrive the way the task requires" },
      { status: 403 }
    );
  }

  const pages = (cfg?.pages ?? []).filter((p) => p.url.trim());
  if (pages.length === 0) {
    return corsResponse({ error: "Task has no pages" }, { status: 400 });
  }
  const missing = pages
    .map((p, i) => (renderedPopupCount(p) > 0 && !vv.payload.p.includes(i) ? i + 1 : 0))
    .filter(Boolean);
  if (missing.length > 0) {
    return corsResponse(
      { error: `Page ${missing[0]} not yet completed`, missingPages: missing },
      { status: 400 }
    );
  }

  const fingerprint = vv.payload.f || "";
  if (fingerprint) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await prisma.articleTaskKey.count({
      where: { taskId, visitFingerprint: fingerprint, issuedAt: { gte: since } },
    });
    if (recent >= ANON_KEYS_PER_BROWSER_PER_DAY) {
      return corsResponse(
        { error: "This browser has already been given a key for this task." },
        { status: 429 }
      );
    }
  }

  const claimed = await prisma.$queryRaw<Array<{ id: string; keyValue: string }>>(
    Prisma.sql`
      UPDATE "ArticleTaskKey"
      SET "issuedAt" = NOW(),
          "entrySource" = ${verdict},
          "entryReferrer" = ${vv.payload.r ?? null},
          "entryLandingUrl" = ${vv.payload.l ?? null},
          "visitFingerprint" = ${fingerprint || null}
      WHERE id = (
        SELECT id FROM "ArticleTaskKey"
        WHERE "taskId" = ${taskId}
          AND "claimedByUserId" IS NULL
          AND "submissionId" IS NULL
          AND "issuedAt" IS NULL
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
    /* Told plainly, so the worker is not surprised at submit time. */
    willAutoApprove: entryVerdictAllows(entry, verdict).autoApprove,
  });
}
