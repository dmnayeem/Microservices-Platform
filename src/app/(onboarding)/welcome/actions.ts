"use server";

import { cookies } from "next/headers";
import { auth, updateSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkUsername } from "@/lib/username";
import { ONBOARDED_COOKIE } from "@/lib/auth/config";

/**
 * Finish the first-login handle picker.
 *
 * A Server Action rather than a route handler for two specific reasons: it is
 * the documented place you're allowed to call `cookies().set()` (Server
 * Components can't), and `unstable_update` needs a server context to re-sign
 * the JWT.
 */
export type FinishResult =
  | { ok: true }
  | { ok: false; error: "AUTH" | "INVALID" | "RESERVED" | "TAKEN" };

export async function finishOnboarding(
  username?: string
): Promise<FinishResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "AUTH" };

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  const wanted = (username ?? "").trim().replace(/^@+/, "");
  const changing =
    !!wanted && wanted.toLowerCase() !== (current?.username ?? "").toLowerCase();

  if (changing) {
    const problem = checkUsername(wanted);
    if (problem === "INVALID") return { ok: false, error: "INVALID" };
    if (problem === "RESERVED") return { ok: false, error: "RESERVED" };

    const taken = await prisma.user.findFirst({
      where: {
        username: { equals: wanted, mode: "insensitive" },
        NOT: { id: userId },
      },
      select: { id: true },
    });
    if (taken) return { ok: false, error: "TAKEN" };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(changing ? { username: wanted } : {}),
        onboardedAt: new Date(),
      },
    });
  } catch (err) {
    // Lost a race for the handle. Don't stamp onboardedAt — let them retry.
    if ((err as { code?: string })?.code === "P2002") {
      return { ok: false, error: "TAKEN" };
    }
    throw err;
  }

  await markOnboarded();
  return { ok: true };
}

/** Skip — keep the generated handle, just stop asking. */
export async function skipOnboarding(): Promise<FinishResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "AUTH" };
  await prisma.user.update({
    where: { id: userId },
    data: { onboardedAt: new Date() },
  });
  await markOnboarded();
  return { ok: true };
}

/**
 * Two independent ways to stop the middleware redirecting, so a user can never
 * be trapped in a loop: re-sign the JWT claim, and set a cookie the middleware
 * honours unconditionally in case `unstable_update` (a beta API) no-ops.
 */
async function markOnboarded(): Promise<void> {
  try {
    (await cookies()).set(ONBOARDED_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    /* not in a mutable cookie context */
  }
  try {
    await updateSession({ user: { onboarded: true } });
  } catch {
    /* the cookie above already covers us */
  }
}
