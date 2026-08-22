import { prisma } from "@/lib/prisma";
import { creditPoints } from "@/lib/ledger";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { TransactionType } from "@/generated/prisma";
import {
  parseEventTiers,
  type EventActionType,
  type EventTier,
} from "@/lib/events-shared";

/**
 * Events / quests (feature #10). Admin-authored, time-boxed challenges. Progress
 * is computed LIVE from existing activity tables (no action-site hooks needed),
 * except UPLOAD_PROOF which stores the user's uploaded proof. Users claim a
 * reward once they hit the threshold inside the window.
 *
 * Client-safe constants (labels, action-type union) live in ./events-shared.
 */

export type { EventActionType };

/**
 * The highest package `accessLevel` that exists. An event's `requiredAccessLevel`
 * is clamped to this on save so an admin can never gate an event ABOVE the top
 * real tier — which would make it invisible to every user (the classic "I made
 * an event but nobody sees it" bug). Returns 0 if there are no packages.
 */
export async function maxPackageAccessLevel(): Promise<number> {
  const agg = await prisma.package
    .aggregate({ _max: { accessLevel: true } })
    .catch(() => null);
  return agg?._max.accessLevel ?? 0;
}

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  actionType: EventActionType;
  threshold: number;
  rewardPoints: number;
  rewardXp: number;
  tiers: unknown;
  requiredAccessLevel: number;
  startAt: Date;
  endAt: Date;
  isActive: boolean;
}

/**
 * The ONE place progress is derived, shared by the list view and by `claimEvent`
 * so display and payout can never disagree.
 *
 * It is a plain field read. Progress is written forward-only by
 * `recordUserAction` (src/lib/goal-progress.ts) at the moment each action
 * happens.
 *
 * This replaced a `computeEventProgress()` that counted rows in shared activity
 * tables over `[event.startAt … now]`. With no per-user baseline, everything a
 * user had already done counted the instant an event was published — a user
 * could open a brand-new event and find the Claim button already green. It also
 * had no action filter, so "share your referral link" was satisfied by any feed
 * like. **Do not reintroduce a read-time count here.**
 */
export function progressFromRow(
  event: Pick<EventRow, "actionType" | "threshold">,
  row: { progress: number; proofUrl: string | null } | null | undefined
): number {
  // Proof events have no counter — uploading the proof IS the completion.
  if (event.actionType === "UPLOAD_PROOF") {
    return row?.proofUrl ? event.threshold : 0;
  }
  return row?.progress ?? 0;
}

export interface EventTierView extends EventTier {
  claimed: boolean;
  reached: boolean;
}

export interface EventView extends EventRow {
  progress: number;
  claimed: boolean;
  proofUrl: string | null;
  completable: boolean; // progress >= threshold and within window
  /** Non-empty when the event is multi-tier; each tier claims independently. */
  tierViews: EventTierView[];
}

/** Active, in-window events the user is eligible for, with live progress. */
export async function listEventsForUser(
  userId: string,
  accessLevel: number
): Promise<EventView[]> {
  const now = new Date();
  const events = (await prisma.event.findMany({
    where: {
      isActive: true,
      startAt: { lte: now },
      endAt: { gte: now },
      requiredAccessLevel: { lte: accessLevel },
    },
    orderBy: { endAt: "asc" },
    take: 100,
  })) as unknown as EventRow[];

  if (events.length === 0) return [];

  const progressRows = await prisma.userEventProgress.findMany({
    where: { userId, eventId: { in: events.map((e) => e.id) } },
    select: {
      eventId: true,
      claimedAt: true,
      proofUrl: true,
      progress: true,
      claimedTiers: true,
    },
  });
  const byEvent = new Map(progressRows.map((r) => [r.eventId, r]));

  const out: EventView[] = [];
  for (const e of events) {
    const row = byEvent.get(e.id);
    // No await in this loop any more — progress is a field, not a query.
    const progress = progressFromRow(e, row ?? null);
    const tiers = parseEventTiers(e.tiers);
    const claimedSet = new Set(row?.claimedTiers ?? []);
    const tierViews: EventTierView[] = tiers.map((t) => ({
      ...t,
      reached: progress >= t.threshold,
      claimed: claimedSet.has(t.threshold),
    }));
    out.push({
      ...e,
      progress,
      claimed: !!row?.claimedAt,
      proofUrl: row?.proofUrl ?? null,
      completable: progress >= e.threshold,
      tierViews,
    });
  }
  return out;
}

export type ClaimResult =
  | { ok: true; rewardPoints: number; rewardXp: number }
  | { ok: false; error: string };

