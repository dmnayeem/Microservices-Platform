import "server-only";
import { prisma } from "@/lib/prisma";
import { creditPoints } from "@/lib/ledger";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { TransactionType } from "@/generated/prisma";
import { parseEventTiers, type EventTier } from "@/lib/events-shared";
import type { EventActionType } from "@/lib/events-shared";
import {
  matchesTaskAudience,
  type TaskAudience,
  type TaskAudienceUser,
} from "@/lib/task-targeting";

/**
 * Missions — the middle of the platform's three goal systems.
 *
 *  - **Daily Missions** (`DailyMissionTemplate`): do today's tasks properly.
 *    Resets at the user's local midnight; feeds the referral day-claim.
 *  - **Missions** (this): a large reward that takes real effort, with tiers and
 *    an unlock chain, so finishing one pulls the user into the next.
 *  - **Events**: time-boxed marketing pushes.
 *
 * The three are deliberately separate products but share ONE progress engine
 * (src/lib/goal-progress.ts), so an action is counted once, by one dedup rule.
 *
 * Missions were previously admin CRUD with **no reader at all** — no user page,
 * no progress table, no claim route, and five `type` values that nothing ever
 * evaluated. This module is the missing half.
 */

export interface MissionRow {
  id: string;
  title: string;
  description: string | null;
  iconEmoji: string | null;
  actionType: EventActionType;
  targetValue: number;
  tiers: unknown;
  pointsReward: number;
  xpReward: number;
  requiredLevel: number;
  requiredAccessLevel: number;
  startAt: Date | null;
  endAt: Date | null;
  order: number;
  unlockMissionId: string | null;
  isActive: boolean;
}

export interface MissionTierView extends EventTier {
  claimed: boolean;
  reached: boolean;
}

export interface MissionView extends MissionRow {
  progress: number;
  claimed: boolean;
  completable: boolean;
  tierViews: MissionTierView[];
  /** Set when a prerequisite mission hasn't been claimed yet. */
  lockedBy: { id: string; title: string } | null;
}

/** The viewer fields mission eligibility reads. */
export interface MissionViewer extends TaskAudienceUser {
  id: string;
  level?: number | null;
}

/**
 * Is this mission open to this viewer at all?
 *
 * Shared by the list and by `claimMission`, so what a user is shown and what
 * they can be paid for can never disagree. Targeting is checked in memory
 * against the discrete columns (same STRICT rule as tasks and boards).
 */
export function missionEligible(
  m: MissionRow & TaskAudience,
  viewer: MissionViewer,
  accessLevel: number,
  now: Date = new Date()
): boolean {
  if (!m.isActive) return false;
  if (m.startAt && now < m.startAt) return false;
  if (m.endAt && now > m.endAt) return false;
  if ((viewer.level ?? 1) < m.requiredLevel) return false;
  if (accessLevel < m.requiredAccessLevel) return false;
  return matchesTaskAudience(m, viewer);
}

const MISSION_TAKE = 100;

/** Active missions the viewer is eligible for, with their real progress. */
export async function listMissionsForUser(
  viewer: MissionViewer,
  accessLevel: number
): Promise<MissionView[]> {
  const now = new Date();
  const rows = await prisma.mission.findMany({
    where: {
      isActive: true,
      OR: [{ startAt: null }, { startAt: { lte: now } }],
      AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
    },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    take: MISSION_TAKE,
  });

  // Targeting + level + plan, in memory: the rows are already bounded at 100 and
  // this keeps the eligibility rule in ONE function shared with the claim path.
  const eligible = rows.filter((m) => missionEligible(m, viewer, accessLevel, now));
  if (eligible.length === 0) return [];

  const progressRows = await prisma.userMissionProgress.findMany({
    where: { userId: viewer.id },
    select: {
      missionId: true,
      progress: true,
      claimedAt: true,
      claimedTiers: true,
    },
  });
  const byMission = new Map(progressRows.map((r) => [r.missionId, r]));

  // A prerequisite counts as satisfied once its reward has been claimed.
  const claimedIds = new Set(
    progressRows.filter((r) => r.claimedAt).map((r) => r.missionId)
  );
  const unlockIds = [
    ...new Set(eligible.map((m) => m.unlockMissionId).filter(Boolean) as string[]),
  ];
  const unlockTitles = unlockIds.length
    ? await prisma.mission.findMany({
        where: { id: { in: unlockIds } },
        select: { id: true, title: true },
      })
    : [];
  const titleById = new Map(unlockTitles.map((u) => [u.id, u]));

  return eligible.map((m) => {
    const row = byMission.get(m.id);
    const progress = row?.progress ?? 0;
    const tiers = parseEventTiers(m.tiers);
    const claimedSet = new Set(row?.claimedTiers ?? []);
    return {
      ...m,
      progress,
      claimed: !!row?.claimedAt,
      completable: progress >= m.targetValue,
      tierViews: tiers.map((t) => ({
        ...t,
        reached: progress >= t.threshold,
        claimed: claimedSet.has(t.threshold),
      })),
      lockedBy:
        m.unlockMissionId && !claimedIds.has(m.unlockMissionId)
          ? titleById.get(m.unlockMissionId) ?? null
          : null,
    };
  });
}

