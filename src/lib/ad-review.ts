import "server-only";
import { NotificationType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notify";
import { buildAdvertiserReason } from "@/lib/ad-review-reasons";
import { ADMIN_ROLES, type UserRole } from "@/lib/rbac";
import { getConfiguredRolePermissions } from "@/lib/permissions";

/**
 * The ad review gate. This module is the ONLY place allowed to write
 * `Ad.status` — every advertiser and admin path funnels through it so a status
 * change can never skip the reviewer stamp, the AdReview trail, the audit log
 * or the advertiser notification.
 *
 * Why it exists: the advertiser PATCH route used to accept `status: "ACTIVE"`
 * with no check on the CURRENT status, and the campaign UI rendered a "resume"
 * button for any non-ACTIVE ad — so one click took a PENDING (or REJECTED) ad
 * live. `approvedAt` is what closes that hole: it records that a reviewed
 * creative exists, which "status === PAUSED" alone could never distinguish from
 * "never reviewed".
 */

export const AD_STATUS = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  INACTIVE: "INACTIVE",
  REJECTED: "REJECTED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
} as const;

export type AdStatus = (typeof AD_STATUS)[keyof typeof AD_STATUS];

/** Statuses an admin may set directly (everything else is a review decision). */
export const ADMIN_SETTABLE_STATUSES: AdStatus[] = [
  AD_STATUS.ACTIVE,
  AD_STATUS.PAUSED,
  AD_STATUS.INACTIVE,
];

/** Awaiting or blocked on a reviewer — never serves. */
export const IN_REVIEW_STATUSES: AdStatus[] = [
  AD_STATUS.PENDING,
  AD_STATUS.REJECTED,
  AD_STATUS.CHANGES_REQUESTED,
];

/**
 * Changing any of these re-opens review: they are what a reviewer actually
 * judged. Everything else (weight, size, pause/resume) is delivery tuning and
 * must never cost an advertiser their approval.
 */
export const MATERIAL_FIELDS = [
  "targetUrl",
  "contentUrl",
  "videoUrl",
  "htmlContent",
  "headline",
  "brandName",
  "brandLogo",
  "ctaLabel",
  "promotedPostId",
  "format",
  "type",
  "placementId",
  "adSlot",
  "adUnitPath",
  "adClient",
  "impressionPixel",
  "clickTracker",
  "rewardPoints",
  "targeting",
] as const;

export type MaterialField = (typeof MATERIAL_FIELDS)[number];

export class AdReviewError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 409, code = "INVALID_TRANSITION") {
    super(message);
    this.name = "AdReviewError";
    this.status = status;
    this.code = code;
  }
}

type AdRecord = Record<string, unknown>;

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === "object" || typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a) === String(b);
}

/** Material fields the patch would actually change (empty = nothing to review). */
export function materialChanges(before: AdRecord, patch: AdRecord): MaterialField[] {
  return MATERIAL_FIELDS.filter(
    (f) => f in patch && !sameValue(before[f], patch[f])
  );
}

export function isMaterialChange(before: AdRecord, patch: AdRecord): boolean {
  return materialChanges(before, patch).length > 0;
}

/**
 * Guard for an advertiser-initiated status change. Only pause/resume of an
 * already-approved ad is theirs to make.
 */
