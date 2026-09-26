/**
 * The public (not signed-in) pages: the landing page, marketing and legal
 * pages, and the auth screens. Used to scope tracking tags and custom code to
 * "public pages only". Mirrors `publicRoutes` in lib/auth/config.ts plus the
 * marketing pages that live outside it.
 */
const PUBLIC_PREFIXES = [
  "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/appeal",
  "/privacy", "/terms", "/refund", "/cookies", "/offer",
  "/features", "/about", "/careers", "/blog", "/press", "/help", "/contact", "/status",
  "/microtask", "/advertise", "/referral", "/post",
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Never track or inject code into the admin panel. */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
