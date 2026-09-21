import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderedPopupCount } from "@/lib/article-tasks";
import type { ArticleConfig } from "@/lib/article-tasks";
import {
  signArticleVisitToken,
  verifyArticleVisitToken,
} from "@/lib/article-task-token";
import { corsPreflight, corsResponse } from "@/lib/article-task-cors";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/article-tasks/[taskId]/visit-progress
 *
 * Body: { visitToken: string, page: number }
 *
 * The anonymous counterpart of popup-progress. A journey that arrived from a
 * search result or a social post has no submission row, so there is nowhere to
 * upsert per-page progress to — it rides inside the signed note instead, and
 * this route is what adds a page to it.
 *
 * Re-signing rather than storing means the page cannot add a page it did not
 * read: the note it sends back is the note we last issued, and the only way
 * to get a longer one is to ask us for it.
 *
 * Called once per page, when that page's popups are all clicked. That is the
 * same level of trust the token flow already runs on — there, too, the embed
 * is the one reporting each click.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    visitToken?: unknown;
    page?: unknown;
  };

  const v = verifyArticleVisitToken(
    typeof body.visitToken === "string" ? body.visitToken : null
  );
  if (!v.ok) return corsResponse({ error: v.error }, { status: 401 });
  if (v.payload.t !== taskId) {
    return corsResponse({ error: "Visit / task mismatch" }, { status: 403 });
  }

  const pageNumber = Number(body.page);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return corsResponse({ error: "Invalid page" }, { status: 400 });
  }
  const pageIndex = pageNumber - 1;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { articleConfig: true },
  });
  const cfg = task?.articleConfig as ArticleConfig | null;
  const pages = (cfg?.pages ?? []).filter((p) => p.url.trim());
  if (!pages[pageIndex]) {
    return corsResponse({ error: "Page not found" }, { status: 404 });
  }

  // Idempotent: a refresh or a double-click must not grow the list, and the
  // note has to stay small enough to ride in a URL.
  const done = Array.from(new Set([...v.payload.p, pageIndex])).sort(
    (a, b) => a - b
  );

  const required = pages
    .map((p, i) => (renderedPopupCount(p) > 0 ? i : -1))
    .filter((i) => i >= 0);
  const remaining = required.filter((i) => !done.includes(i));

  // Re-sign with the same TTL the note started on, so finishing a long
  // journey does not quietly extend how long the note stays valid.
  const ttl = Math.max(60, v.payload.exp - Math.floor(Date.now() / 1000));
  const visitToken = signArticleVisitToken(
    {
      t: v.payload.t,
      v: v.payload.v,
      f: v.payload.f,
      r: v.payload.r,
      l: v.payload.l,
      p: done,
    },
    ttl
  );

  return corsResponse({
    visitToken,
    completed: done.map((i) => i + 1),
    remaining: remaining.map((i) => i + 1),
    allDone: remaining.length === 0,
  });
}
