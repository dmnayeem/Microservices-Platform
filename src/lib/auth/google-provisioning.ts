import { cookies, headers } from "next/headers";
import { NotificationType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { defaultPackage } from "@/lib/packages";
import {
  provisionUser,
  completeSignupRewards,
  generateUniqueUsername,
} from "@/lib/auth/services";
import { REFERRAL_COOKIE } from "./config";

/**
 * Google sign-in: creating the account, and repairing one that predates this
 * code.
 *
 * Kept out of `auth/index.ts` so that file stays wiring. The two functions here
 * are the Google-side mirror of `registerUser` + `verifyEmail`: Google users
 * never reach `verifyEmail()`, so anything that only lives there — the welcome
 * bonus above all — has to be invoked from here too.
 */

/** The columns both branches need. Deliberately narrow: the old code selected
 *  all ~140 User columns (including `twoFactorSecret`) on every Google login. */
export const GOOGLE_USER_SELECT = {
  id: true,
  role: true,
  name: true,
  avatar: true,
  email: true,
  status: true,
  username: true,
  packageId: true,
  emailVerified: true,
  password: true,
  twoFactorEnabled: true,
  referredById: true,
  onboardedAt: true,
  googleLinkedAt: true,
} as const;

export type GoogleDbUser = {
  id: string;
  role: string;
  name: string | null;
  avatar: string | null;
  email: string;
  status: string;
  username: string | null;
  packageId: string | null;
  emailVerified: Date | null;
  password: string | null;
  twoFactorEnabled: boolean;
  referredById: string | null;
  onboardedAt: Date | null;
  googleLinkedAt: Date | null;
};

/** Result the jwt callback needs to build the token. */
export interface ResolvedGoogleUser {
  id: string;
  role: string;
  name: string | null;
  avatar: string | null;
  onboardedAt: Date | null;
}

async function readRefCookie(): Promise<string | null> {
  try {
    return (await cookies()).get(REFERRAL_COOKIE)?.value ?? null;
  } catch {
    // No cookie context — sign-in still proceeds, just unattributed.
    return null;
  }
}

async function readClientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const ip =
      h.get("x-vercel-forwarded-for") ||
      h.get("x-real-ip") ||
      // Rightmost hop: the leftmost XFF entry is client-controlled.
      h.get("x-forwarded-for")?.split(",").pop()?.trim() ||
      null;
    return ip && ip !== "unknown" ? ip : null;
  } catch {
    return null;
  }
}

/**
 * First time we've seen this Google identity and no account exists for the
 * address. Goes through the same `provisionUser` as email signup.
 */
export async function createGoogleAccount(
  email: string,
  googleUser: { name?: string | null; image?: unknown }
): Promise<ResolvedGoogleUser> {
  const [refCode, signupIp] = await Promise.all([
    readRefCookie(),
    readClientIp(),
  ]);

  const created = await provisionUser({
    email,
    name: googleUser.name ?? null,
    avatar: typeof googleUser.image === "string" ? googleUser.image : null,
    passwordHash: null,
    emailVerified: new Date(), // Google has verified the address
    status: "ACTIVE",
    referralCode: refCode,
    signupIp,
    // They never saw the register form, so they've never chosen a handle —
    // send them to the picker on first navigation.
    onboarded: false,
    source: "google",
  });

  await completeSignupRewards(created.id, {
    referredById: created.referredById,
  });

  return {
    id: created.id,
    role: created.role,
    name: created.name,
    avatar: created.avatar,
    onboardedAt: created.onboardedAt,
  };
}

/**
 * An account already exists for this address. Adopt it — and, the first time,
 * repair anything the pre-`provisionUser` code left broken and revoke a stale
 * password.
 */
