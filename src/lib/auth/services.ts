import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import { prisma } from "@/lib/prisma";
import { generateReferralCode } from "@/lib/utils";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email";
import {
  isValidUsername,
  isReservedUsername,
  slugifyUsername,
} from "@/lib/username";
import { getUiToggles } from "@/lib/ui-toggles-server";
import { defaultPackage } from "@/lib/packages";
import { getPointsPerUsd } from "@/lib/economy";
import { v4 as uuidv4 } from "uuid";

/**
 * Why a login attempt did or didn't pass. `INVALID` is intentionally generic
 * (wrong password OR unknown email) so we never reveal which accounts exist.
 */
export type LoginReason =
  | "INVALID"
  /**
   * The address exists but has no password — a Google-only account. This is a
   * mild user-enumeration oracle, accepted deliberately: Google's own consent
   * screen already reveals the same fact, `/api/auth/login-check` is throttled
   * to 10/min per IP, and the alternative is telling every Google user their
   * password is "invalid" when they never had one. Don't "fix" this back.
   */
  | "OAUTH_ONLY"
  | "EMAIL_NOT_VERIFIED"
  | "ACCOUNT_DISABLED"
  | "TWO_FACTOR_REQUIRED"
  | "INVALID_2FA";

export interface LoginUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string;
  /** False → the middleware sends them to the first-login handle picker. */
  onboarded: boolean;
}

export type LoginResult =
  | { ok: true; user: LoginUser }
  | { ok: false; reason: LoginReason };

/**
 * Single source of truth for credential login. Both the NextAuth `authorize`
 * callback and the `/api/auth/login-check` pre-check call this, so the login
 * page can show the REAL reason (Auth.js v5 hides thrown errors from the
 * client, masking everything as a generic "CredentialsSignin"). The email-
 * verification gate is admin-toggleable via `requireEmailVerification`.
 */
export async function evaluateLogin(
  email: string,
  password: string,
  otp?: string
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  // Wrong password or unknown email → same generic answer (no user enumeration).
  if (!user) return { ok: false, reason: "INVALID" };
  // No password at all means an OAuth-only account. Saying so is far better than
  // "invalid password" for a credential the user never set — see OAUTH_ONLY.
  if (!user.password) return { ok: false, reason: "OAUTH_ONLY" };
  const passwordsMatch = await bcrypt.compare(password, user.password);
  if (!passwordsMatch) return { ok: false, reason: "INVALID" };

  const { requireEmailVerification } = await getUiToggles();
  if (requireEmailVerification && !user.emailVerified) {
    return { ok: false, reason: "EMAIL_NOT_VERIFIED" };
  }

  if (user.status === "BANNED" || user.status === "SUSPENDED") {
    return { ok: false, reason: "ACCOUNT_DISABLED" };
  }

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const code = typeof otp === "string" ? otp.trim() : "";
    if (!code) return { ok: false, reason: "TWO_FACTOR_REQUIRED" };
    const valid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: code,
      window: 2,
    });
    if (!valid) return { ok: false, reason: "INVALID_2FA" };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.avatar,
      role: user.role,
      onboarded: user.onboardedAt !== null,
    },
  };
}

/**
 * Resolve a unique @username handle. Tries the slugified seed first, then the
 * seed with a few random numeric suffixes, checking them all in one query.
 * Every account gets a handle so profile links are always `/u/<username>`.
 */