export function assertAdvertiserStatusChange(
  ad: { status: string; approvedAt: Date | null },
  next: string
): void {
  if (next === ad.status) return;

  if (ad.status === AD_STATUS.ACTIVE && next === AD_STATUS.PAUSED) return;
  if (ad.status === AD_STATUS.PAUSED && next === AD_STATUS.ACTIVE) {
    if (!ad.approvedAt) {
      throw new AdReviewError(
        "This ad hasn't been approved yet, so it can't be started.",
        409,
        "NOT_APPROVED"
      );
    }
    return;
  }

  if (ad.status === AD_STATUS.PENDING) {
    throw new AdReviewError(
      "This ad is still in review. You'll be notified as soon as an admin decides.",
      409,
      "IN_REVIEW"
    );
  }
  if (ad.status === AD_STATUS.REJECTED || ad.status === AD_STATUS.CHANGES_REQUESTED) {
    throw new AdReviewError(
      "This ad wasn't approved. Fix what the reviewer asked for and resubmit it for review.",
      409,
      "NEEDS_RESUBMIT"
    );
  }
  if (ad.status === AD_STATUS.INACTIVE) {
    throw new AdReviewError(
      "An admin has turned this ad off. Contact support if you think that's a mistake.",
      409,
      "ADMIN_LOCKED"
    );
  }
  throw new AdReviewError("That status change isn't allowed.");
}

// ── internals ────────────────────────────────────────────────────────────────

const SNAPSHOT_FIELDS = [
  ...MATERIAL_FIELDS,
  "size",
  "width",
  "height",
  "weight",
  "status",
] as const;

function snapshotOf(ad: AdRecord): Prisma.InputJsonValue {
  const out: Record<string, unknown> = {};
  for (const f of SNAPSHOT_FIELDS) if (ad[f] !== undefined) out[f] = ad[f];
  return JSON.parse(JSON.stringify(out)) as Prisma.InputJsonValue;
}

interface AdForReview {
  id: string;
  status: string;
  approvedAt: Date | null;
  submittedById: string | null;
  campaign: { title: string; advertiserId: string | null };
  [key: string]: unknown;
}

async function loadAd(adId: string): Promise<AdForReview> {
  const ad = await prisma.ad.findUnique({
    where: { id: adId },
    include: { campaign: { select: { title: true, advertiserId: true } } },
  });
  if (!ad) throw new AdReviewError("Ad not found.", 404, "NOT_FOUND");
  return ad as unknown as AdForReview;
}

/** The advertiser to notify: whoever submitted it, else the campaign owner. */
function advertiserOf(ad: AdForReview): string | null {
  return ad.submittedById ?? ad.campaign.advertiserId ?? null;
}

async function record(opts: {
  adId: string;
  actorId: string | null;
  action: string;
  reasonCodes?: string[];
  message?: string | null;
  internalNote?: string | null;
  snapshot?: Prisma.InputJsonValue;
}) {
  await prisma.adReview
    .create({
      data: {
        adId: opts.adId,
        actorId: opts.actorId,
        action: opts.action,
        reasonCodes: opts.reasonCodes ?? [],
        message: opts.message ?? null,
        internalNote: opts.internalNote ?? null,
        snapshot: opts.snapshot,
      },
    })
    .catch((e) => console.error("AdReview write failed:", e));
}

async function tellAdvertiser(
  ad: AdForReview,
  title: string,
  message: string,
  link = "/advertiser"
) {
  const userId = advertiserOf(ad);
  if (!userId) return;
  await notifyUser({
    userId,
    type: NotificationType.SYSTEM,
    title,
    message,
    link,
  }).catch(() => {});
}

/** Admins who can actually action the queue, so submissions don't sit unseen. */
async function reviewerIds(): Promise<string[]> {
  try {
    const cfg = await getConfiguredRolePermissions();
    const roles = ADMIN_ROLES.filter((r) => cfg[r]?.has("ads.manage"));
    if (roles.length === 0) return [];
    const admins = await prisma.user.findMany({
      where: { role: { in: roles as UserRole[] }, status: "ACTIVE" },
      select: { id: true },
      take: 25,
    });
    return admins.map((a) => a.id);
  } catch {
    return [];
  }
}

async function tellReviewers(title: string, message: string) {
  const ids = await reviewerIds();
  await Promise.all(
    ids.map((userId) =>
      notifyUser({
        userId,
        type: NotificationType.SYSTEM,
        title,
        message,
        link: "/admin/ads",
      }).catch(() => {})
    )
  );
}

