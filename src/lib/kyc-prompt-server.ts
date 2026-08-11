import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { NotificationType } from "@/generated/prisma";
import { isProfileComplete, type RequiredSnapshot } from "@/lib/profile-completion";

export interface KycPromptState {
  /** Show the "verify your identity" prompt banner. */
  show: boolean;
  kycStatus: string;
}

/**
 * Decide whether to nudge a user to complete KYC — only once their core profile
 * is complete and KYC still needs action (NOT_SUBMITTED / REJECTED). Fires a
 * one-time bell notification (atomic claim on `kycPromptedAt`). Idempotent, so
 * it's safe to call from multiple pages.
 */
export async function getKycPromptState(
  userId: string
): Promise<KycPromptState> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        avatar: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        country: true,
        phone: true,
        kycStatus: true,
        kycPromptedAt: true,
      },
    });
    if (!user) return { show: false, kycStatus: "NOT_SUBMITTED" };

    const kycStatus = user.kycStatus as string;
    const snap: RequiredSnapshot = user;
    const complete = isProfileComplete(snap);
    const needsKyc = kycStatus === "NOT_SUBMITTED" || kycStatus === "REJECTED";
    const show = complete && needsKyc;

    // One-time bell notification when the profile first becomes complete.
    // Best-effort: a write blip here must NOT crash the page (writes aren't
    // retried) — it just retries on the next navigation.
    if (show && user.kycPromptedAt == null) {
      try {
        const claimed = await prisma.user.updateMany({
          where: { id: userId, kycPromptedAt: null },
          data: { kycPromptedAt: new Date() },
        });
        if (claimed.count === 1) {
          await notifyUser({
            userId,
            type: NotificationType.WALLET,
            title: "Verify your identity to withdraw",
            message:
              "Your profile is complete — verify your identity (KYC) to unlock withdrawals.",
            link: "/kyc",
          });
        }
      } catch {
        /* best-effort — retried next navigation */
      }
    }

    return { show, kycStatus };
  } catch {
    return { show: false, kycStatus: "NOT_SUBMITTED" };
  }
}
