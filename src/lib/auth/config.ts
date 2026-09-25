import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";

/**
 * Cookie that carries a `?ref=` referral code across an OAuth round trip.
 * Written by the middleware (see `allow()` below), read once when a Google
 * account is created in `src/lib/auth/index.ts`.
 */
export const REFERRAL_COOKIE = "eg_ref";

/** The first-login handle picker, and the cookie that says it's been done. */
export const ONBOARDING_PATH = "/welcome";
export const ONBOARDED_COOKIE = "eg_onb";

// Admin roles that can access /admin routes
// Must match ADMIN_ROLE_STRINGS in @/lib/rbac
const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "MANAGER",
  "ADMIN",
  "FINANCE_ADMIN",
  "CONTENT_ADMIN",
  "SUPPORT_ADMIN",
  "MARKETING_ADMIN",
  "MODERATOR",
  "AD_MANAGER",
] as const;

// Reserved: schema for credentials validation when `authorize` is wired up.
const _loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Build providers array dynamically
const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    // Authorization is handled in the main auth config with database access
    authorize: () => null,
  }),
];

// Only add Google provider if credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.unshift(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

// Edge-compatible config (no database operations)
export const authConfig: NextAuthConfig = {
  // Trust the deployment host (behind a proxy / custom port). Required by
  // Auth.js in production — dev auto-trusts localhost. Set AUTH_TRUST_HOST or
  // this flag; here we enable it so prod builds work across hosts.
  trustHost: true,
  providers,
  pages: {
    signIn: "/login",
    signOut: "/login",
    error: "/login",
    verifyRequest: "/verify-email",
    newUser: "/social",
  },
  callbacks: {
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      // Allow. Nothing more.
      //
      // This used to return `NextResponse.next({ request: { headers } })`
      // carrying `x-pathname`, with the `?ref=` referral cookie set on it. Auth
      // .js reads this callback's return value only as ALLOW / DENY / redirect:
      // a plain `next()` counts as "allowed" and is then discarded. So neither
      // the header nor the cookie ever reached the app — the admin layout's
      // route guard read an empty pathname and did nothing, and every Google
      // referral lost its attribution.
      //
      // Both now live in `middleware.ts`, where the response returned is the
      // one the browser actually gets. `true` is what this callback is for.
      const allow = () => true;

      // Public routes that don't require authentication
      const publicRoutes = [
        "/",
        "/login",
        "/register",
        "/forgot-password",
        // A suspended user appeals here with a signed link — no session.
        "/appeal",
        "/reset-password",
        "/verify-email",
        "/privacy",
        "/terms",
        "/refund",
        "/cookies",
        "/offer",
        // Public marketing site — reachable without an account.
        "/features",
        "/about",
        "/careers",
        "/blog",
        "/press",
        "/help",
        "/contact",
        "/status",
      ];

      // Admin routes that require admin role
      const adminRoutes = ["/admin"];

      const isPublicRoute = publicRoutes.some(
        (route) =>
          pathname === route ||
          pathname.startsWith(`${route}?`) ||
          (route !== "/" && pathname.startsWith(`${route}/`))
      );

      const isAdminRoute = adminRoutes.some(
        (route) => pathname === route || pathname.startsWith(`${route}/`)
      );

      // Public API routes
      const isPublicApiRoute = pathname.startsWith("/api/auth");

      /**
       * The article-task embed, which runs on somebody else's website.
       *
       * These were being redirected to /login, so the whole feature had never
       * worked anywhere except the admin's own machine — middleware does not
       * run under `next dev` on Next 16, which is exactly why local testing
       * looked fine while every real site got a 307 and no script at all.
       *
       * A session cannot authenticate these anyway. The script tag and its
       * fetches are cross-site requests from a third-party article, so the
       * SameSite=Lax session cookie is not sent — even for a reader who is
       * signed in here. That is why nothing worked on a phone either.
       *
       * They are not unprotected: each of the three APIs verifies the signed
       * `eg` token, which is bound to one submission, one task and one user.
       * `start` is deliberately NOT in this list — it mints that token and
       * must keep requiring a real session.
       */
      const isArticleEmbedRoute =
        pathname.startsWith("/embed/") ||
        /^\/api\/article-tasks\/[^/]+\/(embed-config|popup-progress|generate-key)$/.test(
          pathname
        );

      // Allow public routes and API routes
      if (isPublicRoute || isPublicApiRoute || isArticleEmbedRoute) {
        return allow();
      }

      // Require authentication for protected routes
      if (!isLoggedIn) {
        return false;
      }

      // Check admin role for admin routes
      if (isAdminRoute) {
        const userRole = auth?.user?.role as string;
        const isAdminUser = ADMIN_ROLES.includes(userRole as typeof ADMIN_ROLES[number]);
        if (!isAdminUser) {
          return Response.redirect(new URL("/social", nextUrl));
        }
      }

      // ── First-login handle picker ──────────────────────────────────────────
      // Google users never see the register form, so they've never chosen a
      // @handle — they get a generated one like `johndoe418923` and are never
      // told. Send them through /welcome once.
      //
      // The check reads a JWT claim, not the database: this runs on Edge (no
      // Prisma) and on every navigation. Doing it in the (main) layout instead
      // looked cheaper — it already queries the user — but that read is
      // Accelerate-cached for 10s, so right after the user picks a handle
      // /welcome would read fresh and bounce to /social while /social read
      // stale and bounced back. A ten-second redirect loop.
      const needsOnboarding = auth?.user?.needsOnboarding === true;
      const onboardingBypass =
        // Set by the onboarding action — the belt to unstable_update's braces,
        // in case that beta API silently no-ops and the claim stays stale.
        request.cookies.get(ONBOARDED_COOKIE)?.value === "1" ||
        pathname === ONBOARDING_PATH ||
        pathname.startsWith("/api/") ||
        isAdminRoute ||
        // Never hijack a Server Action POST — including the one that finishes
        // onboarding.
        !!request.headers.get("next-action");

      if (needsOnboarding && !onboardingBypass) {
        return Response.redirect(new URL(ONBOARDING_PATH, nextUrl));
      }
      if (pathname === ONBOARDING_PATH && !needsOnboarding) {
        return Response.redirect(new URL("/social", nextUrl));
      }

      return allow();
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }

      // Handle session update
      if (trigger === "update" && session) {
        token.name = session.name;
        token.image = session.image;
      }

      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};
