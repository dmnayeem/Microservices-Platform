import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/system-settings";

/**
 * The anti-fraud gates every AUTOMATIC approval must pass before it pays.
 *
 * Even when a submission qualifies for auto-approval, a person looks at it
 * first when:
 *  - the submitter's trust is below `antifraud.auto_approve_min_trust`
 *    (0 = off, no trust check);
 *  - it falls in the `antifraud.spot_check_percent` random sample;
 *  - (SOCIAL) its proof matched another member's (`fraudFlags`) — a flag on a
 *    claim that was already paid is read by nobody.
 *
 * Shared by the submit route and the social re-check job, so a submission the
 * re-check approves later is held by exactly the same rules as one approved at
 * submit. Returns the `heldForReview` reason to record, or null to go ahead.
 *
 * Call it ONCE per decision: the spot check draws a random number, and asking
 * twice would sample the same claim twice.
 */
export type AutoApproveHold = "low_trust" | "spot_check" | "duplicate_proof";

export async function autoApproveHold(opts: {
  userId: string;
  isSocial: boolean;
  fraudFlags: unknown;
}): Promise<AutoApproveHold | null> {
  const [minTrust, spotPct] = await Promise.all([
    getSetting<number>("antifraud.auto_approve_min_trust", 0),
    getSetting<number>("antifraud.spot_check_percent", 0),
  ]);
  if (minTrust > 0 || spotPct > 0) {
    const me = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { trustScore: true },
    });
    const lowTrust = minTrust > 0 && (me?.trustScore ?? 0) < minTrust;
    const spotChecked = spotPct > 0 && Math.random() * 100 < spotPct;
    if (lowTrust || spotChecked) return lowTrust ? "low_trust" : "spot_check";
  }
  if (
    opts.isSocial &&
    Array.isArray(opts.fraudFlags) &&
    opts.fraudFlags.length > 0
  ) {
    return "duplicate_proof";
  }
  return null;
}