// ── advertiser-side transitions ──────────────────────────────────────────────

/**
 * Called right after an advertiser creates ad rows. Stamps the submission trail
 * and pings the reviewers. `adIds` is every row of one multi-placement submit.
 */
export async function recordSubmission(opts: {
  adIds: string[];
  userId: string;
  campaignTitle: string;
  snapshot?: AdRecord;
}) {
  const snap = opts.snapshot ? snapshotOf(opts.snapshot) : undefined;
  await Promise.all(
    opts.adIds.map((adId) =>
      record({ adId, actorId: opts.userId, action: "SUBMITTED", snapshot: snap })
    )
  );
  await tellReviewers(
    "Ad awaiting review",
    `${opts.adIds.length} ad${opts.adIds.length > 1 ? "s" : ""} in "${opts.campaignTitle}" ${
      opts.adIds.length > 1 ? "are" : "is"
    } waiting for approval.`
  );
}

/**
 * Apply an advertiser edit. A material change sends the ad back to PENDING and
 * it stops serving until it is approved again; non-material tweaks (weight,
 * size, pause/resume) leave the review state alone.
 */
export async function applyAdvertiserEdit(opts: {
  adId: string;
  userId: string;
  patch: AdRecord;
}): Promise<{ status: string; requeued: boolean; changed: MaterialField[] }> {
  const ad = await loadAd(opts.adId);
  const patch = { ...opts.patch };

  const nextStatus = typeof patch.status === "string" ? patch.status : null;
  delete patch.status;

  const changed = materialChanges(ad, patch);
  const data: AdRecord = { ...patch };

  if (changed.length > 0) {
    data.status = AD_STATUS.PENDING;
    data.submittedAt = new Date();
    data.submittedById = opts.userId;
    data.reviewedById = null;
    data.reviewedAt = null;
    data.rejectionReason = null;
    data.rejectionCodes = [];
    data.reviewNote = null;
  } else if (nextStatus) {
    assertAdvertiserStatusChange(ad, nextStatus);
    data.status = nextStatus;
  }

  if (Object.keys(data).length === 0) {
    return { status: ad.status, requeued: false, changed: [] };
  }

  const updated = await prisma.ad.update({
    where: { id: opts.adId },
    data: data as Prisma.AdUncheckedUpdateInput,
    select: { status: true },
  });

  if (changed.length > 0) {
    await record({
      adId: opts.adId,
      actorId: opts.userId,
      action: "EDIT_SUBMITTED",
      message: `Edited: ${changed.join(", ")}`,
      snapshot: snapshotOf({ ...ad, ...patch }),
    });
    await tellReviewers(
      "Edited ad awaiting review",
      `An ad in "${ad.campaign.title}" was edited and needs approval again.`
    );
  }

  return { status: updated.status, requeued: changed.length > 0, changed };
}

/** REJECTED / CHANGES_REQUESTED → PENDING, at the advertiser's request. */
export async function resubmitAd(opts: { adId: string; userId: string }) {
  const ad = await loadAd(opts.adId);
  if (!IN_REVIEW_STATUSES.includes(ad.status as AdStatus)) {
    throw new AdReviewError("This ad isn't waiting on any changes.", 409, "NOT_RESUBMITTABLE");
  }
  if (ad.status === AD_STATUS.PENDING) {
    throw new AdReviewError("This ad is already in review.", 409, "IN_REVIEW");
  }

  await prisma.ad.update({
    where: { id: opts.adId },
    data: {
      status: AD_STATUS.PENDING,
      submittedAt: new Date(),
      submittedById: opts.userId,
      reviewedById: null,
      reviewedAt: null,
      rejectionReason: null,
      rejectionCodes: [],
      reviewNote: null,
    },
  });
  await record({ adId: opts.adId, actorId: opts.userId, action: "RESUBMITTED", snapshot: snapshotOf(ad) });
  await tellReviewers(
    "Ad resubmitted for review",
    `An ad in "${ad.campaign.title}" was fixed and resubmitted.`
  );
  return { status: AD_STATUS.PENDING };
}

