import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Is this account allowed to act right now?
 *
 * `User.status` was checked in exactly two places — `evaluateLogin()` and the
 * Google `signIn` callback — and **both run only at login**. The JWT lives 30
 * days and carries no status claim, and the ban route flips the column without
 * revoking anything. So a user banned for fraud mid-session kept working tasks,
 * kept being paid, and could still file a withdrawal. Nothing downstream cared:
 * not `/tasks/*​/start`, not `/submit`, not `/tasks/quiz`, not the board claim,
 * not `POST /api/withdrawals`, not `/daily-reward`, not post creation.
 *
 * `audienceWhere()` already treats `status: "ACTIVE"` as the house rule for who
 * counts as a real user; this is the same rule applied to who may *act*.
 *
 * The read is `cache`d per request, so guarding several things in one handler
 * costs one query.
 */

export type ActiveCheck =
  | { ok: true }
  | { ok: false; status: string; message: string; httpStatus: number };

/** Per-request memo of a user's status. */
const readStatus = cache(async (userId: string) => {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  return u?.status ?? null;
});

const MESSAGES: Record<string, string> = {
  BANNED:
    "Your account has been banned. Contact support if you believe this is a mistake.",
  SUSPENDED:
    "Your account is suspended, so this action isn't available. Contact support for details.",
  PENDING_VERIFICATION:
    "Please verify your email address before continuing.",
};

/**
 * Block banned and suspended accounts.
 *
 * `PENDING_VERIFICATION` is deliberately NOT blocked here: whether an unverified
 * account may earn depends on the `requireEmailVerification` admin toggle, and
 * turning it into a hard block would change who can earn today. Use
 * `requireVerifiedUser` on the paths where that is the intent.
 */
export async function requireActiveUser(userId: string): Promise<ActiveCheck> {
  const status = await readStatus(userId);
  if (status === null) {
    return {
      ok: false,
      status: "MISSING",
      message: "Account not found.",
      httpStatus: 401,
    };
  }
  if (status === "BANNED" || status === "SUSPENDED") {
    return {
      ok: false,
      status,
      message: MESSAGES[status],
      httpStatus: 403,
    };
  }
  return { ok: true };
}

/**
 * Stricter: also refuses an unverified account. For money leaving the platform,
 * where "we have never confirmed this person's email" is not good enough.
 */
export async function requireVerifiedUser(userId: string): Promise<ActiveCheck> {
  const base = await requireActiveUser(userId);
  if (!base.ok) return base;
  const status = await readStatus(userId);
  if (status !== "ACTIVE") {
    return {
      ok: false,
      status: status ?? "MISSING",
      message: MESSAGES[status ?? ""] ?? "Your account isn't active.",
      httpStatus: 403,
    };
  }
  return { ok: true };
}