export type MissionClaimResult =
  | { ok: true; rewardPoints: number; rewardXp: number }
  | { ok: false; error: string };

/**
 * Claim a mission reward.
 *
 * Idempotent by the ledger reference under `Transaction @@unique([userId,
 * reference])` — that constraint, not the `claimedAt` check, is what makes a
 * double claim impossible under concurrency.
 */
export async function claimMission(
  viewer: MissionViewer,
  missionId: string,
  accessLevel: number,
  tierThreshold?: number
): Promise<MissionClaimResult> {
  const mission = await prisma.mission.findUnique({ where: { id: missionId } });
  if (!mission) return { ok: false, error: "Mission not found." };

  // Re-checked here rather than trusted from the list — this route pays out.
  if (!missionEligible(mission, viewer, accessLevel)) {
    return { ok: false, error: "This mission isn't available to you." };
  }

  const existing = await prisma.userMissionProgress.findUnique({
    where: { userId_missionId: { userId: viewer.id, missionId } },
    select: { progress: true, claimedAt: true, claimedTiers: true },
  });

  // Prerequisite chain — the unlocking mission must have been CLAIMED.
  if (mission.unlockMissionId) {
    const prereq = await prisma.userMissionProgress.findUnique({
      where: {
        userId_missionId: { userId: viewer.id, missionId: mission.unlockMissionId },
      },
      select: { claimedAt: true },
    });
    if (!prereq?.claimedAt) {
      return { ok: false, error: "Finish the previous mission first." };
    }
  }

  const progress = existing?.progress ?? 0;
  const tiers = parseEventTiers(mission.tiers);

  // ── Multi-tier: each tier claims independently ──
  if (tiers.length > 0) {
    const tier =
      tierThreshold != null
        ? tiers.find((t) => t.threshold === tierThreshold)
        : undefined;
    if (!tier) return { ok: false, error: "Pick a valid tier to claim." };
    if ((existing?.claimedTiers ?? []).includes(tier.threshold)) {
      return { ok: false, error: "You already claimed this tier." };
    }
    if (progress < tier.threshold) {
      return { ok: false, error: "You haven't reached this tier yet." };
    }
    return runClaim(
      viewer.id,
      missionId,
      tier.rewardPoints,
      tier.rewardXp,
      `Mission reward: ${mission.title} (tier ${tier.threshold})`,
      `mission_${missionId}_tier${tier.threshold}`,
      { tier: tier.threshold },
      // The LAST tier also finishes the mission, which is what unlocks the next
      // one in the chain. Without this a tiered mission could never be a
      // prerequisite for anything.
      tier.threshold === tiers[tiers.length - 1].threshold
    );
  }

  // ── Single-target ──
  if (existing?.claimedAt) {
    return { ok: false, error: "You already claimed this mission." };
  }
  if (progress < mission.targetValue) {
    return { ok: false, error: "You haven't reached the target yet." };
  }
  return runClaim(
    viewer.id,
    missionId,
    mission.pointsReward,
    mission.xpReward,
    `Mission reward: ${mission.title}`,
    `mission_${missionId}`,
    { actionType: mission.actionType },
    true
  );
}

async function runClaim(
  userId: string,
  missionId: string,
  points: number,
  xp: number,
  description: string,
  reference: string,
  metadata: Record<string, unknown>,
  markComplete: boolean
): Promise<MissionClaimResult> {
  try {
    await prisma.$transaction(async (tx) => {
      // Claiming records WHAT WAS CLAIMED — never `progress`. That column is the
      // authoritative counter owned by goal-progress.ts; writing a claim-time
      // snapshot back into it would overwrite the real count.
      await tx.userMissionProgress.upsert({
        where: { userId_missionId: { userId, missionId } },
        create: {
          userId,
          missionId,
          ...(metadata.tier != null
            ? { claimedTiers: [metadata.tier as number] }
            : {}),
          ...(markComplete ? { claimedAt: new Date() } : {}),
        },
        update: {
          ...(metadata.tier != null
            ? { claimedTiers: { push: metadata.tier as number } }
            : {}),
          ...(markComplete ? { claimedAt: new Date() } : {}),
        },
      });
      if (points > 0) {
        await creditPoints(tx, {
          userId,
          points,
          type: TransactionType.BONUS,
          description,
          reference,
          metadata: { missionId, ...metadata },
        });
      }
      if (xp > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { xp: { increment: xp } },
        });
      }
    });
    return { ok: true, rewardPoints: points, rewardXp: xp };
  } catch (err) {
    if (isDuplicateLedgerError(err)) {
      return { ok: false, error: "You already claimed this reward." };
    }
    console.error("mission claim failed:", err);
    return { ok: false, error: "Couldn't claim the reward. Try again." };
  }
}
