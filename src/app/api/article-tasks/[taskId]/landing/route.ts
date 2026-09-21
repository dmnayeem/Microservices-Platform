import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  coerceArticleEntry,
  entryVerdictAllows,
  evaluateArticleEntry,
} from "@/lib/article-tasks";
import type { ArticleConfig } from "@/lib/article-tasks";
import { signArticleVisitToken } from "@/lib/article-task-token";
import { corsPreflight, corsResponse } from "@/lib/article-task-cors";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/article-tasks/[taskId]/landing
 *
 * Body: { referrer?: string, url?: string, fp?: string }
 *
 * The opening move of the two anonymous entry modes. A search result and a
 * public social post hand the same URL to every reader, so neither can carry a
 * per-user token; the embed instead reports how the visitor arrived and asks
 * whether this counts.
 *
 * The answer is deliberately given BEFORE the journey starts. A worker who
 * reached the page the wrong way should be told at the door, not after
 * clicking through every popup on every page — doing the whole task and
 * failing at the last step is the worst version of this feature.
 *
 * Nothing is written here. The verdict comes back as a signed note the embed
 * presents when it claims a key, so a public page costs no row per visitor.
 *
 * `direct` tasks never reach this route; if one does, it is told so plainly
 * rather than being handed a verdict that would then be checked against a
 * requirement it does not have.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    referrer?: unknown;
    url?: unknown;
    fp?: unknown;
  };

  const referrer = typeof body.referrer === "string" ? body.referrer : "";
  const url = typeof body.url === "string" ? body.url : "";
  // Coarse and self-reported — enough to notice a key that moved browsers,
  // not an identity. Bounded so a crafted value cannot bloat a token.
  const fp = (typeof body.fp === "string" ? body.fp : "").slice(0, 64);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { articleConfig: true },
  });
  if (!task) {
    return corsResponse({ error: "Task not found" }, { status: 404 });
  }

  const cfg = task.articleConfig as ArticleConfig | null;
  const entry = coerceArticleEntry(cfg?.entry);
  if (!entry) {
    // Not an entry-mode task. Say so, so the embed keeps to the token flow
    // instead of waiting for a verdict that is never coming.
    return corsResponse({ mode: "direct", start: true });
  }

  const evidence = evaluateArticleEntry(entry, referrer, url);
  const { start, autoApprove } = entryVerdictAllows(entry, evidence.verdict);

  // Only sign a note for a journey that is allowed to begin. A refused
  // arrival gets instructions and nothing it could present later.
  const visitToken = start
    ? signArticleVisitToken({
        t: taskId,
        v: evidence.verdict,
        f: fp,
        r: evidence.referrerHost || undefined,
        l: url ? url.slice(0, 500) : undefined,
        p: [],
      })
    : undefined;

  return corsResponse({
    mode: entry.mode,
    verdict: evidence.verdict,
    start,
    autoApprove,
    visitToken,
    // What the embed shows when it refuses. Written here rather than in the
    // script so the wording can change without re-publishing an embed that
    // lives on someone else's website.
    message: start
      ? undefined
      : entry.mode === "search"
        ? `Open this page from a ${entry.searchEngine === "bing" ? "Bing" : "Google"} search result. Go back and search for: ${entry.searchKeyword ?? ""}`.trim()
        : "Open this page from the link inside the post, not directly.",
    keyword: entry.mode === "search" ? entry.searchKeyword : undefined,
  });
}
