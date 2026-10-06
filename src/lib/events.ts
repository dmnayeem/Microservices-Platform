import { prisma } from "@/lib/prisma";
import { syncUserLevelQuietly } from "@/lib/level-sync";
import { creditPoints } from "@/lib/ledger";
import { isDuplicateLedgerError } from "@/lib/idempotency";
import { TransactionType } from "@/generated/prisma";
import { ownMediaKey } from "@/lib/media-url";
import { deliverToUser } from "@/lib/notify";
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
  row:
    | { progress: number; proofUrl: string | null; proofStatus?: string | null }
    | null
    | undefined
): number {
  // Proof events have no counter — an admin APPROVING the uploaded proof is the
  // completion. Uploading alone used to count, and any string was accepted as
  // a "proof", so typing anything into the request paid the reward.
  if (event.actionType === "UPLOAD_PROOF") {
    return row?.proofUrl && row.proofStatus === "APPROVED" ? event.threshold : 0;
  }
  return row?.progress ?? 0;
}

/** A proof must be a screenshot this user uploaded with our proof uploader. */
export function isOwnProofUpload(userId: string, url: string | null | undefined): boolean {
  return !!url && (ownMediaKey(url) ?? "").startsWith(`task-proofs/${userId}/`);
}

export interface EventTierView extends EventTier {
  claimed: boolean;
  reached: boolean;
}

export interface EventView extends EventRow {
  progress: number;
  claimed: boolean;
  proofUrl: string | null;
  /** UPLOAD_PROOF review state: null (nothing sent) | PENDING | APPROVED | REJECTED. */
  proofStatus: string | null;
  proofNote: string | null;
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
      proofStatus: true,
      proofNote: true,
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
      proofStatus: row?.proofStatus ?? null,
      proofNote: row?.proofNote ?? null,
      completable: progress >= e.threshold,
      tierViews,
    });
  }
  return out;
}