/**
 * Claim an event's reward. For UPLOAD_PROOF, pass the uploaded proof URL (stored
 * + counts as progress=threshold). Idempotent: the ledger reference
 * `event_<eventId>` under the user's `@@unique([userId, reference])` blocks a
 * double claim, and `claimedAt` is set once.
 */
export async function claimEvent(
  userId: string,
  eventId: string,
  accessLevel: number,
  proofUrl?: string,
  tierThreshold?: number
): Promise<ClaimResult> {
  const event = (await prisma.event.findUnique({
    where: { id: eventId },
  })) as unknown as EventRow | null;
  if (!event || !event.isActive) return { ok: false, error: "Event not found." };

  const now = new Date();
  if (now < event.startAt || now > event.endAt) {
    return { ok: false, error: "This event isn't running right now." };
  }
  if (event.requiredAccessLevel > accessLevel) {
    return { ok: false, error: "Your plan can't join this event." };
  }

  const tiers = parseEventTiers(event.tiers);
  const existing = await prisma.userEventProgress.findUnique({
    where: { userId_eventId: { userId, eventId } },
    select: {
      id: true,
      claimedAt: true,
      progress: true,
      proofUrl: true,
      claimedTiers: true,
    },
  });

  let storedProof = existing?.proofUrl ?? null;
  if (event.actionType === "UPLOAD_PROOF") {
    const url = (proofUrl ?? storedProof ?? "").trim();
    if (!url) return { ok: false, error: "Upload your proof first." };
    storedProof = url;
  }
  // Same derivation the list view uses, so what the user sees and what gets
  // paid can't drift apart. Note the proof URL is passed through `storedProof`,
  // which may be the one supplied in THIS request.
  const progress = progressFromRow(event, {
    progress: existing?.progress ?? 0,
    proofUrl: storedProof,
  });

  // ── Multi-tier claim: claim one specific tier ──
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
    try {
      await prisma.$transaction(async (tx) => {
        // Claiming records WHAT WAS CLAIMED — never `progress`. That column is
        // the authoritative counter owned by recordUserAction; writing a
        // claim-time snapshot back into it would overwrite the real count.
        await tx.userEventProgress.upsert({
          where: { userId_eventId: { userId, eventId } },
          create: {
            userId,
            eventId,
            proofUrl: storedProof,
            claimedTiers: [tier.threshold],
          },
          update: {
            proofUrl: storedProof,
            claimedTiers: { push: tier.threshold },
          },
        });
        if (tier.rewardPoints > 0) {
          await creditPoints(tx, {
            userId,
            points: tier.rewardPoints,
            type: TransactionType.BONUS,
            description: `Event reward: ${event.title} (tier ${tier.threshold})`,
            reference: `event_${eventId}_tier${tier.threshold}`,
            metadata: { eventId, tier: tier.threshold },
          });
        }
        if (tier.rewardXp > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { xp: { increment: tier.rewardXp } },
          });
        }
      });
      return { ok: true, rewardPoints: tier.rewardPoints, rewardXp: tier.rewardXp };
    } catch (err) {
      if (isDuplicateLedgerError(err)) {
        return { ok: false, error: "You already claimed this tier." };
      }
      console.error("event tier claim failed:", err);
      return { ok: false, error: "Couldn't claim the reward. Try again." };
    }
  }

  // ── Single-target claim ──
  if (existing?.claimedAt) {
    return { ok: false, error: "You already claimed this event." };
  }
  if (progress < event.threshold) {
    return { ok: false, error: "You haven't reached the target yet." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      // As above: `progress` is never written here.
      await tx.userEventProgress.upsert({
        where: { userId_eventId: { userId, eventId } },
        create: {
          userId,
          eventId,
          proofUrl: storedProof,
          claimedAt: new Date(),
        },
        update: {
          proofUrl: storedProof,
          claimedAt: new Date(),
        },
      });
      if (event.rewardPoints > 0) {
        await creditPoints(tx, {
          userId,
          points: event.rewardPoints,
          type: TransactionType.BONUS,
          description: `Event reward: ${event.title}`,
          reference: `event_${eventId}`,
          metadata: { eventId, actionType: event.actionType },
        });
      }
      if (event.rewardXp > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { xp: { increment: event.rewardXp } },
        });
      }
    });
    return {
      ok: true,
      rewardPoints: event.rewardPoints,
      rewardXp: event.rewardXp,
    };
  } catch (err) {
    if (isDuplicateLedgerError(err)) {
      return { ok: false, error: "You already claimed this event." };
    }
    console.error("event claim failed:", err);
    return { ok: false, error: "Couldn't claim the reward. Try again." };
  }
}
