import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { NextResponse } from "next/server";
import { z } from "zod";

// Admin roles that can access /admin routes
// Must match ADMIN_ROLE_STRINGS in @/lib/rbac
const ADMIN_ROLES = [
  "SUPER_ADMIN",
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

      // Pass-through response that forwards the current pathname to server
      // components (the admin layout reads `x-pathname` for its central guard).
      const allow = () => {
        const headers = new Headers(request.headers);
        headers.set("x-pathname", pathname);
        return NextResponse.next({ request: { headers } });
      };

      // Public routes that don't require authentication
      const publicRoutes = [
        "/",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
        "/privacy",
        "/terms",
        "/refund",
        "/offer",
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

      // Allow public routes and API routes
      if (isPublicRoute || isPublicApiRoute) {
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