export async function generateUniqueUsername(seed: string): Promise<string> {
  const base = slugifyUsername(seed) || "user";
  const candidates = new Set<string>();
  if (base.length >= 3) candidates.add(base);
  while (candidates.size < 12) {
    const suffix = Math.floor(100 + Math.random() * 900000).toString();
    candidates.add((base + suffix).slice(0, 30));
  }
  const list = [...candidates];

  const taken = await prisma.user.findMany({
    where: { username: { in: list, mode: "insensitive" } },
    select: { username: true },
  });
  const takenLc = new Set(taken.map((t) => (t.username ?? "").toLowerCase()));

  const free = list.find((c) => c.length >= 3 && !takenLc.has(c.toLowerCase()));
  if (free) return free;

  // Astronomically unlikely fallback — add timestamp entropy.
  return (base.slice(0, 20) + Date.now().toString().slice(-9)).slice(0, 30);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared provisioning — the ONE way an account is created and rewarded.
//
// Email sign-up and Google sign-in used to create users in two entirely
// separate places, and they drifted: the Google path shipped without a default
// package, without referral attribution, and — because it never reaches
// `verifyEmail()` — without the welcome bonus. Anything that only lives in one
// of these two functions is a bug waiting to be rediscovered.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProvisionUserInput {
  email: string;
  name?: string | null;
  /** A handle the user explicitly chose. Omit/null → generate one. */
  username?: string | null;
  /** Already bcrypt-hashed. Null for OAuth-only accounts. */
  passwordHash?: string | null;
  avatar?: string | null;
  emailVerified?: Date | null;
  status: "ACTIVE" | "PENDING_VERIFICATION";
  /** The referrer's code, from `?ref=` or the `eg_ref` cookie. */
  referralCode?: string | null;
  signupIp?: string | null;
  /** false → the user is sent to the first-login handle picker. */
  onboarded: boolean;
  source: "credentials" | "google" | "admin";
}

/**
 * Create a user. Guarantees, for every caller: lowercased email, a **non-null**
 * unique handle, a unique referral code, the default package, resolved referral
 * attribution, and the onboarding marker.
 *
 * Throws `EMAIL_TAKEN` | `INVALID_USERNAME` | `USERNAME_TAKEN` |
 * `USERNAME_RESERVED` | `PROVISION_FAILED`.
 */
export async function provisionUser(input: ProvisionUserInput) {
  const email = input.email.toLowerCase();

  const clash = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (clash) throw new Error("EMAIL_TAKEN");

  // Resolve the handle. Never null — a handle-less account has no /u/ link,
  // can't be @-mentioned and doesn't appear in search.
  let finalUsername: string;
  const chosen = input.username?.trim();
  if (chosen) {
    if (isReservedUsername(chosen)) throw new Error("USERNAME_RESERVED");
    if (!isValidUsername(chosen)) throw new Error("INVALID_USERNAME");
    const taken = await prisma.user.findFirst({
      where: { username: { equals: chosen, mode: "insensitive" } },
      select: { id: true },
    });
    if (taken) throw new Error("USERNAME_TAKEN");
    finalUsername = chosen;
  } else {
    finalUsername = await generateUniqueUsername(
      input.name || email.split("@")[0]
    );
  }

  // Referral attribution, with the self-referral guard (opening your own link
  // and signing up with it). `registerUser` never had this guard.
  let referredById: string | null = null;
  const code = input.referralCode?.trim();
  if (code) {
    const referrer = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true, email: true },
    });
    if (referrer && referrer.email?.toLowerCase() !== email) {
      referredById = referrer.id;
    }
  }

  const defaultPkgId = (await defaultPackage())?.id ?? null;

  // Let the unique indexes be the arbiter instead of pre-checking the referral
  // code in a loop: fewer round-trips, and it can't "give up and use a value it
  // already knows is taken" the way the old loops could.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await prisma.user.create({
        data: {
          email,
          password: input.passwordHash ?? null,
          name: input.name ?? null,
          username: finalUsername,
          avatar: input.avatar ?? null,
          emailVerified: input.emailVerified ?? null,
          status: input.status,
          referralCode: generateReferralCode(),
          referredById,
          packageId: defaultPkgId,
          packageExpiresAt: null,
          signupIp: input.signupIp ?? null,
          onboardedAt: input.onboarded ? new Date() : null,
          googleLinkedAt: input.source === "google" ? new Date() : null,
        },
      });
    } catch (err) {
      if ((err as { code?: string })?.code !== "P2002") throw err;
      const target = String(
        (err as { meta?: { target?: unknown } })?.meta?.target ?? ""
      );
      if (target.includes("email")) throw new Error("EMAIL_TAKEN");
      if (target.includes("username")) {
        // A handle the USER picked must not be silently swapped for another.
        if (chosen) throw new Error("USERNAME_TAKEN");
        finalUsername = await generateUniqueUsername(finalUsername);
        continue;
      }
      // referralCode collided — the next iteration generates a fresh one.
    }
  }
  throw new Error("PROVISION_FAILED");
}