export type ClaimResult =
  | { ok: true; rewardPoints: number; rewardXp: number; pendingReview?: boolean }
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
      proofStatus: true,
      claimedTiers: true,
    },
  });

  // ── UPLOAD_PROOF: submitting sends the proof to an admin; nothing is paid
  // here. The reward is paid by reviewEventProof() on approval.
  if (event.actionType === "UPLOAD_PROOF") {
    if (existing?.claimedAt || existing?.proofStatus === "APPROVED") {
      return { ok: false, error: "You already claimed this event." };
    }
    if (existing?.proofStatus === "PENDING") {
      return { ok: false, error: "Your proof is already waiting for review." };
    }
    const url = (proofUrl ?? "").trim();
    if (!url) return { ok: false, error: "Upload your proof first." };
    if (!isOwnProofUpload(userId, url)) {
      return { ok: false, error: "Upload your proof with the uploader on this page." };
    }
    // Conditional: never overwrite a proof already under review or approved
    // (a concurrent second submit loses instead of replacing it).
    await prisma.userEventProgress.upsert({
      where: { userId_eventId: { userId, eventId } },
      create: { userId, eventId },
      update: {},
    });
    const sent = await prisma.userEventProgress.updateMany({
      where: {
        userId,
        eventId,
        claimedAt: null,
        OR: [{ proofStatus: null }, { proofStatus: "REJECTED" }],
      },
      data: {
        proofUrl: url,
        proofStatus: "PENDING",
        proofNote: null,
        proofReviewedAt: null,
        proofReviewedById: null,
      },
    });
    if (sent.count === 0) {
      return { ok: false, error: "Your proof is already waiting for review." };
    }
    return { ok: true, rewardPoints: 0, rewardXp: 0, pendingReview: true };
  }

  // Same derivation the list view uses, so what the user sees and what gets
  // paid can't drift apart.
  const progress = progressFromRow(event, {
    progress: existing?.progress ?? 0,
    proofUrl: existing?.proofUrl ?? null,
    proofStatus: existing?.proofStatus ?? null,
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
        //
        // Compare-and-set: the tier is pushed only if it is not already there.
        // The points ledger reference already blocked a double POINTS payout,
        // but an XP-only tier has no ledger row, so two concurrent claims both
        // added the XP.
        await tx.userEventProgress.upsert({
          where: { userId_eventId: { userId, eventId } },
          create: { userId, eventId },
          update: {},
        });
        const mark = await tx.userEventProgress.updateMany({
          where: { userId, eventId, NOT: { claimedTiers: { has: tier.threshold } } },
          data: { claimedTiers: { push: tier.threshold } },
        });
        if (mark.count === 0) throw new Error("ALREADY_CLAIMED");
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
      if (isDuplicateLedgerError(err) || (err instanceof Error && err.message === "ALREADY_CLAIMED")) {
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
      // As above: `progress` is never written here. `claimedAt` is set by a
      // compare-and-set on `claimedAt: null`, so an XP-only event (no ledger
      // row to collide on) can no longer be claimed twice by a double tap.
      await tx.userEventProgress.upsert({
        where: { userId_eventId: { userId, eventId } },
        create: { userId, eventId },
        update: {},
      });
      const mark = await tx.userEventProgress.updateMany({
        where: { userId, eventId, claimedAt: null },
        data: { claimedAt: new Date() },
      });
      if (mark.count === 0) throw new Error("ALREADY_CLAIMED");
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

    // Outside the transaction: the reward is committed and a level bump must
    // not be able to roll it back.
    await syncUserLevelQuietly(userId);

    return {
      ok: true,
      rewardPoints: event.rewardPoints,
      rewardXp: event.rewardXp,
    };
  } catch (err) {
    if (isDuplicateLedgerError(err) || (err instanceof Error && err.message === "ALREADY_CLAIMED")) {
      return { ok: false, error: "You already claimed this event." };
    }
    console.error("event claim failed:", err);
    return { ok: false, error: "Couldn't claim the reward. Try again." };
  }
}

export type ReviewResult =
  | { ok: true; status: "APPROVED" | "REJECTED"; rewardPoints: number; rewardXp: number }
  | { ok: false; error: string; status: number };

/**
 * Admin review of an UPLOAD_PROOF submission (POST /api/admin/events/proofs).
 *
 * Approve pays exactly what a normal claim pays, through the same path: the
 * `event_<eventId>` ledger reference under @@unique([userId, reference]) and
 * `claimedAt`. The flip PENDING → APPROVED is a compare-and-set, so two admins
 * approving at once pay once. Reject needs no money and leaves the user free
 * to upload a new proof.
 */
export async function reviewEventProof(
  adminId: string,
  eventId: string,
  userId: string,
  approve: boolean,
  note?: string | null
): Promise<ReviewResult> {
  const event = (await prisma.event.findUnique({
    where: { id: eventId },
  })) as unknown as EventRow | null;
  if (!event) return { ok: false, error: "Event not found.", status: 404 };
  if (event.actionType !== "UPLOAD_PROOF") {
    return { ok: false, error: "This event has no proof to review.", status: 400 };
  }
  const cleanNote = note?.trim() ? note.trim().slice(0, 500) : null;
  const now = new Date();

  if (!approve) {
    const r = await prisma.userEventProgress.updateMany({
      where: { userId, eventId, proofStatus: "PENDING", claimedAt: null },
      data: {
        proofStatus: "REJECTED",
        proofNote: cleanNote,
        proofReviewedAt: now,
        proofReviewedById: adminId,
      },
    });
    if (r.count === 0) return { ok: false, error: "This proof was already reviewed.", status: 409 };
    void deliverToUser({
      userId,
      title: "Event proof not accepted",
      message: `Your proof for "${event.title}" was not accepted${cleanNote ? `: ${cleanNote}` : "."} You can upload a new one while the event runs.`,
      link: "/events",
    });
    return { ok: true, status: "REJECTED", rewardPoints: 0, rewardXp: 0 };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const flip = await tx.userEventProgress.updateMany({
        where: { userId, eventId, proofStatus: "PENDING", claimedAt: null },
        data: {
          proofStatus: "APPROVED",
          proofNote: cleanNote,
          proofReviewedAt: now,
          proofReviewedById: adminId,
          claimedAt: now,
        },
      });
      if (flip.count === 0) throw new Error("ALREADY_REVIEWED");
      if (event.rewardPoints > 0) {
        await creditPoints(tx, {
          userId,
          points: event.rewardPoints,
          type: TransactionType.BONUS,
          description: `Event reward: ${event.title}`,
          reference: `event_${eventId}`,
          metadata: { eventId, actionType: event.actionType, reviewedBy: adminId },
        });
      }
      if (event.rewardXp > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { xp: { increment: event.rewardXp } },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "EVENT_PROOF_APPROVED",
          entity: "Event",
          entityId: eventId,
          targetUserId: userId,
          summary: `Approved event proof for "${event.title}"`,
          newData: { rewardPoints: event.rewardPoints, rewardXp: event.rewardXp, note: cleanNote },
        },
      });
    });
  } catch (err) {
    if ((err instanceof Error && err.message === "ALREADY_REVIEWED") || isDuplicateLedgerError(err)) {
      return { ok: false, error: "This proof was already reviewed.", status: 409 };
    }
    throw err;
  }
  await syncUserLevelQuietly(userId);
  void deliverToUser({
    userId,
    title: "Event reward paid",
    message: `Your proof for "${event.title}" was approved — +${event.rewardPoints} points${event.rewardXp ? ` / +${event.rewardXp} XP` : ""}.`,
    link: "/events",
  });
  return { ok: true, status: "APPROVED", rewardPoints: event.rewardPoints, rewardXp: event.rewardXp };
}
