import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  type ArticleConfig,
  sanitizePopupHtml,
  DEFAULT_POPUP_THEME,
  buildEngagementPlan,
  renderedPopupCount,
} from "@/lib/article-tasks";
import { createHmac } from "crypto";
import {
  verifyArticleVisitToken,
  appendArticleVisitToken,
  type ArticleVisitTokenPayload,
  verifyArticleTaskToken,
  appendArticleToken,
} from "@/lib/article-task-token";
import { corsPreflight, corsResponse } from "@/lib/article-task-cors";

export function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/article-tasks/[taskId]/embed-config?token=...&page=N
 *
 * Called by the embed script on every article page load. Returns the popup
 * config + the URL to redirect to once popups complete (next page or
 * "complete" landing).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") ?? searchParams.get("eg");
  const visitToken = searchParams.get("visitToken") ?? searchParams.get("egv");
  const pageParam = parseInt(searchParams.get("page") ?? "1", 10);
  const pageNumber = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  // Two ways to be here. A session token means the worker followed a link we
  // handed them; a visit note means they arrived from a search result or a
  // social post, where no per-user link can exist. Everything below is the
  // same for both — only where progress comes from differs.
  let visit: ArticleVisitTokenPayload | null = null;
  let submissionId: string | null = null;
  // Whatever identifies this reader for the seeded waypoint layout. The token
  // flow has a user id; an anonymous journey has only its fingerprint, which
  // is the closest stable thing it owns. Either way the point is the same: two
  // readers get different popup positions, and one reader gets the same
  // positions back after a refresh.
  let seedSubject = "";
  if (visitToken && !token) {
    const vv = verifyArticleVisitToken(visitToken);
    if (!vv.ok) return corsResponse({ error: vv.error }, { status: 401 });
    if (vv.payload.t !== taskId) {
      return corsResponse({ error: "Visit / task mismatch" }, { status: 403 });
    }
    visit = vv.payload;
    seedSubject = vv.payload.f || vv.payload.v;
  } else {
    const v = verifyArticleTaskToken(token);
    if (!v.ok) {
      return corsResponse({ error: v.error }, { status: 401 });
    }
    if (v.payload.t !== taskId) {
      return corsResponse({ error: "Token / task mismatch" }, { status: 403 });
    }
    submissionId = v.payload.s;
    seedSubject = v.payload.u;
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.type !== "ARTICLE") {
    return corsResponse({ error: "Task not found" }, { status: 404 });
  }

  const cfg = task.articleConfig as ArticleConfig | null;
  if (!cfg?.useKeyPool) {
    return corsResponse(
      { error: "Task is not configured for key-pool flow" },
      { status: 400 }
    );
  }
  const pages = (cfg.pages ?? []).filter((p) => p.url.trim());
  const pageIndex = pageNumber - 1;
  const page = pages[pageIndex];
  if (!page) {
    return corsResponse(
      { error: `Page ${pageNumber} not found (task has ${pages.length} pages)` },
      { status: 404 }
    );
  }

  const isFinal = pageIndex === pages.length - 1;
  const next = isFinal ? null : pages[pageIndex + 1];

  // Live popup progress for this page, so the embed can resume mid-page after
  // a refresh. An anonymous journey has no submission row to read: its
  // progress is whole pages, carried in the note, so a refresh mid-page starts
  // that page again. Acceptable — the alternative is a row per visitor on a
  // public article, and the pages are short.
  const progress = submissionId
    ? await prisma.articleTaskPageProgress.findUnique({
        where: { submissionId_pageIndex: { submissionId, pageIndex } },
        select: { popupsCompleted: true, pageCompleted: true },
      })
    : visit?.p.includes(pageIndex)
      ? { popupsCompleted: renderedPopupCount(page), pageCompleted: true }
      : null;

  // Compute the auto-submit landing URL on our origin (the embed redirects
  // here after the user generates their key on the final page).
  const origin = req.nextUrl.origin;
  const completeUrl = `${origin}/article-tasks/complete`;

  // Build the inline-text popup TEMPLATES from admin config. Prefer
  // page.popups; fall back to legacy `popupCount` synthesis.
  const popupTemplates = (page.popups && page.popups.length > 0)
    ? page.popups.map((p) => ({
        text: String(p.text ?? "").trim(),
        textColor: p.textColor || cfg.popupTextColor || DEFAULT_POPUP_THEME.textColor,
        highlightColor: p.highlightColor || null,
        // v3.5: per-popup admin-set position + delay. Defaults applied
        // client-side if missing.
        position: p.position ?? "random",
        delaySeconds:
          typeof p.delaySeconds === "number" && p.delaySeconds >= 0
            ? p.delaySeconds
            : null,
      })).filter((p) => p.text.length > 0)
    : Array.from({ length: page.popupCount }, (_, i) => ({
        text: `Continue reading (${i + 1}/${page.popupCount})`,
        textColor: cfg.popupTextColor || DEFAULT_POPUP_THEME.textColor,
        highlightColor: null,
        position: "random" as const,
        delaySeconds: null,
      }));

  // v3.3: total clicks needed = admin's `popupClickCount`, defaulting to
  // the number of templates. Cycle through templates to fill the count
  // (so admin can have 2 texts but require 5 clicks; the user sees text
  // 1 → 2 → 1 → 2 → 1).
  const targetClickCount =
    page.popupClickCount && page.popupClickCount > 0
      ? page.popupClickCount
      : popupTemplates.length;
  const popupItems = popupTemplates.length === 0
    ? []
    : Array.from({ length: targetClickCount }, (_, i) => {
        return popupTemplates[i % popupTemplates.length];
      });

  // v3: build a per-user engagement plan. Same (userId, taskId, pageNumber)
  // → same plan, so refresh resumes the user's identical sequence.
  const engagementSecret =
    process.env.ARTICLE_TASK_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "fallback-static-secret-change-me";
  const seedHex = createHmac("sha256", engagementSecret)
    .update(`${seedSubject}|${taskId}|${pageNumber}`)
    .digest("hex");
  // v3.2/v3.4: single-knob timing. `popupIntervalSeconds` controls both
  // the first-popup delay AND the gap between subsequent popups. We do
  // NOT auto-derive a click-time dwell gate anymore — the popup interval
  // already paces reveals; once a popup is on screen, clicks are
  // accepted immediately. The previous auto-minDwell caused user clicks
  // to be silently shaken away.
  const interval = Math.max(
    3,
    Math.min(600, page.popupIntervalSeconds ?? 15)
  );
  const engagement = buildEngagementPlan(
    seedHex,
    popupItems.length,
    page,
    cfg.engagementMode === "fast" ? "fast" : "natural"
  );

  return corsResponse({
    taskId,
    pageNumber,
    pageCount: pages.length,
    isFinal,
    // Legacy fields (still consumed by older embed builds).
    // The number the reader will actually see, which is the same number
    // popup-progress requires — these must never disagree again.
    popupCount: renderedPopupCount(page),
    popupTitle: cfg.popupTitle ?? "Continue reading",
    popupHtml: sanitizePopupHtml(cfg.popupHtml ?? ""),
    popupDelaySeconds: Math.max(0, Math.min(60, cfg.popupDelaySeconds ?? 5)),
    generateKeyButtonLabel:
      cfg.generateKeyButtonLabel ?? "Generate My Unique Key",
    theme: {
      textColor: cfg.popupTextColor ?? DEFAULT_POPUP_THEME.textColor,
      bgColor: cfg.popupBgColor ?? DEFAULT_POPUP_THEME.bgColor,
      accentColor: cfg.popupAccentColor ?? DEFAULT_POPUP_THEME.accentColor,
    },
    // v3: explicit inline-text popup items used by the new embed build.
    popups: popupItems,
    // v3: per-user engagement plan (waypoints, popup order, jitter, gates).
    engagement,
    // v3.2: single-knob pacing — `interval` controls both first-popup
    // delay AND gaps between popups. Admin only sets one number.
    // (Legacy `firstPopupDelaySeconds` still respected if the admin set
    // it explicitly, otherwise it falls back to the same interval.)
    popupTiming: {
      firstDelaySeconds: Math.max(
        0,
        Math.min(600, page.firstPopupDelaySeconds ?? interval)
      ),
      intervalSeconds: interval,
    },
    // v3.1: short message shown after each click telling the user what
    // to do next ("Keep reading, the next prompt will appear soon").
    popupAfterClickMessage:
      cfg.popupAfterClickMessage ??
      "Nice — keep reading, the next prompt will appear soon.",
    // The note rides to the next page the same way the session token does.
    nextPageUrl: next
      ? visit
        ? appendArticleVisitToken(next.url, visitToken!)
        : appendArticleToken(next.url, token!)
      : null,
    completeUrl, // where to redirect with the key after generation
    progress: {
      popupsCompleted: progress?.popupsCompleted ?? 0,
      pageCompleted: progress?.pageCompleted ?? false,
    },
  });
}

/**
 * Put `?eg=<token>` on the next page's URL.
 *
 * Naive concatenation gets two cases wrong, and both end with the embed script
 * going silent on that page — it returns immediately when the token is missing,
 * so the reader sees the article with no popups and never reaches the key:
 *
 *  - **A fragment.** `…/article#intro` + `?eg=T` gives `#intro?eg=T`, where the
 *    query is part of the FRAGMENT. `searchParams.get('eg')` returns null.
 *  - **A token already there.** Re-entering a page appended a second `eg=`,
 *    and the first one wins, which may be an expired token.
 *
 * Parsed properly, with the string form kept as a fallback for a relative or
 * malformed URL an admin may have typed.
 */
