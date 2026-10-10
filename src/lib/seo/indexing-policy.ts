/**
 * What search engines may index — one list, read by robots.txt and by
 * middleware (the `X-Robots-Tag: noindex` backstop).
 *
 * Public and indexable: the landing page, marketing + legal pages, the blog,
 * shared posts, public offers, and the public marketplace / course pages.
 * Everything else is the signed-in app, the admin panel, auth flows or
 * plumbing, and stays out of the index.
 *
 * Edge-safe: no imports, no server-only code (middleware runs on the edge).
 */

/** Signed-in app areas (src/app/(main), /tutor, /welcome), private marketplace screens and plumbing. */
export const ROBOTS_DISALLOW = [
  "/admin",
  "/api",
  "/go/",
  "/embed/",
  "/unsubscribe",
  "/impersonate",
  "/cert-print/",
  "/appeal",
  "/tutor",
  "/welcome",
  "/no-access",
  "/update-password",
  "/2fa-setup",
  // (main)
  "/achievements",
  "/advertiser",
  "/affiliate",
  "/agency",
  "/app-install-tasks",
  "/visit-tasks",
  "/v/",
  "/badge",
  "/article-tasks",
  "/board-tasks",
  "/buy-points",
  "/buyer",
  "/certificates",
  "/chat",
  "/course-creator",
  "/cpa",
  "/create-task",
  "/custom-tasks",
  "/daily-mission",
  "/dashboard",
  "/deposit",
  "/earn",
  "/events",
  "/games",
  "/groups",
  "/hashtag",
  "/kyc",
  "/leaderboard",
  "/learn",
  "/lottery",
  "/manual-tasks",
  "/milestones",
  "/missions",
  "/my-learning",
  "/my-package",
  "/notifications",
  "/offerwalls",
  "/packages",
  "/payment-methods",
  "/profile",
  "/proxy-tasks",
  "/quiz-tasks",
  "/quizzes",
  "/referrals",
  "/saved",
  "/settings",
  "/social",
  "/subscriptions",
  "/support",
  "/survey-tasks",
  "/tasks",
  "/transactions",
  "/u/",
  "/video-tasks",
  "/wallet",
  "/watch-ads",
  "/withdrawal",
  // The marketplace's own pages are public; these screens are per-user.
  "/marketplace/cart",
  "/marketplace/create",
  "/marketplace/messages",
  "/marketplace/my",
  "/marketplace/orders",
] as const;

/** Auth flows: reachable and followed (they link to the site), never indexed. */
const NOINDEX_ONLY = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

// robots.txt rules are plain prefixes; "/u/" also covers "/u" itself.
function under(pathname: string, prefix: string): boolean {
  return pathname.startsWith(prefix) || pathname === prefix.replace(/\/$/, "");
}

/**
 * True when a page at this path must carry noindex. Mirrors ROBOTS_DISALLOW's
 * prefix semantics (robots.txt rules are plain prefixes) plus the auth flows.
 */
export function isNoindexPath(pathname: string): boolean {
  return ROBOTS_DISALLOW.some((p) => under(pathname, p)) || NOINDEX_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
