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
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "@/lib/auth/google-env";

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
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  providers.unshift(
    Google({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
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
  /**
   * Downgrade the one error that is not an error.
   *
   * A browser holding a session cookie encrypted with a previous
   * `NEXTAUTH_SECRET` — after a rotation, or an @auth/core bump that changes the
   * encryption — makes Auth.js throw `JWTSessionError: no matching decryption
   * secret`. `getSession()` below already catches it and treats the visitor as
   * signed out, which is the correct outcome. But Auth.js logs through its OWN
   * logger before throwing, so three red Console Errors appeared on every page
   * load anyway, for a condition the app handles and that clears itself at the
   * next sign-in.
   *
   * Only that one case is downgraded; every other auth error still logs loudly.
   */
  logger: {
    error(err: Error) {
      const cause = (err as { cause?: unknown })?.cause;
      const text = `${err?.name ?? ""} ${err?.message ?? ""} ${
        typeof cause === "string" ? cause : JSON.stringify(cause ?? "")
      }`;
      if (
        err?.name === "JWTSessionError" ||
        /no matching decryption secret/i.test(text)
      ) {
        console.warn(
          "[auth] stale session cookie (encrypted with an older secret) — treating as signed out; it clears at the next sign-in"
        );
        return;
      }
      console.error(err);
    },
  },
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
        // One account per device — same rule as the email login.
        if (existing) {
          const full = await prisma.user.findUnique({
            where: { email: user.email.toLowerCase() },
            select: { id: true, email: true, role: true },
          });
          const { deviceLoginBlocked } = await import("@/lib/device-login");
          if (full && (await deviceLoginBlocked(full))) return "/login?error=DeviceInUse";
        }
        // A NEW account through Google meets the same device / IP rules as
        // the email form. Google sign-up used to skip them entirely.
        if (!existing) {
          const { readDevice, checkSignup } = await import("@/lib/device");
          const verdict = await checkSignup(await readDevice(), user.email.toLowerCase());
          if (!verdict.ok) return "/login?error=AccountLimit";
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

      // `user` is present only at sign-in (credentials, Google, a fresh
      // registration): that moment is what the splash screen keys on.
      if (user) token.lat = Date.now();

      if (trigger === "update" && session) {
        // Client `update({ name })` sends it flat; the server-side
        // `updateSession({ user: { name } })` sends it under `user`.
        const s = session as { name?: string; image?: string; user?: { name?: string } };
        const newName = s.user?.name ?? s.name;
        if (newName) {
          token.name = newName;
          // The database read below is up to ~30s stale; for a minute the name
          // the member just saved wins over it.
          token.nameAt = Date.now();
        }
        if (s.image) token.picture = s.image;
      }

      // Keep the role and the name current. Both were written into the token
      // at sign-in and never again, and the token lives 30 days — so a user a
      // super admin promoted to MANAGER kept a USER token, and a member who
      // renamed themselves kept seeing the old name in the header, sidebar
      // and composer until they logged out and in. Both are re-read from the
      // database (cached at most ~30s) in the one query the role already made.
      if (!user && typeof token.id === "string") {
        const fresh = await currentIdentity(token.id);
        if (fresh) {
          token.role = fresh.role;
          const justSaved = typeof token.nameAt === "number" && Date.now() - token.nameAt < 60_000;
          if (!justSaved && fresh.name) token.name = fresh.name;
        }
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

type Identity = { role: string; name: string | null };
const identityMemo = new Map<string, Identity & { at: number }>();
/**
 * The user's role and name as the database has them now, at most ~30s stale.
 *
 * Two layers, 15s each, so the worst case stays the 30s it always was: the
 * per-instance memo, and Accelerate's edge cache (ttl 15, no swr) shared by
 * every instance. The memo alone missed on almost every request on Vercel,
 * where requests land on fresh instances — a ~280ms read on every page.
 * Permissions and display only; no money path reads this. The avatar is not
 * here: pages read it from the database themselves, and a long URL would
 * bloat the session cookie.
 */
async function currentIdentity(userId: string): Promise<Identity | null> {
  const hit = identityMemo.get(userId);
  if (hit && Date.now() - hit.at < 15_000) return hit;
  const u = await prisma.user
    .findUnique({
      where: { id: userId },
      select: { role: true, name: true },
      cacheStrategy: { ttl: 15 },
    })
    .catch(() => null);
  if (!u) return null;
  if (identityMemo.size > 5_000) identityMemo.clear();
  identityMemo.set(userId, { role: u.role, name: u.name, at: Date.now() });
  return u;
}

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
