import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import { prisma } from "@/lib/prisma";
import { generateReferralCode } from "@/lib/utils";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email";
import { isValidUsername, slugifyUsername } from "@/lib/username";
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
  if (!user || !user.password) return { ok: false, reason: "INVALID" };
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
    },
  };
}

/**
 * Resolve a unique @username handle. Tries the slugified seed first, then the
 * seed with a few random numeric suffixes, checking them all in one query.
 * Every account gets a handle so profile links are always `/u/<username>`.
 */
async function generateUniqueUsername(seed: string): Promise<string> {
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

export async function registerUser({
  email,
  password,
  name,
  username,
  referralCode,
}: {
  email: string;
  password: string;
  name: string;
  username?: string;
  referralCode?: string;
}) {
  // Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    throw new Error("Email already registered");
  }

  // Username: use the one the user chose (validated + unique), else auto-generate
  // a unique handle from their name/email. Either way every account gets one.
  let finalUsername: string;
  const chosen = username?.trim();
  if (chosen) {
    if (!isValidUsername(chosen)) {
      throw new Error("INVALID_USERNAME");
    }
    const taken = await prisma.user.findFirst({
      where: { username: { equals: chosen, mode: "insensitive" } },
      select: { id: true },
    });
    if (taken) {
      throw new Error("USERNAME_TAKEN");
    }
    finalUsername = chosen;
  } else {
    finalUsername = await generateUniqueUsername(name || email.split("@")[0]);
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Find referrer if referral code provided
  let referredById: string | null = null;
  if (referralCode) {
    const referrer = await prisma.user.findUnique({
      where: { referralCode },
    });
    if (referrer) {
      referredById = referrer.id;
    }
  }

  // Generate unique referral code
  let newReferralCode = generateReferralCode();
  let codeExists = await prisma.user.findUnique({
    where: { referralCode: newReferralCode },
  });
  while (codeExists) {
    newReferralCode = generateReferralCode();
    codeExists = await prisma.user.findUnique({
      where: { referralCode: newReferralCode },
    });
  }

  // Explicitly put every new user on the free/default plan so they're visibly
  // "on Free" (not "no plan"). Best-effort: if no default resolves, packageId
  // stays null and the runtime fallback (getEffectivePackage) still covers it.
  const defaultPkgId = (await defaultPackage())?.id ?? null;

  // Create user. Guard the username unique constraint against the rare race
  // where the chosen handle is claimed between our check and this insert.
  let user;
  try {
    user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        username: finalUsername,
        referralCode: newReferralCode,
        referredById,
        status: "PENDING_VERIFICATION",
        packageId: defaultPkgId,
        packageExpiresAt: null,
      },
    });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      // Username (or referral code) collided under concurrency.
      if (chosen) throw new Error("USERNAME_TAKEN");
      finalUsername = await generateUniqueUsername(`${finalUsername}`);
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          name,
          username: finalUsername,
          referralCode: newReferralCode,
          referredById,
          status: "PENDING_VERIFICATION",
          packageId: defaultPkgId,
          packageExpiresAt: null,
        },
      });
    } else {
      throw err;
    }
  }

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

  // Update user
  const user = await prisma.user.update({
    where: { email: verificationToken.identifier },
    data: {
      emailVerified: new Date(),
      status: "ACTIVE",
    },
  });

  // Delete used token
  await prisma.verificationToken.delete({
    where: { token },
  });

  // Award welcome bonus if configured
  const welcomeBonus = parseInt(process.env.WELCOME_BONUS_POINTS || "0", 10);
  if (welcomeBonus > 0) {
    const pointsPerUsd = await getPointsPerUsd();
    const bonusUsd = pointsPerUsd > 0 ? welcomeBonus / pointsPerUsd : 0;
    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "BONUS",
        status: "COMPLETED",
        points: welcomeBonus,
        amount: bonusUsd,
        description: "Welcome bonus",
        // Once per user — (userId, reference) unique prevents a double award if
        // verification is ever replayed (token deletion above already guards it).
        reference: `welcome_${user.id}`,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        pointsBalance: { increment: welcomeBonus },
        totalEarnings: { increment: bonusUsd },
      },
    });
  }

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
