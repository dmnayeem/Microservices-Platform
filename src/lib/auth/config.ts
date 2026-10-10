import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { isPublicCatalogPath } from "@/lib/public-catalog";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "@/lib/auth/google-env";

/**
 * Cookie that carries a `?ref=` referral code across an OAuth round trip.
 * Written by the middleware (see `allow()` below), read once when a Google
 * account is created in `src/lib/auth/index.ts`.
 */
export const REFERRAL_COOKIE = "eg_ref";

/** The first-login handle picker, and the cookie that says it's been done. */
export const ONBOARDING_PATH = "/welcome";
export const ONBOARDED_COOKIE = "eg_onb";

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
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  providers.unshift(
    Google({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
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
        // How to report abuse / copyright, with a public report form.
        "/abuse",
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
        // Public marketing pages that were missing here — logged-out
        // visitors and search engines were sent to /login.
        "/microtask",
        "/advertise",
        "/referral",
        "/pricing",
        // A shared post. The page itself decides what a logged-out reader
        // may see (lib/public-post.ts).
        "/post",
        // Home-screen icons, fetched by the browser without cookies.
        "/app-icon",
        "/unsubscribe", // email unsubscribe confirm page — signed token, no session
        // End page of a URL-shortener visit task. Apps often open links in the
        // phone's other browser, which isn't signed in; the page then shows a
        // one-time code (or asks to sign in, per task). Nothing pays here.
        "/v",
      ];

      // Admin routes that require admin role
      const adminRoutes = ["/admin"];

      const isPublicRoute =
        publicRoutes.some(
          (route) =>
            pathname === route ||
            pathname.startsWith(`${route}?`) ||
            (route !== "/" && pathname.startsWith(`${route}/`))
        ) ||
        // The public catalog: marketplace + course browse, category, brand and
        // detail pages. EXACT patterns (lib/public-catalog.ts), not prefixes —
        // a "/marketplace" prefix here would also open the cart, orders,
        // messages and create-listing. Buying, enrolling and messaging still
        // need a session: their pages and APIs are not on any public list.
        isPublicCatalogPath(pathname);

      const isAdminRoute = adminRoutes.some(
        (route) => pathname === route || pathname.startsWith(`${route}/`)
      );

      // API routes that are called WITHOUT a session by design. Only /api/auth
      // was let through, so each of these got a 307 to /login instead. Every
      // one does its own check (cron secret, provider signature, gateway
      // verification, key allowlist) or serves nothing private.
      const publicApiPrefixes = [
        "/api/auth/",
        "/api/cron/", // scheduler / Vercel cron — CRON_SECRET
        "/api/deposits/gateway/callback", // gateway return: cross-site POST, no Lax cookie
        "/api/analytics/pageview", // visitor traffic beacon (root layout)
        "/api/media/", // public post images for logged-out readers
        "/api/og/", // share images for link unfurlers (signed URLs only — lib/seo/og-image.ts)
        "/api/withdrawal-ticker/recent", // landing page ticker
        "/api/splash",
        "/api/config/antifraud",
        "/api/contact", // contact form on the marketing site
        "/api/abuse/report", // public abuse / copyright report form (/abuse) — honeypot + per-IP limit
        "/api/popups", // site popups, shown to visitors as well (targeting is server-side)
        "/api/geo/region", // does this visitor need the cookie banner (EU/UK/CH only)
        "/api/blog/", // blog read counter (public articles)
        "/api/health",
        "/api/cpa/postback", // CPA network S2S postback — HMAC sig / secret key
        "/api/affiliate/click", // affiliate link click from logged-out visitors — per-IP limited, writes only a click row + cookie
        "/api/security/csp-report", // browser CSP violation reports — sent without cookies
        "/api/email/unsubscribe", // RFC 8058 one-click unsubscribe (Gmail/Yahoo POST) — signed token
        "/api/ads/frame/", // ad frame document on AD_FRAME_ORIGIN — no session ever read; 404 on the app host
        "/api/spaces/panel", // ad serve for logged-out visitors on public pages — targeting/caps handle anon; in-memory limited
        "/api/spaces/media/", // ad creative proxy (images for logged-out visitors) — only proxies URLs stored on an Ad row
        "/api/spaces/m/", // ad viewability beacon (exact path) — signed single-use serve token, IVT-judged, in-memory limited
        "/api/spaces/go/", // ad click redirect (exact path) — destination is the ad's stored URL only; logged-out clicks are real
      ];
      const isPublicApiRoute =
        publicApiPrefixes.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p)) ||
        // Offerwall S2S postbacks — HMAC-signed by the provider.
        /^\/api\/offerwall\/[^/]+\/callback$/.test(pathname);

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
       *
       * `landing` and `visit-progress` are the search / social-post entry
       * modes: the worker arrives with no token at all, so `landing` judges
       * the arrival (it writes nothing) and hands back a signed visit token
       * that `visit-progress` verifies. Left off this list, both modes were
       * redirected to /login on every real site and the embed did nothing.
       */
      const isArticleEmbedRoute =
        pathname.startsWith("/embed/") ||
        /^\/api\/article-tasks\/[^/]+\/(embed-config|popup-progress|generate-key|landing|visit-progress)$/.test(
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

      // Admin routes: signed in is all the edge checks. The ROLE is decided
      // by the admin layout on the server, which reads it fresh from the
      // database. This runs on Edge with no database, so it could only read
      // the role baked into the token at sign-in — and it bounced a user who
      // had just been made a MANAGER back to the feed until they logged in
      // again. Every admin page and API still checks permissions itself.

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