// ── admin decisions ──────────────────────────────────────────────────────────

export async function approveAd(opts: {
  adId: string;
  actorId: string;
  edits?: AdRecord;
  internalNote?: string | null;
}) {
  const ad = await loadAd(opts.adId);
  const edits = opts.edits ?? {};
  const edited = materialChanges(ad, edits);
  const now = new Date();

  const updated = await prisma.ad.update({
    where: { id: opts.adId },
    data: {
      ...(edits as Prisma.AdUncheckedUpdateInput),
      status: AD_STATUS.ACTIVE,
      reviewedById: opts.actorId,
      reviewedAt: now,
      approvedAt: ad.approvedAt ?? now,
      rejectionReason: null,
      rejectionCodes: [],
      reviewNote: opts.internalNote ?? null,
    },
  });

  const action = edited.length > 0 ? "APPROVED_WITH_EDITS" : "APPROVED";
  await record({
    adId: opts.adId,
    actorId: opts.actorId,
    action,
    internalNote: opts.internalNote ?? null,
    message: edited.length > 0 ? `Reviewer edited: ${edited.join(", ")}` : null,
    snapshot: snapshotOf({ ...ad, ...edits }),
  });
  await tellAdvertiser(
    ad,
    "Ad approved ✅",
    edited.length > 0
      ? `Your ad in "${ad.campaign.title}" is approved and live (a reviewer adjusted: ${edited.join(", ")}).`
      : `Your ad in "${ad.campaign.title}" is approved and now live.`
  );
  await writeAudit({
    actorId: opts.actorId,
    action: edited.length > 0 ? "AD_APPROVED_WITH_EDITS" : "AD_APPROVED",
    entity: "Ad",
    entityId: opts.adId,
    targetUserId: advertiserOf(ad),
    summary: `Approved an ad in "${ad.campaign.title}"${edited.length ? ` (edited ${edited.join(", ")})` : ""}`,
    meta: { campaign: ad.campaign.title, edited },
  });

  return updated;
}

async function negativeDecision(opts: {
  adId: string;
  actorId: string;
  status: typeof AD_STATUS.REJECTED | typeof AD_STATUS.CHANGES_REQUESTED;
  reasonCodes: string[];
  message?: string | null;
  internalNote?: string | null;
}) {
  const codes = (opts.reasonCodes ?? []).filter(Boolean);
  const note = opts.message?.trim() || "";
  if (codes.length === 0 && !note) {
    throw new AdReviewError(
      "Pick at least one reason or write a note for the advertiser.",
      400,
      "REASON_REQUIRED"
    );
  }

  const ad = await loadAd(opts.adId);
  const advertiserText = buildAdvertiserReason(codes, note);
  const rejected = opts.status === AD_STATUS.REJECTED;

  const updated = await prisma.ad.update({
    where: { id: opts.adId },
    data: {
      status: opts.status,
      reviewedById: opts.actorId,
      reviewedAt: new Date(),
      rejectionReason: advertiserText,
      rejectionCodes: codes,
      reviewNote: opts.internalNote ?? null,
    },
  });

  await record({
    adId: opts.adId,
    actorId: opts.actorId,
    action: rejected ? "REJECTED" : "CHANGES_REQUESTED",
    reasonCodes: codes,
    message: advertiserText,
    internalNote: opts.internalNote ?? null,
    snapshot: snapshotOf(ad),
  });
  await tellAdvertiser(
    ad,
    rejected ? "Ad rejected" : "Ad needs changes",
    `Your ad in "${ad.campaign.title}" ${rejected ? "was rejected" : "needs changes"}: ${advertiserText}`
  );
  await writeAudit({
    actorId: opts.actorId,
    action: rejected ? "AD_REJECTED" : "AD_CHANGES_REQUESTED",
    entity: "Ad",
    entityId: opts.adId,
    targetUserId: advertiserOf(ad),
    summary: `${rejected ? "Rejected" : "Requested changes on"} an ad in "${ad.campaign.title}" — ${codes.join(", ") || note}`,
    meta: { campaign: ad.campaign.title, reasonCodes: codes, message: note },
  });

  return updated;
}