/**
 * Everything a real account is owed exactly once: the welcome bonus, the
 * referral signup bonus, and the referrer's event progress.
 *
 * Idempotent (the ledger `reference` is unique per user) and best-effort — it
 * must never throw, because it runs inside both email verification and the
 * Google sign-in callback, and neither may fail because of a bonus.
 */
export async function completeSignupRewards(
  userId: string,
  opts?: { referredById?: string | null }
): Promise<void> {
  await awardWelcomeBonus(userId);

  try {
    const { awardReferralSignupBonus } = await import("@/lib/referral-bonus");
    await awardReferralSignupBonus(userId);
  } catch {
    /* never block on the bonus */
  }

  // Referral event progress goes to the REFERRER, not the new user.
  let referrerId = opts?.referredById ?? null;
  if (referrerId === undefined) referrerId = null;
  if (!referrerId) {
    referrerId =
      (
        await prisma.user
          .findUnique({ where: { id: userId }, select: { referredById: true } })
          .catch(() => null)
      )?.referredById ?? null;
  }
  if (referrerId && referrerId !== userId) {
    try {
      const { recordUserAction } = await import("@/lib/goal-progress");
      await recordUserAction({
        userId: referrerId,
        action: "referral_signup",
        targetId: userId,
      });
      // The referrer's `referrals_made` count just went up.
      const { runAchievementCheck } = await import("@/lib/achievements");
      await runAchievementCheck(referrerId);
    } catch {
      /* never block on event tracking */
    }
  }
}

/**
 * The signup welcome bonus. `WELCOME_BONUS_POINTS` is read here and nowhere
 * else — it used to live inline in `verifyEmail()`, which is exactly why no
 * Google user ever received it.
 *
 * Routed through `creditPoints` so the balance, `totalEarnings` and the ledger
 * row move together in one transaction. The old inline version did two separate
 * writes, so a failure between them left the balance and the ledger disagreeing.
 */
async function awardWelcomeBonus(userId: string): Promise<void> {
  const points = parseInt(process.env.WELCOME_BONUS_POINTS || "0", 10);
  if (!Number.isFinite(points) || points <= 0) return;
  try {
    const pointsPerUsd = await getPointsPerUsd();
    const { creditPoints } = await import("@/lib/ledger");
    const { TransactionType } = await import("@/generated/prisma/client");
    await prisma.$transaction(async (tx) => {
      await creditPoints(tx, {
        userId,
        points,
        type: TransactionType.BONUS,
        description: "Welcome bonus",
        // Unique per user → awarding twice is impossible, which is what makes
        // the backfill safe to re-run.
        reference: `welcome_${userId}`,
        metadata: { source: "signup" },
        pointsPerUsd,
      });
    });
  } catch (err) {
    const { isDuplicateLedgerError } = await import("@/lib/idempotency");
    if (!isDuplicateLedgerError(err)) {
      console.error("[welcome-bonus] failed for", userId, err);
    }
  }
}

export async function registerUser({
  email,
  password,
  name,
  username,
  referralCode,
  signupIp,
}: {
  email: string;
  password: string;
  name: string;
  username?: string;
  referralCode?: string;
  /** Caller-supplied client IP, for the per-IP signup cap (see lib/fraud.ts). */
  signupIp?: string | null;
}) {
  // Everything about creating the row — handle, referral code, referral
  // attribution, default package — lives in provisionUser so the Google path
  // gets the identical treatment. `signupIp` is stamped by the API wrapper.
  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await provisionUser({
    email,
    name,
    username,
    passwordHash: hashedPassword,
    status: "PENDING_VERIFICATION",
    referralCode,
    signupIp,
    // Email users pick their handle on the register form, so they never need
    // the first-login picker.
    onboarded: true,
    source: "credentials",
  });

  // Create verification token
  const verificationToken = uuidv4();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.verificationToken.create({
    data: {
      identifier: email.toLowerCase(),
      token: verificationToken,
      expires,
      type: "EMAIL",
    },
  });

  // Send verification email (skip if SMTP not configured)
  let emailSent = false;
  try {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      await sendVerificationEmail(email, verificationToken, name);
      emailSent = true;
    } else {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      console.warn(
        `[auth] SMTP not configured — verification link: ${appUrl}/verify-email?token=${verificationToken}`
      );
    }
  } catch (error) {
    console.error("Failed to send verification email:", error);
    // Don't fail registration if email fails
  }

  return { user, verificationToken, emailSent };
}

