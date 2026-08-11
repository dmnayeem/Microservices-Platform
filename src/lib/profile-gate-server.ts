import { prisma } from "@/lib/prisma";
import { getUiToggles } from "@/lib/ui-toggles-server";
import {
  isProfileComplete,
  requiredProfileProgress,
  UNLOCK_REQUIRED,
  type RequiredSnapshot,
  type RequiredProgress,
} from "@/lib/profile-completion";

export interface ProfileGateState {
  /** Admin toggle is ON. */
  required: boolean;
  /** Core essentials are all filled. */
  complete: boolean;
  /** required && !complete — block Tasks/Missions and show the gate. */
  locked: boolean;
  progress: RequiredProgress;
}

const OPEN: ProfileGateState = {
  required: false,
  complete: true,
  locked: false,
  progress: {
    done: UNLOCK_REQUIRED.length,
    total: UNLOCK_REQUIRED.length,
    percentage: 100,
    complete: true,
    missing: [],
  },
};

/**
 * Resolve the profile-completion gate for a user. When the admin toggle is OFF
 * (the default) this short-circuits with no extra DB query.
 */
export async function getProfileGateState(
  userId: string
): Promise<ProfileGateState> {
  const { requireProfileCompletion } = await getUiToggles();
  if (!requireProfileCompletion) return OPEN;

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        avatar: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        country: true,
        phone: true,
      },
    });
  } catch {
    // Fail-open on a DB blip — don't crash/lock the page.
    return OPEN;
  }
  const snap: RequiredSnapshot = user ?? {};
  const progress = requiredProfileProgress(snap);
  const complete = isProfileComplete(snap);
  return {
    required: true,
    complete,
    locked: !complete,
    progress,
  };
}