export function rejectAd(opts: {
  adId: string;
  actorId: string;
  reasonCodes: string[];
  message?: string | null;
  internalNote?: string | null;
}) {
  return negativeDecision({ ...opts, status: AD_STATUS.REJECTED });
}

export function requestChanges(opts: {
  adId: string;
  actorId: string;
  reasonCodes: string[];
  message?: string | null;
  internalNote?: string | null;
}) {
  return negativeDecision({ ...opts, status: AD_STATUS.CHANGES_REQUESTED });
}

/** Put any decided ad back in the queue — decisions must be reversible. */
export async function reopenForReview(opts: {
  adId: string;
  actorId: string;
  reason?: string | null;
}) {
  const ad = await loadAd(opts.adId);
  const updated = await prisma.ad.update({
    where: { id: opts.adId },
    data: {
      status: AD_STATUS.PENDING,
      submittedAt: ad.submittedAt instanceof Date ? ad.submittedAt : new Date(),
      reviewedById: null,
      reviewedAt: null,
      rejectionReason: null,
      rejectionCodes: [],
    },
  });
  await record({
    adId: opts.adId,
    actorId: opts.actorId,
    action: "REOPENED",
    internalNote: opts.reason ?? null,
    snapshot: snapshotOf(ad),
  });
  await writeAudit({
    actorId: opts.actorId,
    action: "AD_REOPENED",
    entity: "Ad",
    entityId: opts.adId,
    targetUserId: advertiserOf(ad),
    summary: `Reopened review for an ad in "${ad.campaign.title}"`,
    meta: { campaign: ad.campaign.title, reason: opts.reason ?? null },
  });
  return updated;
}

/**
 * Admin pause/resume/disable. Deliberately cannot reach ACTIVE on an ad that was
 * never approved — that path is `approveAd`, which stamps the reviewer.
 */
export async function adminSetStatus(opts: {
  adId: string;
  actorId: string;
  status: string;
}) {
  if (!ADMIN_SETTABLE_STATUSES.includes(opts.status as AdStatus)) {
    throw new AdReviewError(
      "Use approve / reject / request-changes to move an ad through review.",
      400,
      "USE_REVIEW_ACTION"
    );
  }
  const ad = await loadAd(opts.adId);
  if (opts.status === AD_STATUS.ACTIVE && !ad.approvedAt) {
    throw new AdReviewError(
      "This ad has never been approved — approve it instead of switching it on.",
      409,
      "NOT_APPROVED"
    );
  }
  const updated = await prisma.ad.update({
    where: { id: opts.adId },
    data: { status: opts.status },
  });
  await writeAudit({
    actorId: opts.actorId,
    action: "AD_STATUS_CHANGED",
    entity: "Ad",
    entityId: opts.adId,
    targetUserId: advertiserOf(ad),
    summary: `Set an ad in "${ad.campaign.title}" to ${opts.status}`,
    meta: { campaign: ad.campaign.title, from: ad.status, to: opts.status },
  });
  return updated;
}

/** Auto-pause from the lifecycle sweep (budget out, advertiser suspended…). */
export async function autoPauseAd(opts: { adId: string; reason: string }) {
  await prisma.ad.update({
    where: { id: opts.adId },
    data: { status: AD_STATUS.PAUSED },
  });
  await record({ adId: opts.adId, actorId: null, action: "AUTO_PAUSED", message: opts.reason });
}