export async function linkGoogleAccount(
  dbUser: GoogleDbUser,
  googleUser: { name?: string | null; image?: unknown }
): Promise<ResolvedGoogleUser> {
  // The hot path. Every one of these five is set by the repair below, so it can
  // only be false once per account — after that a Google login costs nothing
  // beyond the lookup that had to happen anyway.
  const healthy =
    dbUser.googleLinkedAt !== null &&
    dbUser.status === "ACTIVE" &&
    dbUser.username !== null &&
    dbUser.emailVerified !== null &&
    dbUser.packageId !== null;
  if (healthy) {
    return {
      id: dbUser.id,
      role: dbUser.role,
      name: dbUser.name,
      avatar: dbUser.avatar,
      onboardedAt: dbUser.onboardedAt,
    };
  }

  const firstLink = dbUser.googleLinkedAt === null;
  const updateData: Record<string, unknown> = {};
  let passwordRevoked = false;

  /**
   * Account takeover, closed.
   *
   * Matching on email alone means whoever registered the address first owns the
   * row — and email verification is not required to log in
   * (`ui.require_email_verification` defaults to false). So an attacker could
   * register `victim@gmail.com` with their own password, never verify, and keep
   * working access after the real owner signed in with Google.
   *
   * Google proves control of the inbox. An unverified password holder has
   * proved nothing, so their credential (and any 2FA secret they planted, which
   * would be the stronger takeover) is revoked.
   *
   * Deliberately NOT done when `emailVerified` is already set: that can only
   * happen by clicking a link delivered to this same inbox, so it's the same
   * human, and clearing their password would lock out every legitimate user who
   * registered by email and later clicked "Continue with Google".
   */
  if (firstLink && dbUser.password !== null && dbUser.emailVerified === null) {
    updateData.password = null;
    updateData.twoFactorEnabled = false;
    updateData.twoFactorSecret = null;
    passwordRevoked = true;
  }

  // Repair — only ever fills what's missing; never overwrites real user data.
  if (!dbUser.emailVerified) updateData.emailVerified = new Date();
  // Only ever PENDING_VERIFICATION → ACTIVE. BANNED/SUSPENDED are rejected by
  // the signIn callback before we get here, but don't rely on that staying true.
  if (dbUser.status === "PENDING_VERIFICATION") updateData.status = "ACTIVE";
  if (!dbUser.username) {
    updateData.username = await generateUniqueUsername(
      dbUser.name || dbUser.email.split("@")[0]
    );
  }
  if (!dbUser.packageId) {
    updateData.packageId = (await defaultPackage())?.id ?? null;
  }
  if (!dbUser.avatar && typeof googleUser.image === "string") {
    updateData.avatar = googleUser.image;
  }
  if (!dbUser.name && googleUser.name) updateData.name = googleUser.name;
  if (firstLink) updateData.googleLinkedAt = new Date();

  // NOTE: `onboardedAt` is deliberately untouched. A brand-new Google user's
  // SECOND sign-in comes through this function, and stamping it here would
  // cancel their handle picker before they ever saw it.

  let updated;
  try {
    updated = await prisma.user.update({
      where: { id: dbUser.id },
      data: updateData,
      select: { id: true, role: true, name: true, avatar: true, onboardedAt: true },
    });
  } catch (err) {
    // A concurrent claim on the handle we just generated.
    if ((err as { code?: string })?.code === "P2002" && updateData.username) {
      updateData.username = await generateUniqueUsername(
        `${updateData.username}`
      );
      updated = await prisma.user.update({
        where: { id: dbUser.id },
        data: updateData,
        select: { id: true, role: true, name: true, avatar: true, onboardedAt: true },
      });
    } else {
      throw err;
    }
  }

  if (passwordRevoked) {
    await notifyUser({
      userId: dbUser.id,
      type: NotificationType.SYSTEM,
      title: "Your password was removed",
      message:
        "You signed in with Google, which proves you own this email address. " +
        "The password that was previously set on this account has been removed " +
        "for your safety. If this wasn't you, contact support immediately. To " +
        'use a password again, choose "Forgot password" on the login page.',
      link: "/settings",
    }).catch(() => {});
    void recordFraud(dbUser.id, "OAUTH_LINK_PASSWORD_REVOKED", "HIGH", {
      reason: "password existed on an unverified account",
    });
  }

  // The 2FA bypass is a known, accepted gap: TOTP is only checked on the
  // credentials path, so anyone who controls the Google account can sign in
  // without a second factor. Leave a trail for when that gets fixed.
  if (dbUser.twoFactorEnabled && !passwordRevoked) {
    void recordFraud(dbUser.id, "TWOFA_BYPASSED_VIA_OAUTH", "MEDIUM", {
      note: "Google sign-in does not enforce TOTP",
    });
  }

  if (firstLink) {
    await completeSignupRewards(dbUser.id, {
      referredById: dbUser.referredById,
    });
  }

  return updated;
}

async function recordFraud(
  userId: string,
  eventType: string,
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  details: Record<string, unknown>
): Promise<void> {
  try {
    const { recordFraudEvent } = await import("@/lib/fraud");
    await recordFraudEvent({ userId, eventType, severity, details });
  } catch {
    /* telemetry must never break sign-in */
  }
}
