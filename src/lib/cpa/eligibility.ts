import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  matchesTaskAudience,
  taskAudienceWhere,
  type TaskAudience,
} from "@/lib/task-targeting";
import { TASK_VIEWER_SELECT, type TaskViewer } from "@/lib/task-visibility";
import { getSetting } from "@/lib/system-settings";
import {
  CPA_RETRY_DEFAULT_HOURS,
  CPA_RETRY_SETTING_KEY,
  clampCpaRetryHours,
  cpaRetryState,
} from "@/lib/cpa/retry";

/**
 * Who may see and start a CPA offer.
 *
 * An offer is open to a user when ALL of these hold:
 *   - it is ACTIVE;
 *   - the user is in its audience (the task targeting rules, STRICT — the
 *     offer carries the same nine columns as Task, so the same code decides);
 *   - neither cap is reached (total conversions, conversions today);
 *   - the user has no conversion on it yet (one per user per offer — also a
 *     unique index, this is only the friendly early answer) — EXCEPT a
 *     REJECTED one whose retry wait (`cpa.retry_after_hours`, default 24h) is
 *     over: that one may be tried again (the row is reused). Within the wait
 *     the answer is RETRY_LATER with the time it opens. APPROVED, HELD,
 *     PENDING and REVERSED stay final (ALREADY).
 */

/** The admin's retry wait after a rejection, in whole hours (0–720). */
export async function getCpaRetryHours(): Promise<number> {
  return clampCpaRetryHours(await getSetting<number>(CPA_RETRY_SETTING_KEY, CPA_RETRY_DEFAULT_HOURS));
}

export const CPA_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type CpaOfferStatus = (typeof CPA_STATUSES)[number];

export const CPA_CONVERSION_STATUSES = [
  "PENDING",
  "HELD",
  "APPROVED",
  "REJECTED",
  "REVERSED",
] as const;
export type CpaConversionStatus = (typeof CPA_CONVERSION_STATUSES)[number];

/** Statuses that count against the daily cap (a rejection frees its slot). */
export const CPA_COUNTED_STATUSES: CpaConversionStatus[] = ["PENDING", "HELD", "APPROVED"];

/** Viewer columns the audience check reads, plus what the click snapshot needs. */
export const CPA_VIEWER_SELECT = {
  ...TASK_VIEWER_SELECT,
  username: true,
  status: true,
} as const;

export type CpaViewer = TaskViewer & {
  id: string;
  username?: string | null;
  status?: string | null;
};

export async function loadCpaViewer(userId: string): Promise<CpaViewer | null> {
  return (await prisma.user.findUnique({
    where: { id: userId },
    select: CPA_VIEWER_SELECT,
  })) as CpaViewer | null;
}

/** Prisma filter: ACTIVE offers whose audience includes this viewer. */
export function cpaVisibleWhere(viewer: CpaViewer): Prisma.CpaOfferWhereInput {
  return {
    status: "ACTIVE",
    AND: taskAudienceWhere<Prisma.CpaOfferWhereInput>(viewer),
  };
}

/** UTC midnight — the day boundary the daily cap counts from. */
export function cpaDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export type CpaIneligibleReason =
  | "NOT_FOUND"
  | "INACTIVE"
  | "AUDIENCE"
  | "TOTAL_CAP"
  | "DAILY_CAP"
  | "ALREADY"
  | "RETRY_LATER";

export const CPA_REASON_MESSAGES: Record<CpaIneligibleReason, string> = {
  NOT_FOUND: "This offer doesn't exist.",
  INACTIVE: "This offer isn't available right now.",
  AUDIENCE: "This offer isn't available for your profile or location.",
  TOTAL_CAP: "This offer has reached its limit.",
  DAILY_CAP: "Today's limit for this offer is reached. Try again tomorrow.",
  ALREADY: "You've already done this offer.",
  RETRY_LATER: "This offer was rejected. You can try it again later.",
};

export interface CpaOfferGateFields extends TaskAudience {
  id: string;
  status: string;
  totalCap: number | null;
  dailyCap: number | null;
  conversionsCount: number;
}

/** The user's own conversion, as far as the gate cares. */
export interface CpaGateMine {
  status: string;
  reviewedAt: Date | string | null;
}

export type CpaGateResult =
  | { ok: true; retry: boolean }
  | { ok: false; reason: CpaIneligibleReason; retryAt?: Date };

/** Pure part of the gate — everything but the database counts. */
export function cpaGate(
  offer: CpaOfferGateFields,
  viewer: CpaViewer,
  ctx: { mine: CpaGateMine | null; todayCount: number; retryHours: number; now?: Date }
): CpaGateResult {
  let retry = false;
  if (ctx.mine) {
    if (ctx.mine.status !== "REJECTED") return { ok: false, reason: "ALREADY" };
    const r = cpaRetryState(ctx.mine, ctx.retryHours, ctx.now);
    if (!r.ready) return { ok: false, reason: "RETRY_LATER", retryAt: r.retryAt };
    retry = true;
  }
  if (offer.status !== "ACTIVE") return { ok: false, reason: "INACTIVE" };
  if (!matchesTaskAudience(offer, viewer)) return { ok: false, reason: "AUDIENCE" };
  if (offer.totalCap != null && offer.conversionsCount >= offer.totalCap) {
    return { ok: false, reason: "TOTAL_CAP" };
  }
  if (offer.dailyCap != null && ctx.todayCount >= offer.dailyCap) {
    return { ok: false, reason: "DAILY_CAP" };
  }
  return { ok: true, retry };
}

/** "…try again in 5h" — the RETRY_LATER sentence with the time left. */
export function cpaReasonMessage(g: { reason: CpaIneligibleReason; retryAt?: Date }, now = new Date()): string {
  if (g.reason === "RETRY_LATER" && g.retryAt) {
    const h = Math.max(1, Math.ceil((g.retryAt.getTime() - now.getTime()) / 3_600_000));
    return `This offer was rejected. You can try again in ${h}h.`;
  }
  return CPA_REASON_MESSAGES[g.reason];
}

/** Conversions today (non-rejected) for one offer. */
export async function cpaTodayCount(offerId: string, now = new Date()): Promise<number> {
  return prisma.cpaConversion.count({
    where: {
      offerId,
      status: { in: CPA_COUNTED_STATUSES },
      createdAt: { gte: cpaDayStart(now) },
    },
  });
}

/** Full eligibility check for one offer and one viewer. */
export async function checkCpaEligibility(
  offer: CpaOfferGateFields | null,
  viewer: CpaViewer
): Promise<CpaGateResult> {
  if (!offer) return { ok: false, reason: "NOT_FOUND" };
  const [existing, todayCount, retryHours] = await Promise.all([
    prisma.cpaConversion.findUnique({
      where: { offerId_userId: { offerId: offer.id, userId: viewer.id } },
      select: { status: true, reviewedAt: true },
    }),
    offer.dailyCap != null ? cpaTodayCount(offer.id) : Promise.resolve(0),
    getCpaRetryHours(),
  ]);
  return cpaGate(offer, viewer, { mine: existing, todayCount, retryHours });
}
