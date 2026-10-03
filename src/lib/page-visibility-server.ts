import { cache } from "react";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";
import { getEffectivePackage } from "@/lib/packages";
import { isLeaderboardEnabled } from "@/lib/leaderboard-gate";
import {
  parsePageRules,
  parsePageOverrides,
  computeHiddenPaths,
  isPathHidden,
  type PageVisibilityRules,
} from "@/lib/page-visibility";

const RULES_KEY = "page_visibility.rules";

/** The persisted everyone/package/role rules (admin-editable matrix). Fail-safe: empty. */
export async function getPageVisibilityRules(): Promise<PageVisibilityRules> {
  try {
    const raw = await getSetting<unknown>(RULES_KEY, null);
    return parsePageRules(raw);
  } catch {
    return parsePageRules(null);
  }
}

async function resolveHiddenPaths(userId: string): Promise<string[]> {
  const [rules, user, pkg] = await Promise.all([
    getPageVisibilityRules(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, pageOverrides: true },
      // Runs on EVERY navigation across every (main) page, and was the only
      // uncached read in the shell. Role and per-user page overrides change on
      // an admin action, so a minute of staleness is invisible — and this
      // already fails open (catch → []).
      cacheStrategy: { ttl: 60, swr: 300 },
    }),
    getEffectivePackage(userId).catch(() => null),
  ]);
  if (!user) return [];
  const hidden = computeHiddenPaths(
    rules,
    pkg?.slug ?? null,
    user.role ?? null,
    parsePageOverrides(user.pageOverrides)
  );
  // The leaderboard feature switch rides the same channel, so ONE check
  // covers the sidebar, the bottom tab bar and the PageAccessGuard route
  // guard instead of six copies. The page and `/api/leaderboard` enforce it
  // themselves too — this resolver deliberately fails open, and a feature
  // that is only hidden is not off.
  if (!hidden.includes("/leaderboard") && !(await isLeaderboardEnabled())) {
    hidden.push("/leaderboard");
  }
  return hidden;
}

/**
 * The set of hidden user-facing paths for a user. Combines everyone + package
 * + role rules with the user's per-user overrides (which win). Fail-safe: on
 * any error nothing is hidden (never lock a user out of the whole app because
 * of a settings blip).
 */
export const getHiddenPaths = cache(async (userId: string): Promise<string[]> => {
  try {
    return await resolveHiddenPaths(userId);
  } catch {
    return [];
  }
});

/**
 * Which APIs sit behind which page. A route under one of these prefixes calls
 * `assertPageVisible(userId, page)` at the top of its user-facing handlers, so
 * hiding the page also stops the feature, not just the link. Admin routes,
 * postbacks, cron and public/embed endpoints are deliberately NOT here.
 *
 * `/api/tasks/[id]/start|submit` are keyed by the task's TYPE instead (see
 * `taskTypePage`), since one route serves every task page.
 */
export const PAGE_API_PREFIXES: Record<string, string[]> = {
  "/tasks": ["/api/tasks/summary"],
  "/article-tasks": ["/api/article-tasks/[taskId]/start"],
  "/board-tasks": ["/api/tasks/boards"],
  "/proxy-tasks": ["/api/tasks/proxy"],
  "/quiz-tasks": ["/api/tasks/quiz"],
  "/social-tasks": ["/api/tasks/social"],
  "/create-task": ["/api/tasks/create"],
  "/offerwalls": ["/api/offerwalls", "/api/offerwall/catalog", "/api/offerwall/history", "/api/offerwall/offers"],
  "/cpa": ["/api/cpa/offers", "/api/cpa/my", "/go/cpa/[id]"],
  "/lottery": ["/api/lottery"],
  "/games": ["/api/games/[id]/session"],
  "/quizzes": ["/api/quizzes"],
  // Entry points only: open deals, orders, disputes and downloads keep
  // working so money already in escrow can still settle.
  "/marketplace": ["/api/marketplace (POST)", "/api/marketplace/listings (POST)", "/api/marketplace/[id]/checkout", "/api/marketplace/listings/[id]/bids (POST)", "/api/marketplace/listings/[id]/offers (POST)"],
  "/courses": ["/api/courses (GET)", "/api/courses/[id]/enroll"],
  "/events": ["/api/events"],
  "/missions": ["/api/missions"],
  "/daily-mission": ["/api/daily-mission"],
  "/milestones": ["/api/milestones"],
  "/achievements": ["/api/achievements"],
  "/referrals": ["/api/referrals"],
  "/leaderboard": ["/api/leaderboard"],
  "/watch-ads": ["/api/browse-earn"],
  "/chat": ["/api/chat/conversations"],
  "/advertiser": ["/api/advertiser/campaigns (POST)", "/api/advertiser/campaigns/[id]/ads (POST)", "/api/advertiser/campaigns/[id]/fund"],
  "/agency": ["/api/agency/reports (GET)"],
  "/affiliate": ["/api/affiliate/me", "/api/affiliate/join"],
  "/deposit": ["/api/deposits", "/api/deposits/gateway/init"],
  "/withdrawal": ["/api/withdrawals (POST)"],
};

// Per-instance memo for the API guard. The layout path is covered by React's
// per-request `cache`; route handlers get no such memo, and a task run fires
// start → heartbeat → submit in quick succession. 20 s is well inside the
// 60 s Accelerate TTL the user read already carries.
const API_TTL_MS = 20_000;
const apiMemo = new Map<string, { at: number; hidden: string[] }>();

async function hiddenForApi(userId: string): Promise<string[]> {
  const hit = apiMemo.get(userId);
  if (hit && Date.now() - hit.at < API_TTL_MS) return hit.hidden;
  const hidden = await resolveHiddenPaths(userId);
  if (apiMemo.size > 5000) apiMemo.clear();
  apiMemo.set(userId, { at: Date.now(), hidden });
  return hidden;
}

/**
 * Refuse an API call whose page the super admin hid for this user. Returns a
 * 403 response to send back, or null to carry on.
 *
 * Only ever REFUSES — it grants nothing, so the route's own checks still run.
 * Fails OPEN: a visibility read error must never block a money flow; only a
 * page that is positively hidden is refused.
 */
export async function assertPageVisible(
  userId: string | null | undefined,
  pagePath: string | null | undefined
): Promise<NextResponse | null> {
  if (!userId || !pagePath) return null;
  let hidden: string[];
  try {
    hidden = await hiddenForApi(userId);
  } catch {
    return null;
  }
  if (!isPathHidden(pagePath, hidden)) return null;
  return NextResponse.json(
    { error: "This feature isn't available on your account.", code: "PAGE_HIDDEN" },
    { status: 403 }
  );
}
