import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { evaluateLogin } from "@/lib/auth/services";
import {
  createGoogleAccount,
  linkGoogleAccount,
  GOOGLE_USER_SELECT,
  type GoogleDbUser,
} from "@/lib/auth/google-provisioning";
import { authConfig } from "./config";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Build providers with actual authorize function that uses database
const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
      otp: { label: "2FA Code", type: "text" },
    },
    async authorize(credentials) {
      const validatedFields = loginSchema.safeParse(credentials);

      if (!validatedFields.success) {
        return null;
      }

      const { email, password } = validatedFields.data;
      const otp =
        typeof credentials?.otp === "string" ? credentials.otp : undefined;

      // Shared evaluator is the single source of truth (also used by the
      // /api/auth/login-check pre-check). Auth.js v5 masks thrown errors as a
      // generic "CredentialsSignin", so we just return null here and let the
      // login page surface the precise reason from the pre-check.
      const result = await evaluateLogin(email, password, otp);
      if (!result.ok) {
        return null;
      }
      return result.user;
    },
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

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
  // Lets a Server Action re-sign the JWT after onboarding so the `onb` claim
  // stops being stale without forcing a re-login. There is no SessionProvider
  // in this app, so the client-side `useSession().update()` route isn't
  // available.
  unstable_update: updateSession,
} = NextAuth({
  // JWT-only auth (no database sessions). We deliberately don't use an adapter:
  // the User model uses `avatar` (not `image`) and requires a unique
  // `referralCode`, so we find-or-create the app user ourselves in `jwt`.
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // Block banned/suspended users from signing in with Google.
      if (account?.provider === "google" && user?.email) {
        const existing = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
          select: { status: true },
        });
        if (
          existing &&
          (existing.status === "BANNED" || existing.status === "SUSPENDED")
        ) {
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, account, trigger, session }) {
      // First sign-in with Google: find the app user by email, or create one
      // (with a unique referralCode) so the rest of the app has a real Prisma
      // user. An existing email/password account with the same email is reused,
      // which links the Google login to it.
      if (account?.provider === "google" && user?.email) {
        const email = user.email.toLowerCase();
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: GOOGLE_USER_SELECT,
        });
        // Either branch returns a fully provisioned, repaired account.
        const resolved = dbUser
          ? await linkGoogleAccount(dbUser as GoogleDbUser, user)
          : await createGoogleAccount(email, user);
        token.id = resolved.id;
        token.role = resolved.role;
        token.name = resolved.name;
        token.picture = resolved.avatar;
        token.onb = resolved.onboardedAt !== null;
      } else if (user) {
        // Credentials sign-in: `user` is already the DB user from authorize().
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.onb = (user as { onboarded?: boolean }).onboarded === true;
      }

      if (trigger === "update" && session) {
        const s = session as { name?: string; image?: string };
        if (s.name) token.name = s.name;
        if (s.image) token.picture = s.image;
      }

      return token;
    },
  },
  events: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return;
      await prisma.user
        .updateMany({ where: { email }, data: { lastLoginAt: new Date() } })
        .catch(() => {});
    },
  },
});

/**
 * Resilient wrapper around `auth()`. A stale/corrupt session cookie makes
 * Auth.js throw `JWTSessionError: no matching decryption secret` (e.g. after a
 * secret rotation or an @auth/core version bump). Treat that as "signed out"
 * instead of crashing the page — the next successful sign-in overwrites the
 * bad cookie and self-heals.
 */
export async function getSession() {
  try {
    return await auth();
  } catch (error) {
    console.warn("[auth] session decode failed; treating as signed out:", error);
    return null;
  }
}