export async function verifyEmail(token: string) {
  const verificationToken = await prisma.verificationToken.findUnique({
    where: { token },
  });

  if (!verificationToken) {
    throw new Error("Invalid verification token");
  }

  if (verificationToken.expires < new Date()) {
    await prisma.verificationToken.delete({
      where: { token },
    });
    throw new Error("Verification token has expired");
  }

  // Mark verified — and only flip to ACTIVE from PENDING_VERIFICATION.
  //
  // This used to set `status: "ACTIVE"` unconditionally, so a user banned or
  // suspended while still holding a live (24h) verification link could un-ban
  // themselves by clicking it — and `completeSignupRewards()` fired for them
  // straight afterwards.
  const existing = await prisma.user.findUnique({
    where: { email: verificationToken.identifier },
    select: { id: true, status: true },
  });
  if (!existing) throw new Error("Invalid verification token");

  const user = await prisma.user.update({
    where: { email: verificationToken.identifier },
    data: {
      emailVerified: new Date(),
      ...(existing.status === "PENDING_VERIFICATION"
        ? { status: "ACTIVE" as const }
        : {}),
    },
  });

  // Delete used token
  await prisma.verificationToken.delete({
    where: { token },
  });

  // Welcome bonus + referral bonus + referrer event progress. Shared with the
  // Google sign-in path, which never reaches this function — which is exactly
  // why no Google user had ever received the welcome bonus.
  await completeSignupRewards(user.id, { referredById: user.referredById });

  return user;
}

export async function resendVerificationEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.emailVerified) {
    throw new Error("Email already verified");
  }

  // Delete existing tokens
  await prisma.verificationToken.deleteMany({
    where: { identifier: email.toLowerCase(), type: "EMAIL" },
  });

  // Create new token
  const verificationToken = uuidv4();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.verificationToken.create({
    data: {
      identifier: email.toLowerCase(),
      token: verificationToken,
      expires,
      type: "EMAIL",
    },
  });

  // Send verification email (skip if SMTP not configured)
  let emailSent = false;
  try {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      await sendVerificationEmail(email, verificationToken, user.name || "User");
      emailSent = true;
    } else {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      console.warn(
        `[auth] SMTP not configured — verification link: ${appUrl}/verify-email?token=${verificationToken}`
      );
    }
  } catch (error) {
    console.error("Failed to send verification email:", error);
  }

  return { success: true, verificationToken, emailSent };
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    // Don't reveal if user exists
    return { success: true };
  }

  // Delete existing reset tokens
  await prisma.verificationToken.deleteMany({
    where: { identifier: email.toLowerCase(), type: "PASSWORD_RESET" },
  });

  // Create reset token
  const resetToken = uuidv4();
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.verificationToken.create({
    data: {
      identifier: email.toLowerCase(),
      token: resetToken,
      expires,
      type: "PASSWORD_RESET",
    },
  });

  // Send password reset email (skip if SMTP not configured)
  try {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      await sendPasswordResetEmail(email, resetToken, user.name || "User");
    } else {
      console.warn("SMTP not configured - skipping password reset email");
    }
  } catch (error) {
    console.error("Failed to send password reset email:", error);
  }

  return { success: true };
}

export async function resetPassword(token: string, newPassword: string) {
  const resetToken = await prisma.verificationToken.findFirst({
    where: { token, type: "PASSWORD_RESET" },
  });

  if (!resetToken) {
    throw new Error("Invalid reset token");
  }

  if (resetToken.expires < new Date()) {
    await prisma.verificationToken.delete({
      where: { token },
    });
    throw new Error("Reset token has expired");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { email: resetToken.identifier },
    data: { password: hashedPassword },
  });

  await prisma.verificationToken.delete({
    where: { token },
  });

  return { success: true };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.password) {
    throw new Error("User not found");
  }

  const passwordsMatch = await bcrypt.compare(currentPassword, user.password);

  if (!passwordsMatch) {
    throw new Error("Current password is incorrect");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  return { success: true };
}
